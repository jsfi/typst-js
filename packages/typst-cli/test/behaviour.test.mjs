// Both packages compile, report and refuse alike: every call returns or throws the same.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
	addMain,
	NO_FONTS,
	OWN_HINT,
	assertSame,
	compilers,
	hasCli,
	onEach,
	outcomes,
	setSource,
	text,
	withFonts,
} from './helpers.mjs';

describe('both packages behave alike', { skip: !hasCli && 'no typst CLI on the PATH' }, () => {
	test('a document compiles to PDF and SVG', async () => {
		const byPackage = compilers((c) => {
			withFonts(c);
			addMain(c, '= Hallo\n#lorem(30)\n#pagebreak()\n$ x^2 $');
		});
		const pdf = assertSame(outcomes(byPackage, (c) => c.compilePdf()));
		assert.equal(pdf.pdf, '%PDF-');
		assert.deepEqual(pdf.diagnostics, []);
		assert.equal(assertSame(outcomes(byPackage, (c) => c.compileSvg())).pages, 2);
	});

	test('an untagged PDF is smaller than a tagged one', async () => {
		const byPackage = compilers((c) => {
			withFonts(c);
			addMain(c, '#table(columns: 4, ..range(400).map(str))');
		});
		for (const [name, c] of Object.entries(byPackage)) {
			const tagged = c.compilePdf().pdf.length;
			const untagged = c.compilePdf({ tagged: false }).pdf.length;
			assert.ok(untagged < tagged, `${name}: ${untagged} < ${tagged}`);
		}
	});

	test('errors and warnings carry the same message, hints, place and byte range', async () => {
		const byPackage = compilers((c) => {
			withFonts(c);
			c.addFile('/main.typ', text('#set text(font: "Nonexistent")\n#include "sub/chapter.typ"\n'));
			c.addFile('/sub/chapter.typ', text('== Kapitel\nÄpfel #undefined-thing\n'));
			c.setMain('/main.typ');
		});
		const result = assertSame(outcomes(byPackage, (c) => c.compilePdf()));
		assert.deepEqual(
			result.diagnostics.map(({ severity, path, line, column, start, end }) => [
				severity,
				path,
				line,
				column,
				start,
				end,
			]),
			[
				['warning', '/main.typ', 1, 17, 16, 29],
				['error', '/sub/chapter.typ', 2, 8, 19, 34],
			],
		);
		assert.equal(result.diagnostics[1].hints.length, 1);
	});

	test('packages resolve from the added files, and their errors name the package', async () => {
		const spec = '@preview/hello:0.1.0';
		const byPackage = compilers((c) => {
			withFonts(c);
			c.addPackageFile(
				spec,
				'/typst.toml',
				text('[package]\nname = "hello"\nversion = "0.1.0"\nentrypoint = "lib.typ"\n'),
			);
			c.addPackageFile(
				spec,
				'/lib.typ',
				text('#let greet(name) = [Hallo #name]\n#let broken() = undefined-call()\n'),
			);
			addMain(c, `#import "${spec}": greet, broken\n#greet[Welt]`);
		});
		assert.deepEqual(assertSame(outcomes(byPackage, (c) => c.compilePdf())).diagnostics, []);

		setSource(byPackage, `#import "${spec}": broken\n#broken()`);
		const failed = assertSame(outcomes(byPackage, (c) => c.compilePdf()));
		assert.equal(failed.diagnostics[0].path, `${spec}/lib.typ`);
	});

	test('a compiler without fonts warns', async () => {
		const byPackage = compilers((c) => {
			addMain(c, 'Hallo');
		});
		const result = assertSame(outcomes(byPackage, (c) => c.compilePdf()));
		assert.equal(result.diagnostics[0].message, NO_FONTS);
		assert.deepEqual(result.diagnostics[0].hints, [OWN_HINT]);
	});

	test('a missing or unset main file fails alike', async () => {
		const byPackage = compilers(withFonts);
		assert.match(assertSame(outcomes(byPackage, (c) => c.compilePdf())).throws, /No main file set/);
		onEach(byPackage, (c) => c.setMain('/missing.typ'));
		assert.equal(
			assertSame(outcomes(byPackage, (c) => c.compilePdf())).diagnostics[0].message,
			'file not found (searched at /missing.typ)',
		);
	});

	test('erroneous sources give the same diagnostics, down to the byte range', async () => {
		// Spans the CLI draws in ways that hide their end: empty ones, wide or zero-width characters,
		// tabs, several lines, other line breaks; and files the document misses.
		const sources = [
			'#panic("a\\nb\\n  c")',
			'\uFEFF#panic("x")',
			'\uFEFF\n#panic("x")',
			'#panic("é😀")',
			'#let x = (1, 2',
			'#let x = (1, 2\n',
			'#(1 +)',
			'#let = 5',
			'#f(',
			'#{',
			'#[',
			'$x^$',
			'#let f(x) = x\n#f(1, 2, 3)',
			'#image("nope.png")',
			'#read("nope.txt")',
			'#bibliography("nope.bib")',
			'#include "nope.typ"',
			'#let a = 1\n#a\t#unknown-x',
			'\t\t#unknown-y',
			'日本語 #unknown-z',
			'#("日本" + 1)',
			'#{\n  let x = 1\n  x + "a"\n}',
			'#(1\n+\n"a")',
			'#calc.pow(2, "x")',
			'#"abc',
			'#let x = ',
			'#if true {',
			'= Heading\n#lorem(',
			'#set text(fill: 5)',
			'#emph[a] #strong(',
			'#(1, 2).at(5)',
			'#"é😀".slice(1)',
			'#let 😀 = 1',
			'#x😀y',
			'#(a: 1).b',
			'#for x in 5 {}',
			'#while',
			'#import',
			'#show: x => y',
			'#box(width: 1fr + "a")',
			'#(1/0)',
			'#str("x", base: 1)',
			'#[*a]',
			'*a',
			'_b',
			'`c',
			'$ (a $',
			'#raw("x", lang: 5)',
			'#par[x\n#unknown]',
			'@nolabel',
			'<a> <a> @a',
			'#ref(<nolabel>)',
			'#{\r\n  let x = 1\r\n  x + "a"\r\n}',
			'#(1\r\n+\r\n"a")',
			'a\u2028b #unknown-q',
			'#("日本"\n+\n1)',
			'#(\t1\n\t+\n\t"a")',
			'#(😀😀 + 1)',
			'#("é" + 1) #("x" + 2)',
			'#let f(a, b) = a\n#f(1, 2, 3, 4)',
			'#{\n  ("a"\n   + 1)\n}',
			'#table(columns: 2, [a], [b], fill: (x, y) => "z")',
			'#set page(width: "a")',
			'#context { let x = 1; x.foo }',
			'#text(font: "Nope")[x]',
			'\u0301#unknown-w',
			'#"a\u200db" #unknown-v',
			'#(1 +\n)',
			'#let x = (a: 1,\n',
		];
		const byPackage = compilers((c) => {
			withFonts(c);
			c.setMain('/main.typ');
		});
		for (const source of sources) {
			setSource(byPackage, source);
			assertSame(outcomes(byPackage, (c) => c.compileSvg()));
		}
	});

	test('directories and paths through files are reported alike', async () => {
		const cases = [
			{ '/main.typ': '#include "a/b.typ"', '/a': 'x' },
			{ '/main.typ': '#read("/")' },
			{ '/main.typ': '#read("/sub")', '/sub/b.txt': 'y' },
			{ '/main.typ': '#read("sub")', '/sub/b.txt': 'y' },
			{ '/main.typ': '#image("a/x.png")', '/a': 'x' },
			{ '/main.typ': '#include "sub/main.typ"', '/sub/main.typ': '#read("../a/b")', '/a': 'x' },
		];
		for (const files of cases) {
			const byPackage = compilers((c) => {
				withFonts(c);
				for (const [path, source] of Object.entries(files)) c.addFile(path, text(source));
				c.setMain('/main.typ');
			});
			assertSame(outcomes(byPackage, (c) => c.compileSvg()));
		}
	});

	test('a main file that is a directory is handled alike', () => {
		for (const main of ['/m', '/']) {
			const byPackage = compilers((c) => {
				c.addFile('/m/x.typ', text('x'));
				c.setMain(main);
			});
			assertSame(outcomes(byPackage, (c) => c.compilePdf()));
			assertSame(outcomes(byPackage, (c) => c.query('heading')));
		}
	});

	test('a released compiler throws alike', () => {
		const byPackage = compilers((c) => c.free());
		for (const call of [(c) => c.addFile('/a', text('')), (c) => c.compilePdf(), (c) => c.free()]) {
			assert.ok(assertSame(outcomes(byPackage, call)).throws);
		}
	});

	test('main files named like packages, or with a line break, are located alike', async () => {
		for (const main of ['/@x/main.typ', '/a\nb.typ']) {
			const byPackage = compilers((c) => {
				withFonts(c);
				c.addFile(main, text('#panic("y")'));
				c.setMain(main);
			});
			assert.equal(assertSame(outcomes(byPackage, (c) => c.compileSvg())).diagnostics[0].start, 1);
		}
	});

	test('a package that was not added is not found, and its missing files are named', async () => {
		const byPackage = compilers((c) => {
			withFonts(c);
			c.addPackageFile(
				'@preview/partial:0.1.0',
				'/typst.toml',
				text('[package]\nname = "partial"\nversion = "0.1.0"\nentrypoint = "lib.typ"\n'),
			);
			c.addPackageFile('@preview/partial:0.1.0', '/lib.typ', text('#import "missing.typ": x\n'));
			c.setMain('/main.typ');
		});
		for (const source of [
			'#import "@preview/nonexistent:0.1.0": x',
			'#import "@local/nonexistent:0.1.0": x',
			'#import "@preview/partial:0.1.0": x',
		]) {
			setSource(byPackage, source);
			assertSame(outcomes(byPackage, (c) => c.compileSvg()));
		}
		const missing = outcomes(byPackage, (c) => c.compileSvg()).wasm.diagnostics.at(-1).message;
		assert.equal(missing, 'file not found (searched at @preview/partial:0.1.0/missing.typ)');
	});

	test('a recompilation sees the replaced file', async () => {
		const byPackage = compilers((c) => {
			withFonts(c);
			addMain(c, '#undefined');
		});
		assert.equal(assertSame(outcomes(byPackage, (c) => c.compilePdf())).pdf, undefined);
		setSource(byPackage, 'Fixed');
		assert.equal(assertSame(outcomes(byPackage, (c) => c.compilePdf())).pdf, '%PDF-');
	});
});

