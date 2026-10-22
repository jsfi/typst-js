// The features fields take beyond their kind: read-only, not exported, alignment, spell checking and
// scrolling, committing on a pick, a checkbox's own value, checkbox groups, radio buttons that turn
// on together, one field in several places, names grouped by periods, actions on some fields, the
// fields signing locks and a button's pressed look.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { deflateSync, inflateSync } from 'node:zlib';

import { addFields, previewInput } from '@jsfi/typst-fields';

import {
	appended,
	compile,
	compileResult,
	compileSvg,
	fieldObject,
	hasCli,
	hasVeraPdf,
	hex,
	preamble,
	stream,
	unhex,
	veraPdf,
} from './helpers.mjs';

const all = preamble.replace('checkbox, text-field', '*');

const form = `${all}
Name: #text-field("person.name", label: "Name", value: "Jane Doe", align: right, read-only: true)

City: #text-field("person.address.city", label: "City", value: "Leith")

Amount: #text-field("amount", label: "Amount", align: center, spellcheck: false, scroll: false, export: false)

Country: #dropdown("person.country", label: "Country", options: ("Germany", "France"), value: "France", align: right, editable: true, spellcheck: false, commit-on-change: true)

#list-box("languages", label: "Languages", options: ("English", "Deutsch"), align: center, commit-on-change: true)

Consent:
#checkbox("consent", label: "By mail", value: "mail", group-label: "Contact consent") Mail
#checkbox("consent", label: "By phone", value: "phone", checked: true) Phone

#checkbox("agree", label: "I agree", value: "accepted", checked: true) I agree

#radio("size", "s", label: "Small") #radio("size", "m", label: "Medium", checked: true)
#radio("size", "m", label: "Medium, again", checked: true)
#pagebreak()
Name again: #text-field("person.name", label: "Name", value: "Jane Doe", align: right, read-only: true, width: 5cm)

#button("clear", "Clear person", action: (reset: true, fields: ("person",)))
#button("send", "Send", action: (submit: "https://example.org", fields: ("amount",), exclude: true, empty: true, method: "get"))

#signature-field("signature", label: "Signature", lock: (except: ("amount",)))
#signature-field("witness", label: "Witness", lock: "all")
`;

const codecs = { inflate: inflateSync, deflate: deflateSync };

