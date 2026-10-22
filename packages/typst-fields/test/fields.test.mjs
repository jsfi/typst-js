// What addFields makes of the PDFs of both packages: fields where the library marked them, as
// PDF/UA-1 wants them, values moved from the page into their fields, and the errors for what it
// cannot do.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { deflateSync, inflateSync } from 'node:zlib';

import { addFields, addFieldsAsync } from '@jsfi/typst-fields';

import {
	appended,
	compile,
	compileResult,
	fieldObject,
	hasCli,
	hasVeraPdf,
	preamble,
	stream,
	unhex,
	veraPdf,
} from './helpers.mjs';

const form = `${preamble}
#show link: set text(fill: blue)
= Application
Full name: #text-field("full_name", label: "Full name", value: "Jane Doe")

E-mail: #text-field("email", label: "E-mail address", width: 5cm, required: true, max-length: 80)

#text-field("notes", label: "Notes", multiline: true, value: "مرحبا بالعالم, Grüße, Привет\\nSecond line")
#checkbox("terms", label: "I accept the terms", required: true) I accept the terms.
#pagebreak()
Page two: #text-field("later", label: "Later", value: "on the second page")

#checkbox("news", label: "Send me news", checked: true) Send me news.
`;

const codecs = { inflate: inflateSync, deflate: deflateSync };

/** `node:zlib` behind promises: the same output as `codecs`, through `addFieldsAsync`. */
const promisedCodecs = {
	inflate: async (data) => inflateSync(data),
	deflate: async (data) => deflateSync(data),
};

/** The browser's streams, as the README shows them. */
const streamCodecs = {
	inflate: (data) => through(data, new DecompressionStream('deflate')),
	deflate: (data) => through(data, new CompressionStream('deflate')),
};

async function through(data, transform) {
	return new Uint8Array(
		await new Response(new Blob([data]).stream().pipeThrough(transform)).arrayBuffer(),
	);
}

