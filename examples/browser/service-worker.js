// Compiles Typst inside a service worker. The page posts a source to `compile` and gets the PDF or the
// SVG pages back as the response, so the page itself never loads WebAssembly.
//
// The worker caches the module, the fonts and the files the examples read, so later visits load them
// from the cache instead of the network; a file the server reports changed is fetched again. One
// compiler lives as long as the worker, so a recompile after an edit reuses what Typst already laid
// out. The browser may stop an idle worker at any time; the next request then sets the compiler up
// again.
//
// It imports the bindings as an ES module, so it is registered as a module service worker; the
// README's Limits name the browsers that support one.

import init, { Compiler } from '../../pkg/typst_wasm.js';
import {
	CLAIM,
	COMPILE_PATH,
	compileRequest,
	jsonAnswer,
	MAIN_PATH,
	MODULE_PATH,
	pdfAnswer,
	PROJECT_FILES,
	SOURCE_ERRORS,
} from './protocol.js';

const CACHE = 'typst-js-example';
const PACKAGE = new URL('../../pkg/', import.meta.url);
const MODULE = new URL(MODULE_PATH, import.meta.url);
/** The names of Typst's default fonts, which build.sh lists beside them. */
const FONT_INDEX = new URL('fonts/index.json', PACKAGE);
const COMPILE = new URL(COMPILE_PATH, import.meta.url);
/** The project files besides the source, by their path in the compiler's project. */
const ASSETS = Object.fromEntries(
	Object.entries(PROJECT_FILES).map(([path, file]) => [path, new URL(file, import.meta.url)]),
);

self.addEventListener('install', (event) => {
	event.waitUntil(files().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((names) =>
				Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))),
			)
			.then(() => self.clients.claim()),
	);
});

self.addEventListener('message', (event) => {
	if (event.data === CLAIM) event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	if (event.request.method === 'POST' && url.href === COMPILE.href) {
		event.respondWith(compile(event.request));
	}
});

/** The compiler, once it is set up; set up on first use. */
let compilerReady;

function ready() {
	compilerReady ??= (async () => {
		const { module, fonts, assets } = await files();
		await init({ module_or_path: module });
		const compiler = new Compiler();
		for (const font of fonts) compiler.addFont(await bytes(font));
		for (const [path, response] of Object.entries(assets))
			compiler.addFile(path, await bytes(response));
		return compiler;
	})().catch((error) => {
		compilerReady = undefined;
		throw error;
	});
	return compilerReady;
}

/** The module, the fonts and the assets, each from the cache unless the server has a newer file. */
async function files() {
	const cache = await caches.open(CACHE);
	const fontNames = await (await current(cache, FONT_INDEX)).json();
	const [module, fonts, assets] = await Promise.all([
		current(cache, MODULE),
		Promise.all(fontNames.map((name) => current(cache, new URL(`fonts/${name}`, PACKAGE)))),
		Promise.all(Object.values(ASSETS).map((url) => current(cache, url))),
	]);
	return {
		module,
		fonts,
		assets: Object.fromEntries(Object.keys(ASSETS).map((path, i) => [path, assets[i]])),
	};
}

/**
 * The cached response for `url`, unless the server reports a different file (another size or
 * modification time), which is then fetched and cached. Without the server, the cached one.
 */
async function current(cache, url) {
	const cached = await cache.match(url);
	try {
		const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
		const unchanged = ['Content-Length', 'Last-Modified'].every(
			(header) => head.headers.get(header) === cached?.headers.get(header),
		);
		if (cached && unchanged) return cached;
		const response = await fetch(url, { cache: 'no-store' });
		if (!response.ok) throw new Error(`${url} answered ${response.status}`);
		await cache.put(url, response.clone());
		return response;
	} catch (error) {
		if (cached) return cached;
		throw error;
	}
}

async function bytes(response) {
	return new Uint8Array(await response.clone().arrayBuffer());
}

/**
 * Answers a PDF request with the PDF and its warnings, an SVG request with JSON of the pages, a
 * query with JSON of its value, and a source with errors with status 422 and the diagnostics.
 * `inputs` become the document's `sys.inputs`.
 */
async function compile(request) {
	try {
		const { source, format, tagged, inputs, selector, field, one } = compileRequest(
			await request.json(),
		);
		const typst = await ready();
		// The one compiler serves every request, so each one sets everything it depends on.
		typst.setInputs(inputs);
		typst.addFile(MAIN_PATH, new TextEncoder().encode(source));
		typst.setMain(MAIN_PATH);

		if (format === 'query') return answerQuery(typst, selector, { field, one });
		if (format === 'svg') return answerSvg(typst);
		return answerPdf(typst, tagged);
	} catch (error) {
		return jsonAnswer({ error: String(error?.message ?? error) }, 500);
	}
}

function answerQuery(typst, selector, options) {
	return withResult(typst.query(selector, options), ({ value, diagnostics }) =>
		jsonAnswer({ value, diagnostics }, value === undefined ? SOURCE_ERRORS : 200),
	);
}

function answerSvg(typst) {
	return timed(
		() => typst.compileSvg(),
		({ svg, diagnostics }, milliseconds) =>
			jsonAnswer({ svg, diagnostics, milliseconds }, svg ? 200 : SOURCE_ERRORS),
	);
}

function answerPdf(typst, tagged) {
	return timed(
		() => typst.compilePdf({ tagged }),
		({ pdf, diagnostics }, milliseconds) =>
			pdf
				? pdfAnswer(pdf, diagnostics, milliseconds)
				: jsonAnswer({ diagnostics, milliseconds }, SOURCE_ERRORS),
	);
}

/** The answer `answer` builds from what `run` returns and how long it took. */
function timed(run, answer) {
	const started = performance.now();
	const result = run();
	const milliseconds = Math.round(performance.now() - started);
	return withResult(result, (plain) => answer(plain, milliseconds));
}

/**
 * The answer `answer` builds from the fields of the module's `result`, with plain diagnostics; the
 * result is released afterwards.
 */
function withResult(result, answer) {
	try {
		return answer({
			pdf: result.pdf,
			svg: result.svg,
			value: result.value,
			diagnostics: plainDiagnostics(result.diagnostics),
		});
	} finally {
		result.free();
	}
}

/** The diagnostics as plain objects for JSON, the module's own released. */
function plainDiagnostics(diagnostics) {
	return diagnostics.map((diagnostic) => {
		const plain = diagnostic.toJSON();
		diagnostic.free();
		return plain;
	});
}