for (const by of ['wasm', ...(hasCli ? ['cli'] : [])]) {
	describe(`the features of fields in a PDF of @jsfi/typst-${by}`, () => {
		const pdf = compile(form, { by });
		const filled = addFields(pdf, codecs);
		const update = appended(pdf, filled);
		/** The object holding the field whose partial name, the last part of its name, is `name`. */
		const field = (name) => fieldObject(update, name);
		const object = (num) => new RegExp(`\\n${num} 0 obj\\n(.*)\\nendobj`).exec(update)?.[1];
		const refs = (text) => [...text.matchAll(/(\d+) 0 R/g)].map((m) => m[1]);
		const flags = (name) => Number(/\/Ff (\d+)/.exec(field(name))?.[1] ?? 0);

		test('a field may be read-only, or left out when the form is submitted', () => {
			assert.equal(flags('name') & 1, 1);
			assert.equal(flags('amount') & 4, 4);
		});

		test('text lines up as aligned, in the field and in what Typst set', () => {
			assert.match(field('name'), /\/Q 2\b/);
			assert.match(field('amount'), /\/Q 1\b/);
			assert.match(field('country'), /\/Q 2\b/);
			assert.match(field('languages'), /\/Q 1\b/);
			assert.doesNotMatch(field('city'), /\/Q /);
		});

		test('spell checking, scrolling and committing on a pick are flags', () => {
			// DoNotSpellCheck (23) and DoNotScroll (24).
			assert.equal(flags('amount') & (1 << 22), 1 << 22);
			assert.equal(flags('amount') & (1 << 23), 1 << 23);
			// Combo (18), Edit (19), DoNotSpellCheck (23) and CommitOnSelChange (27).
			assert.equal(flags('country'), (1 << 17) | (1 << 18) | (1 << 22) | (1 << 26));
			assert.equal(flags('languages'), 1 << 26);
		});

		test('a checkbox may have a value of its own', () => {
			const agree = field('agree');
			assert.match(agree, /\/V \/accepted\//);
			assert.match(agree, /\/AS \/accepted\//);
			assert.match(agree, /\/AP <<\/N <<\/accepted \d+ 0 R\/Off \d+ 0 R>>>>/);
		});

		test('checkboxes of one name and different values are one field, ticked one or none', () => {
			const consent = field('consent');
			assert.match(consent, /\/FT \/Btn/);
			assert.doesNotMatch(consent, /\/Ff /);
			assert.match(consent, /\/V \/phone\//);
			assert.match(consent, new RegExp(`/TU <${hex('Contact consent')}>`));
			const kids = refs(/\/Kids \[([^\]]*)\]/.exec(consent)[1]).map(object);
			assert.match(kids[0], /\/AS \/Off\/AP <<\/N <<\/mail /);
			assert.match(kids[1], /\/AS \/phone\/AP <<\/N <<\/phone /);
			const alts = [...update.matchAll(/\/S \/Form[^\n]*\/Alt <([0-9a-f]+)>/g)].map((m) =>
				unhex(m[1]),
			);
			assert.deepEqual(alts.slice(0, 2), ['By mail', 'By phone']);
		});

		test('radio buttons of one value turn on together', () => {
			// Radio (16), NoToggleToOff (15) and RadiosInUnison (26).
			assert.equal(flags('size'), (1 << 15) | (1 << 14) | (1 << 25));
			const kids = refs(/\/Kids \[([^\]]*)\]/.exec(field('size'))[1]).map(object);
			assert.deepEqual(
				kids.map((kid) => /\/AS \/(\w+)/.exec(kid)[1]),
				['Off', 'm', 'm'],
			);
		});

		test('a field of one name in several places is one field, shown in each', () => {
			const name = field('name');
			const kids = refs(/\/Kids \[([^\]]*)\]/.exec(name)[1]);
			assert.equal(kids.length, 2);
			for (const kid of kids.map(object)) {
				assert.match(kid, /\/Subtype \/Widget/);
				assert.doesNotMatch(kid, /\/T /);
				const [, ap] = /\/AP <<\/N (\d+) 0 R/.exec(kid);
				assert.match(stream(update, ap), /\bTJ\b/);
			}
		});

		test('periods group names: a group holds its fields, the form its top groups and fields', () => {
			const person = field('person');
			assert.doesNotMatch(person, /\/FT /);
			const kids = refs(/\/Kids \[([^\]]*)\]/.exec(person)[1]).map(object);
			assert.deepEqual(
				kids.map((kid) => unhex(/\/T <([0-9a-f]+)>/.exec(kid)[1])),
				['name', 'address', 'country'],
			);
			const [, personRef] = new RegExp(`\\n(\\d+) 0 obj\\n<</T <${hex('person')}>`).exec(update);
			assert.match(field('city'), /\/Parent \d+ 0 R/);
			assert.match(kids[0], new RegExp(`/Parent ${personRef} 0 R`));
			const [, roots] = /<<\/Fields \[([^\]]*)\]\/DA /.exec(update);
			assert.equal(refs(roots).length, 10);
		});

		test('a reset or a submit may act on some fields only, a group as its fields', () => {
			// By their fully qualified names, as PDFium reads them.
			const [, list] = /\/A <<\/S \/ResetForm\/Fields \[([^\]]*)\]>>/.exec(field('clear'));
			assert.deepEqual(
				list.split(' ').map((name) => unhex(name.slice(1, -1))),
				['person.name', 'person.address.city', 'person.country'],
			);
			// Exclude (1), IncludeNoValueFields (2), ExportFormat (3) and GetMethod (4).
			assert.match(field('send'), new RegExp(`/Fields \\[<${hex('amount')}>\\]/Flags 15>>`));
		});

		test('signing locks all fields, or all but some', () => {
			assert.match(
				field('signature'),
				new RegExp(`/Lock <</Type /SigFieldLock/Action /Exclude/Fields \\[<${hex('amount')}>\\]>>`),
			);
			assert.match(field('witness'), /\/Lock <<\/Type \/SigFieldLock\/Action \/All>>/);
		});

		test('a pressed button shows its caption moved', () => {
			const [, normal, down] = /\/H \/P\/AP <<\/N (\d+) 0 R\/D (\d+) 0 R>>/.exec(field('clear'));
			assert.match(stream(update, normal), /^\nq\n1 0 0 1 -/);
			assert.match(stream(update, down), /^q\n1 0 0 1 0\.6 -0\.6 cm\nq\n1 0 0 1 -/);
		});

		test('passes PDF/UA-1', { skip: !hasVeraPdf && 'veraPDF is not installed' }, () => {
			assert.deepEqual(veraPdf([filled]), ['PASS']);
		});
	});
}

