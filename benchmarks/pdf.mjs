// Compiles benchmarks/tables.typ to PDF, tagged and untagged, with @jsfi/typst-wasm, with
// @jsfi/typst-cli and with the typst program on one thread, and prints the median time and the PDF's
// size of each as the table in the README's Measurements. All three use the fonts the module ships.
// Every run is a process of its own, so that no run profits from another's memoized work.
//
//   npm run bench [-- --runs 5]
//
// Needs `./build.sh` and `npm install` first, and a typst program on the PATH.

import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { cpus, platform, release, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const document = new URL('tables.typ', import.meta.url);
const fontDirectory = new URL('./', import.meta.resolve('@jsfi/typst-wasm/fonts/index.json'));
const fonts = JSON.parse(readFileSync(new URL('index.json', fontDirectory), 'utf8')).map((name) =>
	readFileSync(new URL(name, fontDirectory)),
);
/** The pages the document has to have, so that numbers from different versions compare. */
const PAGES = 100;
/** A fixed creation date, so that every PDF of a case has the same bytes. */
const TIMESTAMP = 0;

/**
 * The ways to compile, by name: each compiles the document once in this process and returns how
 * long the compilation took, in milliseconds, and the PDF.
 */
const runners = {
	/** The module, compiled before the clock starts. */
	async wasm(tagged) {
		const wasm = await import('@jsfi/typst-wasm');
		wasm.initSync({
			module: readFileSync(new URL(import.meta.resolve('@jsfi/typst-wasm/typst_wasm_bg.wasm'))),
		});
		return timeCompiler(new wasm.Compiler(), tagged);
	},

	/** The CLI package: the project written to disk, and the typst program on all cores. */
	async cli(tagged) {
		const cli = await import('@jsfi/typst-cli');
		cli.initSync({ ignoreEmbeddedFonts: true });
		return timeCompiler(new cli.Compiler(), tagged);
	},

	/** The typst program on one thread, as the module runs, started when the clock starts. */
	typst(tagged) {
		const output = join(tmpdir(), `jsfi-typst-bench-${process.pid}.pdf`);
		const started = performance.now();
		const run = spawnSync(
			'typst',
			[
				'compile',
				fileURLToPath(document),
				output,
				'--jobs=1',
				`--creation-timestamp=${TIMESTAMP}`,
				'--ignore-system-fonts',
				'--ignore-embedded-fonts',
				`--font-path=${fileURLToPath(fontDirectory)}`,
				...(tagged ? [] : ['--no-pdf-tags']),
			],
			{ encoding: 'utf8' },
		);
		const ms = performance.now() - started;
		if (run.status !== 0) throw new Error(`typst failed:\n${run.stderr}`);
		const pdf = readFileSync(output);
		rmSync(output);
		return { ms, pdf };
	},
};

const labels = {
	wasm: '`@jsfi/typst-wasm`',
	cli: '`@jsfi/typst-cli`, all cores',
	typst: '`typst compile --jobs 1`',
};

/** Compiles the document with `compiler`, a module's or the CLI package's, and times it. */
function timeCompiler(compiler, tagged) {
	for (const font of fonts) compiler.addFont(font);
	compiler.addFile('/tables.typ', readFileSync(document));
	compiler.setMain('/tables.typ');
	const started = performance.now();
	const { pdf, diagnostics } = compiler.compilePdf({ tagged, timestamp: TIMESTAMP });
	const ms = performance.now() - started;
	if (!pdf) throw new Error(`compilation failed:\n${diagnostics.join('\n')}`);
	return { ms, pdf };
}

/** Throws unless the document has its 100 pages, checked with the module. */
async function checkPages() {
	const wasm = await import('@jsfi/typst-wasm');
	wasm.initSync({
		module: readFileSync(new URL(import.meta.resolve('@jsfi/typst-wasm/typst_wasm_bg.wasm'))),
	});
	const compiler = new wasm.Compiler();
	for (const font of fonts) compiler.addFont(font);
	compiler.addFile('/tables.typ', readFileSync(document));
	compiler.setMain('/tables.typ');
	const { value } = compiler.query('<page-count>', { field: 'value', one: true });
	if (value !== PAGES) throw new Error(`tables.typ has ${value} pages instead of ${PAGES}.`);
}

/** One run in a process of its own: `{ ms, bytes }`. */
function runOnce(runner, tagged) {
	const child = spawnSync(
		process.execPath,
		[fileURLToPath(import.meta.url), '--child', runner, '--tagged', String(tagged)],
		{ encoding: 'utf8', maxBuffer: 1024 ** 2 },
	);
	if (child.status !== 0) throw new Error(`${runner} failed:\n${child.stderr}`);
	return JSON.parse(child.stdout);
}

function median(values) {
	const sorted = values.toSorted((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const seconds = (ms) => `${(ms / 1000).toFixed(2)} s`;
const megabytes = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;

const { values } = parseArgs({
	options: {
		runs: { type: 'string', default: '5' },
		child: { type: 'string' },
		tagged: { type: 'string' },
	},
});

if (values.child) {
	const { ms, pdf } = await runners[values.child](values.tagged === 'true');
	console.log(JSON.stringify({ ms, bytes: pdf.length }));
} else {
	const runs = Number(values.runs);
	await checkPages();
	const typst = spawnSync('typst', ['--version'], { encoding: 'utf8' }).stdout?.trim();
	const rows = [];
	for (const runner of Object.keys(runners)) {
		const cells = [labels[runner]];
		for (const tagged of [true, false]) {
			const results = Array.from({ length: runs }, () => runOnce(runner, tagged));
			cells.push(seconds(median(results.map((r) => r.ms))), megabytes(results[0].bytes));
			process.stderr.write('.');
		}
		rows.push(`| ${cells.join(' | ')} |`);
	}
	process.stderr.write('\n');
	console.log(
		[
			`${PAGES} pages of tables, median of ${runs} runs. ${cpus()[0].model}, ${cpus().length} cores,`,
			`${platform()} ${release()}, Node ${process.version}, ${typst ?? 'no typst on the PATH'}.`,
			'',
			'| | Tagged | PDF | Untagged | PDF |',
			'| - | - | - | - | - |',
			...rows,
		].join('\n'),
	);
}