describe(
	'inputs, timestamps, standards, pages and queries behave alike',
	{ skip: !hasCli && 'no typst CLI on the PATH' },
	() => {
		const document = [
			'= Hallo #sys.inputs.name',
			'#metadata(sys.inputs) <inputs>',
			'#metadata(datetime.today().display()) <today>',
			'== Zwei',
			'#figure(table[A], caption: [Tabelle])',
			'#pagebreak()',
			'B',
			'#pagebreak()',
			'C',
		].join('\n');
		const setup = (c) => {
			withFonts(c);
			c.setInputs({ ' name ': ' Welt ', title: 'Report' });
			addMain(c, document);
		};
		const creationDate = (pdf) =>
			/CreationDate\s*\(([^)]*)\)/.exec(new TextDecoder('latin1').decode(pdf))?.[1];
		const queried = (byPackage, selector, options) =>
			assertSame(outcomes(byPackage, (c) => c.query(selector, options)));

		test('sys.inputs arrive trimmed', async () => {
			const byPackage = compilers(setup);
			assert.deepEqual(queried(byPackage, '<inputs>', { field: 'value', one: true }).value, {
				name: 'Welt',
				title: 'Report',
			});
		});

		test('queries return the same elements, fields and errors', async () => {
			const byPackage = compilers(setup);
			assert.equal(queried(byPackage, 'heading').value.length, 2);
			assert.deepEqual(queried(byPackage, 'heading', { field: 'level' }).value, [1, 2]);
			assert.deepEqual(queried(byPackage, 'heading', { field: 'func' }).value, []);
			assert.deepEqual(queried(byPackage, 'figure.where(kind: table)', { field: 'kind' }).value, [
				'table',
			]);
			assert.equal(
				queried(byPackage, '<today>', { field: 'nothing', one: true }).diagnostics.at(-1).message,
				'no such field found for element',
			);
			assert.equal(
				queried(byPackage, 'heading', { one: true }).diagnostics.at(-1).message,
				'expected exactly one element, found 2',
			);
			const unknown = queried(byPackage, 'missing').diagnostics.at(-1);
			assert.deepEqual(
				[unknown.path, unknown.line, unknown.column, unknown.start, unknown.end],
				['/<input-expression>', 1, 7, 6, 13],
			);
		});

		test('a fixed timestamp is the creation date and today, in UTC', async () => {
			const byPackage = compilers(setup);
			const timestamp = Date.UTC(2024, 0, 2, 23, 4, 5);
			for (const c of Object.values(byPackage)) {
				assert.equal(
					creationDate(c.compilePdf({ timestamp: new Date(timestamp) }).pdf),
					'D:20240102230405Z',
				);
				assert.equal(creationDate(c.compilePdf({ timestamp }).pdf), 'D:20240102230405Z');
				// Now in local time, with its offset; a zero offset, as on a machine set to UTC, is `Z`.
				assert.match(creationDate(c.compilePdf().pdf), /^D:\d{14}(Z|[+-]\d\d'\d\d)/);
				assert.equal(
					creationDate(c.compilePdf({ timestamp: Date.UTC(1969, 6, 20, 20, 17, 40) }).pdf),
					'D:19690720201740Z',
				);
			}
		});

		test('pages select pages, export untagged and say so', async () => {
			const byPackage = compilers(setup);
			assert.equal(assertSame(outcomes(byPackage, (c) => c.compileSvg({ pages: '2-3' }))).pages, 2);
			assert.equal(assertSame(outcomes(byPackage, (c) => c.compileSvg({ pages: '-2' }))).pages, 2);
			const paged = assertSame(outcomes(byPackage, (c) => c.compilePdf({ pages: '2-' })));
			assert.equal(paged.pdf, '%PDF-');
			assert.equal(paged.diagnostics[0].message, 'using pages implies tagged: false');
			assert.deepEqual(
				assertSame(outcomes(byPackage, (c) => c.compilePdf({ pages: '2', tagged: false })))
					.diagnostics,
				[],
			);
		});

		test('standards are enforced, refused and checked alike', async () => {
			const byPackage = compilers(setup);
			assert.equal(
				assertSame(outcomes(byPackage, (c) => c.compilePdf({ pdfStandards: ['a-2b'] }))).pdf,
				'%PDF-',
			);
			assert.deepEqual(
				assertSame(
					outcomes(byPackage, (c) => c.compilePdf({ pdfStandards: ['a-1b', '2.0'] })),
				).diagnostics.at(-1),
				{
					severity: 'error',
					message: 'PDF 2.0 is not compatible with PDF/A-1b',
					hints: ['PDF/A-1b requires version PDF 1.4'],
					path: undefined,
					start: undefined,
					end: undefined,
					line: undefined,
					column: undefined,
				},
			);
			onEach(byPackage, (c) =>
				c.addFile(
					'/image.svg',
					text('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>'),
				),
			);
			setSource(byPackage, 'Hallo\n#image("image.svg")');
			const accessibility = assertSame(
				outcomes(byPackage, (c) => c.compilePdf({ pdfStandards: ['ua-1'] })),
			);
			const missingAlt = accessibility.diagnostics.find(
				(d) => d.message === 'PDF/UA-1 error: missing alt text',
			);
			assert.equal(missingAlt?.line, 2);
		});
	},
);
