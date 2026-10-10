// Every example compiles with the module as an accessible PDF, whatever its controls are set to.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { EXAMPLES } from './examples.js';
import { PROJECT_FILES } from './protocol.js';

test('every example passes PDF/UA-1 with each control at its limits and options', async () => {
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
	compiler.setMain('/main.typ');
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
			const problems = result.diagnostics.map((d) => d.message);
			assert.ok(result.pdf, `${example.id} ${JSON.stringify(inputs)}: ${problems.join('; ')}`);
			assert.deepEqual(problems, [], `${example.id} ${JSON.stringify(inputs)}`);
		}
	}
});
