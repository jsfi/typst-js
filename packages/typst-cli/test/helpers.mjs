// What the tests of @jsfi/typst-cli share: both packages, initialized alike, and the means to run a
// call on both and compare what they return or throw.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import * as cli from '@jsfi/typst-cli';
import * as wasm from '@jsfi/typst-wasm';

export { cli, wasm };

const fontDirectory = new URL(
	'./',
	import.meta.resolve('@jsfi/typst-wasm/fonts/LibertinusSerif-Regular.otf'),
);
export const fonts = JSON.parse(readFileSync(new URL('index.json', fontDirectory), 'utf8')).map(
	(name) => readFileSync(new URL(name, fontDirectory)),
);
export const text = (source) => new TextEncoder().encode(source);
export const hasCli = spawnSync('typst', ['--version']).status === 0;

wasm.initSync({
	module: readFileSync(new URL(import.meta.resolve('@jsfi/typst-wasm/typst_wasm_bg.wasm'))),
});
// Without Typst's embedded fonts, the CLI knows the fonts given to `addFont` alone, as the module.
if (hasCli) cli.initSync({ ignoreEmbeddedFonts: true });

/**
 * Each package under the name its results go by, with the hint it gives with the no-fonts warning,
 * each its own.
 */
const packages = {
	wasm: {
		module: wasm,
		noFontsHint: "load fonts with addFont(), for example Typst's defaults from fonts/",
	},
	...(hasCli && {
		cli: {
			module: cli,
			noFontsHint: 'load fonts with addFont(), or call init() without ignoreEmbeddedFonts',
		},
	}),
};

/** One compiler per package, set up alike. */
export function compilers(setup = () => {}) {
	const result = {};
	for (const [name, { module }] of Object.entries(packages)) {
		const compiler = new module.Compiler();
		setup(compiler);
		result[name] = compiler;
	}
	return result;
}

/**
 * What each package's compiler returns or throws for `call`, with output reduced to comparable
 * facts.
 */
export function outcomes(byPackage, call) {
	return Object.fromEntries(
		Object.entries(byPackage).map(([name, compiler]) => {
			try {
				return [name, summarize(call(compiler), packages[name].noFontsHint)];
			} catch (error) {
				return [name, { throws: error.message }];
			}
		}),
	);
}

/**
 * A call's result reduced to comparable facts: a compilation's PDF header and page count, a query's
 * value, and the diagnostics of either, with the package's `ownHint` masked; anything else as it
 * is.
 */
function summarize(result, ownHint) {
	if (result?.diagnostics === undefined) return result;
	return {
		pdf: result.pdf === undefined ? undefined : new TextDecoder().decode(result.pdf.subarray(0, 5)),
		pages: result.svg?.length,
		value: result.value,
		diagnostics: result.diagnostics.map((diagnostic) => maskOwnHint(diagnostic, ownHint)),
	};
}

/** The warning both packages give while they know no font. */
export const NO_FONTS = 'no fonts are loaded, so no text is rendered';

/** What a package's own no-fonts hint becomes in a comparable diagnostic. */
export const OWN_HINT = "(the package's own hint)";

/**
 * A diagnostic's fields, with the no-fonts warning's hint `ownHint` replaced by `OWN_HINT`, so that
 * both packages compare equal only if each gives its own hint and everything else alike.
 */
function maskOwnHint(diagnostic, ownHint) {
	const fields = diagnostic.toJSON();
	if (fields.severity !== 'warning' || fields.message !== NO_FONTS) return fields;
	const hints = fields.hints.map((hint) => (hint === ownHint ? OWN_HINT : hint));
	return { ...fields, hints };
}

/** Asserts that every package's outcome is the same, and returns it. */
export function assertSame(results) {
	const [first, ...rest] = Object.values(results);
	for (const other of rest) assert.deepEqual(other, first);
	return first;
}

/** Asserts that every package throws, with a reason of its own. */
export function assertAllThrow(results) {
	for (const [name, result] of Object.entries(results)) {
		assert.ok(result?.throws, `${name} did not throw: ${JSON.stringify(result)}`);
	}
}

/** Adds `source` as `/main.typ` to `compiler` and compiles from it. */
export function addMain(compiler, source) {
	compiler.addFile('/main.typ', text(source));
	compiler.setMain('/main.typ');
}

/** Makes the same `change` to every package's compiler. */
export function onEach(byPackage, change) {
	for (const compiler of Object.values(byPackage)) change(compiler);
}

/** Replaces `/main.typ` with `source` in every package's compiler. */
export function setSource(byPackage, source) {
	onEach(byPackage, (compiler) => compiler.addFile('/main.typ', text(source)));
}

export function withFonts(compiler) {
	for (const font of fonts) compiler.addFont(font);
}

/** The PDF standards the module accepts, as its error for an unknown one lists them. */
export function moduleStandards() {
	try {
		new wasm.Compiler().compilePdf({ pdfStandards: ['?'] });
	} catch (error) {
		return error.message.split('expected one of ')[1].split(', ');
	}
	throw new Error('the module accepted an unknown PDF standard');
}
