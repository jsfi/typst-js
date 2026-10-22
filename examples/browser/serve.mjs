// Serves the example, pkg/ and the sources of @jsfi/typst-fields on http://localhost, the directories of
// the repository the page and its service worker load (service workers need HTTPS or localhost). No
// dependencies:
//
//   node examples/browser/serve.mjs [port]   or   npm run example
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.argv[2] ?? process.env.PORT ?? 8000);

const types = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.json': 'application/json',
	'.wasm': 'application/wasm',
	'.svg': 'image/svg+xml',
	'.otf': 'font/otf',
	'.ttf': 'font/ttf',
	'.typ': 'text/plain; charset=utf-8',
	'.bib': 'text/plain; charset=utf-8',
};

const PAGE = '/examples/browser/';
/** The service worker, which the server stamps with the code it imports (see `stampedWorker`). */
const WORKER = join(root, 'examples/browser/service-worker.js');

/**
 * The directories of the modules the worker imports, besides the bindings in pkg/. Of pkg/, the
 * worker imports only the bindings; the WebAssembly and the fonts it fetches itself, checking the
 * server for newer ones, so they need no stamp, though they are served.
 */
const WORKER_IMPORTS = ['examples/browser', 'packages/typst-fields/src'];

/** The directories served, each with its separator, so that `/pkg-other` is not inside `/pkg`. */
const served = [...WORKER_IMPORTS, 'pkg'].map((directory) => join(root, directory) + sep);

/**
 * The worker's source with a last line that fingerprints the code it imports: every file's name,
 * size and time of change, so that adding, changing or removing one changes the line. Browsers find
 * an update by comparing a module worker's own script, not the modules it imports, so a change to
 * those has to change the script too; else the page keeps compiling with the old code.
 */
async function stampedWorker() {
	const listed = await Promise.all(
		WORKER_IMPORTS.map(async (directory) =>
			(await readdir(join(root, directory), { recursive: true }))
				.filter((name) => name.endsWith('.js'))
				.map((name) => join(directory, name)),
		),
	);
	const files = [...listed.flat(), 'pkg/typst_wasm.js'].sort((a, b) => a.localeCompare(b));
	const lines = await Promise.all(
		files.map(async (file) => {
			const info = await stat(join(root, file)).catch(() => undefined);
			return `${file} ${info?.size} ${info?.mtimeMs}`;
		}),
	);
	const fingerprint = createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16);
	const stamp = `\n// The code it imports, fingerprinted: ${fingerprint}\n`;
	return Buffer.concat([await readFile(WORKER), Buffer.from(stamp)]);
}

/** Answers a request: a file of the example or of pkg/, a redirect to the page, or an error. */
async function handle(request, response) {
	const reply = (status, text, headers = {}) =>
		response.writeHead(status, { 'Content-Type': 'text/plain', ...headers }).end(text);
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		reply(405, 'Method not allowed', { Allow: 'GET, HEAD' });
		return;
	}
	// Only a path, as browsers send it; an absolute URL as the target would name another host.
	if (!request.url.startsWith('/')) {
		reply(400, 'Bad request');
		return;
	}
	let path;
	try {
		path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
	} catch {
		reply(400, 'Bad request');
		return;
	}
	if (path === '/' || path === PAGE.slice(0, -1)) {
		// The query keeps a link's `?example=`.
		reply(302, '', { Location: PAGE + new URL(request.url, 'http://localhost').search });
		return;
	}
	const file = normalize(join(root, path.endsWith('/') ? `${path}index.html` : path));
	const info = served.some((directory) => file.startsWith(directory))
		? await stat(file).catch(() => undefined)
		: undefined;
	if (!info?.isFile()) {
		reply(404, 'Not found');
		return;
	}
	const body = file === WORKER ? await stampedWorker() : undefined;
	response.writeHead(200, {
		'Content-Type': types[extname(file)] ?? 'application/octet-stream',
		'Content-Length': body?.length ?? info.size,
		'Last-Modified': info.mtime.toUTCString(),
		// Revalidated on every load, so that a rebuilt pkg/ or an edited example shows at once.
		'Cache-Control': 'no-cache',
	});
	if (request.method === 'HEAD') {
		response.end();
		return;
	}
	if (body) response.end(body);
	else createReadStream(file).pipe(response);
}

// `localhost` may resolve to either loopback address, so the server listens on both.
for (const host of ['127.0.0.1', '::1']) {
	createServer(handle)
		.on('error', (error) => console.warn(`Not serving on ${host}: ${error.message}`))
		.listen(port, host);
}
console.log(`Serving the example at http://localhost:${port}${PAGE}`);