for (const by of ['wasm', ...(hasCli ? ['cli'] : [])]) {
	describe(`a PDF of @jsfi/typst-${by}`, () => {
		const pdf = compile(form, { by });
		const filled = addFields(pdf, codecs);
		const update = appended(pdf, filled);
		const widget = (name) => fieldObject(update, name);

		test('gets a field over every marked box', () => {
			assert.equal(update.match(/\/Subtype \/Widget/g)?.length, 6);
			assert.equal(update.match(/\/FT \/Tx/g)?.length, 4);
			assert.equal(update.match(/\/FT \/Btn/g)?.length, 2);
			assert.doesNotMatch(update, /typst-field:/);
			assert.match(update, /\/AcroForm \d+ 0 R/);
		});

		test('takes the settings the library gives', () => {
			assert.match(widget('email'), /\/Ff 2\b/);
			assert.match(widget('email'), /\/MaxLen 80\b/);
			assert.match(widget('email'), /\/TU <45/);
			assert.match(widget('notes'), /\/Ff 4096\b/);
			assert.match(widget('full_name'), /\/V <4a616e6520446f65>/);
		});

		test('tags each field as a Form element in place of its link, its value taken out', () => {
			const forms = update.match(/\/S \/Form[^\n]*/g) ?? [];
			assert.equal(forms.length, 6);
			for (const element of forms) assert.match(element, /\/K \[<<\/Type \/OBJR[^\]]*\]/);
			assert.doesNotMatch(update, /\/S \/Link/);
		});

		test("draws each value as Typst drew it, in the text's colour", () => {
			for (const name of ['full_name', 'notes', 'later']) {
				const [, ap] = /\/AP <<\/N (\d+) 0 R>>/.exec(widget(name));
				const content = stream(update, ap);
				assert.match(content, /^\/Tx BMC\nq\n1 0 0 1 -[\d.]+ -[\d.]+ cm\n/);
				assert.match(content, /\bTJ\b/);
				assert.doesNotMatch(content, /\bBDC\b|\/MCID/);
				// Black, as the text around it, though the document makes links blue.
				assert.doesNotMatch(content, /[\d.]+ [\d.]+ [\d.]+ scn/);
			}
			const [, empty] = /\/AP <<\/N (\d+) 0 R>>/.exec(widget('email'));
			assert.equal(stream(update, empty), '/Tx BMC\nEMC');
		});

		test('cuts each value out of its page, and out of the parent tree', () => {
			const removed = [];
			for (const [, items] of update.matchAll(/\n\d+ 0 obj\n\[([^\]]*null[^\]]*)\]\nendobj/g)) {
				const kids = items.match(/null|\d+ \d+ R/g);
				removed.push(kids.flatMap((kid, mcid) => (kid === 'null' ? [mcid] : [])));
			}
			assert.equal(removed.length, 2, 'the arrays of both pages');
			const pages = [...update.matchAll(/\/Type \/Page\b[^\n]*\/Contents (\d+) 0 R/g)];
			assert.equal(pages.length, 2);
			for (const [i, [, contents]] of pages.entries()) {
				const content = stream(update, contents);
				assert.ok(removed[i].length > 0);
				for (const mcid of removed[i]) assert.doesNotMatch(content, new RegExp(`/MCID ${mcid}>>`));
			}
		});

		test('names Helvetica alone, unembedded, for typing, and embeds no font', () => {
			const das = [...update.matchAll(/\/DA <([0-9a-f]+)>/g)].map((m) => unhex(m[1]));
			assert.deepEqual(new Set(das.map((da) => da.split(' ')[0])), new Set(['/FieldFont']));
			const [, helvetica] = /\/DR <<\/Font <<\/FieldFont (\d+) 0 R>>>>/.exec(update) ?? [];
			assert.match(update, new RegExp(`\\n${helvetica} 0 obj\\n[^\\n]*/BaseFont /Helvetica`));
			assert.doesNotMatch(update, /\/FontFile/);
		});

		test('makes checkboxes ticked or not, with a tick drawn for their on state', () => {
			for (const entry of [/\/V \/Yes\//, /\/DV \/Yes\//, /\/AS \/Yes\//]) {
				assert.match(widget('news'), entry);
			}
			for (const entry of [/\/V \/Off\//, /\/DV \/Off\//, /\/AS \/Off\//, /\/Ff 2\b/]) {
				assert.match(widget('terms'), entry);
			}
			assert.match(widget('terms'), /\/AP <<\/N <<\/Yes \d+ 0 R\/Off \d+ 0 R>>>>/);
			assert.doesNotMatch(widget('terms'), /\/DA/);
			assert.match(update, / m\n[\d.]+ [\d.]+ l\n[\d.]+ [\d.]+ l\nS\nQ/);
		});

		test('passes PDF/UA-1', { skip: !hasVeraPdf && 'veraPDF is not installed' }, () => {
			assert.deepEqual(veraPdf([filled]), ['PASS']);
		});

		test('is left alone the second time', () => {
			assert.equal(addFields(filled, codecs), filled);
		});
	});
}

test('addFieldsAsync takes an inflate and a deflate that return promises', async () => {
	const pdf = compile(form);
	assert.deepEqual(await addFieldsAsync(pdf, promisedCodecs), addFields(pdf, codecs));
	const update = appended(pdf, await addFieldsAsync(pdf, streamCodecs));
	assert.equal(update.match(/\/Subtype \/Widget/g)?.length, 6);
});

test('a PDF without markers is returned as it is', () => {
	const pdf = compile(`${preamble}No fields.`);
	assert.equal(addFields(pdf, codecs), pdf);
});

test('empty fields need no deflate, and pass PDF/UA-1', () => {
	const pdf = compile(`${preamble}Name: #text-field("name", label: "Name")`);
	const filled = addFields(pdf, { inflate: inflateSync });
	assert.match(appended(pdf, filled), /\/BaseFont \/Helvetica/);
	if (hasVeraPdf) assert.deepEqual(veraPdf([filled]), ['PASS']);
});