test('a button moves its caption by its press while pressed, or not at all with 0pt', () => {
	const pdf = compile(
		`${all}#button("far", "Far", press: 2pt) #button("still", "Still", press: 0pt)`,
	);
	const update = appended(pdf, addFields(pdf, codecs));
	const [, down] = /\/H \/P\/AP <<\/N \d+ 0 R\/D (\d+) 0 R>>/.exec(fieldObject(update, 'far'));
	assert.match(stream(update, down), /^q\n1 0 0 1 2 -2 cm\n/);
	assert.doesNotMatch(fieldObject(update, 'still'), /\/H |\/D \d/);
});

test(
	'a tagged PDF whose page tabs otherwise gets its tab order set to the structure',
	{ skip: !hasCli && 'no typst CLI, whose page dictionaries are uncompressed' },
	() => {
		const pdf = compile(`${all}Name: #text-field("name", label: "Name")`, { by: 'cli' });
		// "/Tabs/R", row order, in place of Typst's "/Tabs/S", at the same length.
		const text = Buffer.from(pdf).toString('latin1');
		assert.equal(text.match(/\/Tabs\/S/g)?.length, 1);
		const rowOrder = Buffer.from(text.replace('/Tabs/S', '/Tabs/R'), 'latin1');
		const update = appended(rowOrder, addFields(rowOrder, codecs));
		assert.match(update, /\/Type \/Page\b[^\n]*\/Tabs \/S/);
	},
);

describe('a preview', () => {
	const states = `${all}
#checkbox("a", label: "A", checked: true) #radio("b", "x", label: "X", checked: true)
#list-box("c", label: "C", options: ("x", "y"), value: "y")`;
	const unchecked = states.replaceAll('checked: true', 'checked: false').replace('value: "y"', '');

	test('draws the ticks, dots and highlights of the fields with the preview input', () => {
		// The tick's stroke, the dot's fill and the highlight's fill, which only the input draws.
		const marks = (svg) =>
			(svg.match(/<path[^>]*(fill="#000000"|stroke="#000000"|fill="#99bfd9")/g) ?? []).length;
		assert.equal(marks(compileSvg(unchecked, { [previewInput]: 'true' })), 0);
		assert.equal(marks(compileSvg(states)), 0);
		assert.equal(marks(compileSvg(states, { [previewInput]: 'true' })), 3);
	});
});

describe('addFields refuses', () => {
	const refuses = (body, message) => {
		const pdf = compile(`${all}${body}`);
		assert.throws(() => addFields(pdf, codecs), message);
	};

	test('a name an action or a lock gives, which no field has', () => {
		refuses(
			'#button("b", "B", action: (reset: true, fields: ("nobody",)))',
			/field "b" names "nobody", which is no field or group/,
		);
		refuses('#signature-field("s", label: "S", lock: ("nobody",))', /field "s" names "nobody"/);
	});

	test('a name that is a field and a group', () => {
		refuses(
			'#text-field("a", label: "A") #text-field("a.b", label: "B")',
			/"a" names a field and a group of fields/,
		);
	});

	test('a signature field in several places', () => {
		refuses(
			'#signature-field("s", label: "S") #signature-field("s", label: "S")',
			/signature field "s" is in several places/,
		);
	});

	test('a checkbox group with a value twice', () => {
		refuses(
			'#checkbox("c", label: "X", value: "x") #checkbox("c", label: "X", value: "x") #checkbox("c", label: "Y", value: "y")',
			/checkbox group "c" has the value "x" twice/,
		);
	});
});

describe('the library refuses', () => {
	const errors = (call) =>
		compileResult(`${all}#${call}`)
			.diagnostics.map((d) => d.message)
			.join();

	test('an alignment viewers do not know', () => {
		assert.match(errors('text-field("a", label: "A", align: top)'), /left, center or right/);
	});

	test('a key an action does not take', () => {
		assert.match(
			errors('button("a", "A", action: (link: "https://example.org", fields: ()))'),
			/with the keys each takes/,
		);
	});

	test('a submit of a format other than a web form by get', () => {
		assert.match(
			errors(
				'button("a", "A", action: (submit: "https://example.org", format: "pdf", method: "get"))',
			),
			/any other format by post/,
		);
	});

	test('a lock it does not know', () => {
		assert.match(errors('signature-field("a", label: "A", lock: 3)'), /has to be none, "all"/);
	});

	test('a button that would press its caption back', () => {
		assert.match(errors('button("a", "A", press: -1pt)'), /a length of 0pt or more/);
	});

	test('a checkbox whose value is Off', () => {
		assert.match(errors('checkbox("a", label: "A", value: "Off")'), /other than "Off"/);
	});
});
