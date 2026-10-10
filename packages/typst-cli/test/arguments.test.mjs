// Both packages take the same valid arguments alike, and throw for invalid ones, each with a reason
// of its own.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
	addMain,
	assertAllThrow,
	assertSame,
	compilers,
	fonts,
	hasCli,
	moduleStandards,
	outcomes,
	text,
	withFonts,
} from './helpers.mjs';

describe(
	'valid arguments are taken alike, invalid ones throw',
	{ skip: !hasCli && 'no typst CLI on the PATH' },
	() => {
		test('arguments of the wrong type throw', async () => {
			const byPackage = compilers();
			const calls = [
				(c) => c.addFile(5, text('A')),
				(c) => c.addFile('/a.typ', 'A'),
				(c) => c.addFile(undefined, text('A')),
				(c) => c.addFont('abc'),
				(c) => c.addFont([0, 1, 0, 0]),
				(c) => c.addPackageFile(5, '/lib.typ', text('')),
				(c) => c.addPackageFile('@preview/x:0.1.0', null, text('')),
				(c) => c.addPackageFile('@preview/x:0.1.0', '/lib.typ', 'x'),
				(c) => c.removeFile(5),
				(c) => c.setMain(null),
				(c) => (c.setMain('/x.typ'), c.query(5)),
				(c) => (c.setMain('/x.typ'), c.query()),
			];
			for (const call of calls) assertAllThrow(outcomes(byPackage, call));
		});

		test('PDF, SVG and query options', () => {
			const byPackage = compilers((c) => {
				withFonts(c);
				addMain(c, '= A\n#pagebreak()\nB');
			});
			for (const options of [
				undefined,
				{ tagged: false },
				{ timestamp: -1 },
				{ timestamp: new Date(0) },
				{ pdfStandards: ['1.4'] },
				...['1', '2-', '-2', ' 1 - 2 ', '1,2-'].map((pages) => ({ pages })),
			]) {
				assertSame(outcomes(byPackage, (c) => c.compilePdf(options)));
			}
			for (const options of [
				{ tagged: 'no' },
				{ timestamp: 'yesterday' },
				{ timestamp: Number.NaN },
				{ pdfStandards: 'ua-1' },
				{ pdfStandards: [1] },
				{ pdfStandards: ['nonsense'] },
				{ pages: 2 },
				...['', '0', 'x', '-', '3-2', '1-2-3', '2,'].map((pages) => ({ pages })),
			]) {
				assertAllThrow(outcomes(byPackage, (c) => c.compilePdf(options)));
			}
			for (const options of [undefined, { pages: '2-' }]) {
				assertSame(outcomes(byPackage, (c) => c.compileSvg(options)));
			}
			for (const options of [{ pages: '0' }, { pages: '-' }, { pages: [] }]) {
				assertAllThrow(outcomes(byPackage, (c) => c.compileSvg(options)));
			}
			for (const options of [undefined, { field: 'body', one: true }]) {
				assertSame(outcomes(byPackage, (c) => c.query('heading', options)));
			}
			for (const options of [{ field: 1 }, { one: 'yes' }]) {
				assertAllThrow(outcomes(byPackage, (c) => c.query('heading', options)));
			}
		});

		test('inputs, and the compiler stays usable after rejecting them', () => {
			const byPackage = compilers((c) => {
				addMain(c, '#sys.inputs');
			});
			for (const inputs of [{}, { ' a ': ' b ' }]) {
				assertSame(outcomes(byPackage, (c) => c.setInputs(inputs)));
			}
			for (const inputs of [{ a: 1 }, { 'a=b': 'c' }, null, undefined, 'abc', 5, [], ['a']]) {
				assertAllThrow(outcomes(byPackage, (c) => c.setInputs(inputs)));
			}
			assertSame(outcomes(byPackage, (c) => c.compileSvg()));
		});

		test('paths and package specifications', () => {
			const byPackage = compilers();
			for (const path of ['main.typ', '/a/../b.typ', '/./a//b.typ', '/@x/main.typ']) {
				assertSame(outcomes(byPackage, (c) => c.addFile(path, new Uint8Array())));
				assertSame(outcomes(byPackage, (c) => c.removeFile(path)));
			}
			for (const path of ['../x.typ', 'a\\b.typ']) {
				assertAllThrow(outcomes(byPackage, (c) => c.addFile(path, new Uint8Array())));
			}
			const addManifest = (spec) => (c) => c.addPackageFile(spec, '/typst.toml', new Uint8Array());
			for (const spec of ['@preview/cetz:0.4.2', '@preview/ce_tz-2:1.0.0', '@préview/četz:1.0.0']) {
				assertSame(outcomes(byPackage, addManifest(spec)));
			}
			for (const spec of [
				'preview/cetz:0.4.2',
				'@',
				'@preview',
				'@preview/',
				'@preview/cetz',
				'@preview/cetz:',
				'@/cetz:1.0.0',
				'@pre view/cetz:1.0.0',
				'@preview/1cetz:1.0.0',
				'@preview/cetz:1',
				'@preview/cetz:1.2',
				'@preview/cetz:1.2.',
				'@preview/cetz:1.2.3.4',
				'@preview/cetz:1.x.3',
				'@preview/cetz:1.0.0/extra',
				'@ns:1.0.0',
			]) {
				assertAllThrow(outcomes(byPackage, addManifest(spec)));
			}
		});

		test('the faces a font file holds', () => {
			const byPackage = compilers();
			for (const file of [...fonts, new Uint8Array(), text('no font')]) {
				assertSame(outcomes(byPackage, (c) => c.addFont(file)));
			}
		});

		test('every standard with a page selection', () => {
			const byPackage = compilers((c) => {
				addMain(c, '');
			});
			const refusal = assertSame(
				outcomes(byPackage, (c) =>
					c.compilePdf({ pages: '1', tagged: false, pdfStandards: ['ua-1'] }),
				),
			);
			assert.equal(
				refusal.diagnostics.at(-1).message,
				'cannot disable PDF tags when exporting a PDF/UA-1 document',
			);
			for (const standard of moduleStandards()) {
				assertSame(
					outcomes(byPackage, (c) =>
						c.compilePdf({ pages: '1', tagged: false, pdfStandards: [standard] }),
					),
				);
			}
		});
	},
);