test('values pass PDF/A-2b as well', { skip: !hasVeraPdf && 'veraPDF is not installed' }, () => {
	const pdf = compile(form, { pdf: { pdfStandards: ['ua-1', 'a-2b'] } });
	const filled = addFields(pdf, codecs);
	assert.deepEqual(veraPdf([filled]), ['PASS']);
	assert.deepEqual(veraPdf([filled], '2b'), ['PASS']);
});

test('checkboxes alone need no font', () => {
	const pdf = compile(`${preamble}#checkbox("a", label: "A") A`);
	const filled = addFields(pdf, codecs);
	const update = appended(pdf, filled);
	assert.match(update, /\/FT \/Btn/);
	assert.doesNotMatch(update, /\/Font|\/DA|\/DR/);
	if (hasVeraPdf) assert.deepEqual(veraPdf([filled]), ['PASS']);
});

test('an untagged PDF gets its empty fields without a structure', () => {
	const source = `${preamble}Name: #text-field("name", label: "Name")`;
	const pdf = compile(source, { pdf: { tagged: false } });
	const update = appended(pdf, addFields(pdf, codecs));
	assert.match(update, /\/FT \/Tx/);
	assert.doesNotMatch(update, /\/StructParent|\/S \/Form/);
});

describe('addFields throws', () => {
	const single = (field, options) => compile(`${preamble}#text-field(${field})`, options);

	test('for compressed objects without inflate', () => {
		const pdf = single('"a", label: "A"');
		assert.throws(() => addFields(pdf), /needs the `inflate` option/);
	});

	test('for compressed page content without inflate', { skip: !hasCli && 'no typst CLI' }, () => {
		const pdf = single('"a", label: "A", value: "x"', { by: 'cli' });
		assert.throws(() => addFields(pdf, { deflate: deflateSync }), /needs the `inflate` option/);
	});

	test('for a value without deflate', () => {
		const pdf = single('"a", label: "A", value: "x"');
		assert.throws(() => addFields(pdf, { inflate: inflateSync }), /need the `deflate` option/);
	});

	test('for an inflate that returns a promise', () => {
		const pdf = single('"a", label: "A"');
		assert.throws(() => addFields(pdf, promisedCodecs), /use addFieldsAsync/);
	});

	test('for a value in an untagged PDF', () => {
		const pdf = single('"a", label: "A", value: "x"', { pdf: { tagged: false } });
		assert.throws(() => addFields(pdf, codecs), /field "a" has a value, which needs a tagged PDF/);
	});

	test('for two fields of one name and different kinds', () => {
		const pdf = compile(`${preamble}#text-field("a", label: "A") #checkbox("a", label: "A")`);
		assert.throws(() => addFields(pdf, codecs), /two fields are named "a"/);
	});

	test('for two fields of one name and different settings', () => {
		const pdf = compile(`${preamble}#text-field("a", label: "A") #text-field("a", label: "Again")`);
		assert.throws(() => addFields(pdf, codecs), /the fields named "a" differ in their settings/);
	});
});

describe('the library refuses', () => {
	const errors = (field) =>
		compileResult(`${preamble}#text-field(${field})`).diagnostics.map((d) => d.message);

	test('a field without a label', () => {
		assert.match(errors('"a"').join(), /field "a" needs a label/);
	});

	test('a checkbox without a label', () => {
		const messages = compileResult(`${preamble}#checkbox("a")`).diagnostics.map((d) => d.message);
		assert.match(messages.join(), /field "a" needs a label/);
	});

	test('a name with an empty part', () => {
		assert.match(errors('"a..b", label: "A"').join(), /parts between periods are not empty/);
	});

	test('a value longer than max-length', () => {
		assert.match(
			errors('"a", label: "A", value: "abc", max-length: 2').join(),
			/longer than its max-length/,
		);
	});

	test('a line break in a single-line value', () => {
		assert.match(errors('"a", label: "A", value: "a\\nb"').join(), /needs multiline: true/);
	});

	test('an inset, which would move the text from where viewers put it', () => {
		assert.match(errors('"a", label: "A", inset: 4pt').join(), /takes no inset/);
	});
});
