// What the tests of @jsfi/typst-fields share: documents compiled by both packages, the update a call
// appends, and veraPDF's verdict where it is installed.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

import * as cli from '@jsfi/typst-cli';
import { fieldsLibrary } from '@jsfi/typst-fields';
import * as wasm from '@jsfi/typst-wasm';

const fontDirectory = new URL(
	'./',
	import.meta.resolve('@jsfi/typst-wasm/fonts/LibertinusSerif-Regular.otf'),
);
const fontNames = JSON.parse(readFileSync(new URL('index.json', fontDirectory), 'utf8'));
export const fonts = Object.fromEntries(
	fontNames.map((name) => [name, readFileSync(new URL(name, fontDirectory))]),
);
export const text = (source) => new TextEncoder().encode(source);
export const hasCli = spawnSync('typst', ['--version']).status === 0;
export const hasVeraPdf = spawnSync('verapdf', ['--version']).status === 0;

wasm.initSync({
	module: readFileSync(new URL(import.meta.resolve('@jsfi/typst-wasm/typst_wasm_bg.wasm'))),
});
if (hasCli) cli.initSync({ ignoreEmbeddedFonts: true });

const packages = { wasm, ...(hasCli && { cli }) };

/**
 * The PDF of `source` from the package named `by`, with the field library as `/fields.typ` and
 * `pdf` as its options. Throws with the diagnostics if it does not compile.
 */
export function compile(source, options) {
	const result = compileResult(source, options);
	if (!result.pdf) throw new Error(result.diagnostics.map((d) => d.message).join('; '));
	return result.pdf;
}

/** The SVG pages of `source` from the module, with `inputs` as `sys.inputs`. */
export function compileSvg(source, inputs = {}) {
	const compiler = new wasm.Compiler();
	for (const data of Object.values(fonts)) compiler.addFont(data);
	compiler.addFile('/fields.typ', text(fieldsLibrary));
	compiler.addFile('/main.typ', text(source));
	compiler.setMain('/main.typ');
	compiler.setInputs(inputs);
	const result = compiler.compileSvg();
	if (!result.svg) throw new Error(result.diagnostics.map((d) => d.message).join('; '));
	return result.svg.join('');
}

/** The result of compiling `source` as `compile` does, failed or not. */
export function compileResult(source, { by = 'wasm', pdf = { pdfStandards: ['ua-1'] } } = {}) {
	const compiler = new packages[by].Compiler();
	for (const data of Object.values(fonts)) compiler.addFont(data);
	compiler.addFile('/fields.typ', text(fieldsLibrary));
	compiler.addFile('/main.typ', text(source));
	compiler.setMain('/main.typ');
	return compiler.compilePdf(pdf);
}

/** A document's preamble, as PDF/UA-1 needs it. */
export const preamble = `#import "fields.typ": checkbox, text-field
#set document(title: "Fields")
#set text(lang: "en")
`;

/**
 * The incremental update `after` appends to `before`, as Latin-1 text: its objects are written
 * uncompressed, its streams compressed, which `stream` reads.
 */
export function appended(before, after) {
	if (after.subarray(0, before.length).some((byte, i) => byte !== before[i])) {
		throw new Error('the update changed the original bytes');
	}
	return Buffer.from(after.subarray(before.length)).toString('latin1');
}

/** The decompressed data of stream object `num` of an update `appended` returned. */
export function stream(update, num) {
	const match = new RegExp(`\\n${num} 0 obj\\n<<(.*?)>>\\nstream\\n`, 's').exec(update);
	if (!match) throw new Error(`no stream ${num} in the update`);
	const length = Number(/\/Length (\d+)/.exec(match[1])[1]);
	const start = match.index + match[0].length;
	const data = Buffer.from(update.slice(start, start + length), 'latin1');
	return match[1].includes('/FlateDecode')
		? inflateSync(data).toString('latin1')
		: data.toString('latin1');
}

/**
 * Each PDF's veraPDF verdict against `profile`, PDF/UA-1 unless named otherwise, such as `2b` for
 * PDF/A-2b: `PASS` or `FAIL`.
 */
export function veraPdf(pdfs, profile = 'ua1') {
	const directory = mkdtempSync(join(tmpdir(), 'typst-fields-'));
	try {
		const files = pdfs.map((pdf, i) => {
			const file = join(directory, `${i}.pdf`);
			writeFileSync(file, pdf);
			return file;
		});
		const run = spawnSync('verapdf', ['-f', profile, '--format', 'text', ...files], {
			encoding: 'utf8',
		});
		return files.map((file) => {
			const line = run.stdout.split('\n').find((l) => l.endsWith(` ${file} ${profile}`));
			return line?.split(' ')[0] ?? run.stdout + run.stderr;
		});
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

/** The object of an update that holds the field named `name`. */
export function fieldObject(update, name) {
	return update.split('endobj').find((object) => object.includes(`/T <${hex(name)}>`));
}

/** The text of a PDF string written in hexadecimal: UTF-16 after a byte order mark, else Latin-1. */
export function unhex(digits) {
	const bytes = Buffer.from(digits, 'hex');
	if (bytes[0] !== 0xfe || bytes[1] !== 0xff) return bytes.toString('latin1');
	return Buffer.from(bytes.subarray(2)).swap16().toString('utf16le');
}

/** `text` in hexadecimal, as the update writes strings. */
export function hex(text) {
	return Buffer.from(text, 'latin1').toString('hex');
}
