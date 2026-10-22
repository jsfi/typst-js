// Every example compiles with the module as an accessible PDF, whatever its controls are set to, and
// the form stays one once its marked boxes are fields.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deflateSync, inflateSync } from 'node:zlib';

import { addFields, fieldsLibrary } from '@jsfi/typst-fields';

import { EXAMPLES } from './examples.js';
import { FIELDS_PATH, PROJECT_FILES } from './protocol.js';

const hasVeraPdf = spawnSync('verapdf', ['--version']).status === 0;

/** Every example compiled with each control at its limits and options, once for both tests. */
let compiled;

async function compileExamples() {
	if (compiled) return compiled;
	const wasm = await import('@jsfi/typst-wasm');
	const pkg = new URL('./', import.meta.resolve('@jsfi/typst-wasm/package.json'));
	wasm.initSync({ module: readFileSync(new URL('typst_wasm_bg.wasm', pkg)) });
	const compiler = new wasm.Compiler();
	const fonts = new URL('fonts/', pkg);
	for (const name of JSON.parse(readFileSync(new URL('index.json', fonts), 'utf8'))) {
		compiler.addFont(readFileSync(new URL(name, fonts)));
	}
	for (const [path, file] of Object.entries(PROJECT_FILES)) {
		compiler.addFile(path, readFileSync(new URL(file, import.meta.url)));
	}
	compiler.addFile(FIELDS_PATH, new TextEncoder().encode(fieldsLibrary));
	compiler.setMain('/main.typ');
	compiled = [];
	for (const example of EXAMPLES) {
		compiler.addFile(
			'/main.typ',
			readFileSync(new URL(`samples/${example.id}.typ`, import.meta.url)),
		);
		const defaults = Object.fromEntries(
			example.controls.map((c) => [c.input, String(c.value ?? c.options[0][0])]),
		);
		const variants = [defaults];
		for (const control of example.controls) {
			const values =
				control.type === 'select'
					? control.options.map(([value]) => value)
					: [control.min, control.max];
			for (const value of values) variants.push({ ...defaults, [control.input]: String(value) });
		}
		for (const inputs of variants) {
			compiler.setInputs(inputs);
			const result = compiler.compilePdf({ pdfStandards: ['ua-1'] });
			const name = `${example.id} ${JSON.stringify(inputs)}`;
			const problems = result.diagnostics.map((d) => d.message);
			// As the worker does for the download: the marked boxes of the form become fields.
			const filled =
				result.pdf && example.fields
					? addFields(result.pdf, { inflate: inflateSync, deflate: deflateSync })
					: undefined;
			compiled.push({ name, pdf: result.pdf, problems, filled });
		}
	}
	return compiled;
}

test('every example passes PDF/UA-1 with each control at its limits and options', async () => {
	for (const { name, pdf, problems, filled } of await compileExamples()) {
		assert.ok(pdf, `${name}: ${problems.join('; ')}`);
		assert.deepEqual(problems, [], name);
		if (filled) assert.notEqual(filled, pdf, `${name}: no fields`);
	}
});

test(
	'the form passes PDF/UA-1 with its fields, empty and prefilled',
	{ skip: !hasVeraPdf && 'veraPDF is not installed' },
	async () => {
		const forms = (await compileExamples()).filter((c) => c.filled);
		assert.ok(forms.length > 0);
		const directory = mkdtempSync(join(tmpdir(), 'typst-js-examples-'));
		try {
			const files = forms.map((form, i) => {
				const file = join(directory, `${i}.pdf`);
				writeFileSync(file, form.filled);
				return file;
			});
			const run = spawnSync('verapdf', ['-f', 'ua1', '--format', 'text', ...files], {
				encoding: 'utf8',
			});
			for (const [i, file] of files.entries()) {
				const line = run.stdout.split('\n').find((l) => l.endsWith(` ${file} ua1`));
				assert.equal(line?.split(' ')[0], 'PASS', `${forms[i].name}: ${line ?? run.stderr}`);
			}
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	},
);
