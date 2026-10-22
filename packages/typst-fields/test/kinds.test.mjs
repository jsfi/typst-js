// What each kind of field the library marks becomes in the PDFs of both packages: password and comb
// text fields, radio groups, drop-down lists, list boxes, push buttons and signature fields, and
// what the library and addFields refuse of them.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { deflateSync, inflateSync } from 'node:zlib';

import { addFields } from '@jsfi/typst-fields';

import {
	appended,
	compile,
	compileResult,
	fieldObject,
	hasCli,
	hasVeraPdf,
	hex,
	preamble,
	stream,
	unhex,
	veraPdf,
} from './helpers.mjs';

const kinds = `${preamble.replace('checkbox, text-field', '*')}
PIN: #text-field("pin", label: "PIN", password: true, width: 3cm)

Postcode: #text-field("postcode", label: "Postcode", comb: true, max-length: 6, width: 4cm, value: "EH66QW")

Contact:
#radio("contact", "email", label: "By e-mail", group-label: "How to contact you", checked: true) E-mail
#radio("contact", "phone", label: "By phone") Phone

Country: #dropdown("country", label: "Country", options: (("de", "Germany"), ("gb", "United Kingdom")), value: "gb")

Title: #dropdown("title", label: "Title", options: ("Dr", "Prof"), value: "Rev", editable: true)

Languages: #list-box("languages", label: "Languages", options: ("English", "Deutsch", "Français", "العربية"), value: ("Deutsch", "العربية"), multiple: true)

Signature: #signature-field("signature", label: "Signature", required: true)
`;

/** Push buttons, which PDF/A forbids. */
const buttons = `
#button("send", "Send", action: (submit: "https://example.org/apply"))
#button("help", [*Help*], label: "Help", action: (link: "https://example.org/help"))
`;

const codecs = { inflate: inflateSync, deflate: deflateSync };

for (const by of ['wasm', ...(hasCli ? ['cli'] : [])]) {
	describe(`the kinds of field in a PDF of @jsfi/typst-${by}`, () => {
		const pdf = compile(kinds + buttons, { by });
		const filled = addFields(pdf, codecs);
		const update = appended(pdf, filled);
		const field = (name) => fieldObject(update, name);
		const appearance = (name) => stream(update, /\/AP <<\/N (\d+) 0 R/.exec(field(name))[1]);

		test('a password field hides what is typed, a comb field shows a cell per character', () => {
			assert.match(field('pin'), /\/FT \/Tx.*\/Ff 8192\b/);
			assert.match(field('postcode'), /\/Ff 16777216\/MaxLen 6\b/);
			assert.match(appearance('postcode'), /^\/Tx BMC\n[^]*T[Jj][^]*EMC\n$/);
		});

		test('radio buttons become one field, with a widget per button', () => {
			const group = field('contact');
			// Radio (16) and NoToggleToOff (15); the group's label names it.
			assert.match(group, /\/FT \/Btn/);
			assert.match(group, /\/Ff 49152\b/);
			assert.match(group, new RegExp(`/TU <${hex('How to contact you')}>`));
			assert.match(group, /\/V \/email\/DV \/email\//);
			assert.match(group, /\/Kids \[\d+ 0 R \d+ 0 R\]/);
			const kids = [
				...update.matchAll(/\/Parent (\d+) 0 R\/AS \/(\w+)\/AP <<\/N <<\/(\w+) \d+ 0 R/g),
			];
			assert.deepEqual(
				kids.map(([, , state, on]) => [state, on]),
				[
					['email', 'email'],
					['Off', 'phone'],
				],
			);
			// Each button's own label, on its Form element.
			const alts = [...update.matchAll(/\/S \/Form[^\n]*\/Alt <([0-9a-f]+)>/g)];
			assert.deepEqual(
				alts.map(([, label]) => unhex(label)),
				['By e-mail', 'By phone'],
			);
		});

		test('a drop-down list shows the picked option, and may take a value of its own', () => {
			assert.match(field('country'), /\/FT \/Ch/);
			assert.match(field('country'), /\/Opt \[\[<6465> <4765726d616e79>\] \[<6762> /);
			assert.match(field('country'), /\/V <6762>\/DV <6762>/);
			assert.match(field('country'), /\/Ff 131072\b/);
			assert.match(appearance('country'), /^\/Tx BMC\n[^]*TJ[^]*EMC\n$/);
			// Combo (18) and Edit (19).
			assert.match(field('title'), /\/V <526576>[^\n]*\/Ff 393216\b/);
		});

		test('a list box shows its options, the picked ones highlighted', () => {
			assert.match(field('languages'), /\/Ff 2097152\b/);
			assert.match(field('languages'), /\/V \[<44657574736368> <feff[0-9a-f]+>\]/);
			assert.match(field('languages'), /\/I \[1 3\]/);
			const content = appearance('languages');
			assert.match(content, /^\/Tx BMC\nq\n0\.6 0\.75 0\.85 rg\n[^\n]+ re\n[^\n]+ re\nf\nQ\n/);
			assert.equal(content.match(/\bTJ\b/g)?.length, 4);
		});

		test('a push button acts, and shows its caption as Typst set it', () => {
			assert.match(field('send'), /\/Ff 65536\b/);
			assert.match(
				field('send'),
				new RegExp(
					`/A <</S /SubmitForm/F <</FS /URL/F <${hex('https://example.org/apply')}>>>/Flags 4>>`,
				),
			);
			assert.match(field('help'), /\/A <<\/S \/URI\/URI </);
			for (const name of ['send', 'help']) {
				assert.match(appearance(name), /^\nq\n1 0 0 1 [^]*TJ[^]*Q\n\n$/);
			}
			// The bold caption's own <Strong> element leaves the Form element with the rest.
			const forms = update.match(/\/S \/Form[^\n]*/g) ?? [];
			for (const element of forms) assert.match(element, /\/K \[<<\/Type \/OBJR[^\]]*\]/);
		});

		test('a signature field waits for the reader to sign', () => {
			assert.match(field('signature'), /\/FT \/Sig\/Ff 2\b/);
			assert.equal(appearance('signature'), '');
		});

		test('passes PDF/UA-1', { skip: !hasVeraPdf && 'veraPDF is not installed' }, () => {
			assert.deepEqual(veraPdf([filled]), ['PASS']);
		});
	});
}

describe('a push button', () => {
	const source = `${preamble.replace('checkbox, text-field', '*')}#button("reset", "Reset form")`;

	test('resets the form unless told otherwise', () => {
		const pdf = compile(source);
		assert.match(appended(pdf, addFields(pdf, codecs)), /\/A <<\/S \/ResetForm>>/);
	});

	test('is refused in a PDF/A, which forbids actions on widgets', () => {
		const pdf = compile(source, { pdf: { pdfStandards: ['ua-1', 'a-2b'] } });
		assert.throws(() => addFields(pdf, codecs), /PDF\/A forbids push buttons/);
	});
});

test(
	'every other kind passes PDF/A-2b',
	{ skip: !hasVeraPdf && 'veraPDF is not installed' },
	() => {
		const pdf = compile(kinds, { pdf: { pdfStandards: ['ua-1', 'a-2b'] } });
		const filled = addFields(pdf, codecs);
		assert.deepEqual(veraPdf([filled]), ['PASS']);
		assert.deepEqual(veraPdf([filled], '2b'), ['PASS']);
	},
);

test('a list box in an untagged PDF is refused, as its options are drawn', () => {
	const source = `${preamble.replace('checkbox, text-field', '*')}#list-box("a", label: "A", options: ("x",))`;
	const pdf = compile(source, { pdf: { tagged: false } });
	assert.throws(() => addFields(pdf, codecs), /field "a" has options, which needs a tagged PDF/);
});

describe('addFields refuses a radio group', () => {
	const refuses = (body, message) => {
		const pdf = compile(`${preamble.replace('checkbox, text-field', '*')}${body}`);
		assert.throws(() => addFields(pdf, codecs), message);
	};

	test('with two values checked', () => {
		refuses(
			'#radio("g", "a", label: "A", checked: true) #radio("g", "b", label: "B", checked: true)',
			/radio group "g" has several values checked/,
		);
	});

	test('with buttons of one value checked and not', () => {
		refuses(
			'#radio("g", "a", label: "A", checked: true) #radio("g", "a", label: "Again")',
			/radio group "g" has buttons of the value "a" checked and not/,
		);
	});

	test('with different group labels', () => {
		refuses(
			'#radio("g", "a", label: "A", group-label: "One") #radio("g", "b", label: "B", group-label: "Two")',
			/radio group "g" has different group labels/,
		);
	});

	test('whose name another field has', () => {
		refuses(
			'#radio("g", "a", label: "A") #text-field("g", label: "G")',
			/two fields are named "g"/,
		);
	});
});

describe('the library refuses', () => {
	const errors = (call) =>
		compileResult(`${preamble.replace('checkbox, text-field', '*')}#${call}`).diagnostics.map(
			(d) => d.message,
		);

	test('a password field with a value', () => {
		assert.match(
			errors('text-field("a", label: "A", password: true, value: "x")').join(),
			/starts empty/,
		);
	});

	test('a comb field without max-length', () => {
		assert.match(errors('text-field("a", label: "A", comb: true)').join(), /needs a max-length/);
	});

	test('a radio button without a value', () => {
		assert.match(errors('radio("g", "", label: "A")').join(), /needs a value/);
	});

	test('a drop-down list whose value is not an option', () => {
		assert.match(
			errors('dropdown("a", label: "A", options: ("x",), value: "y")').join(),
			/one of its options' values/,
		);
	});

	test('a list box with several values, unless multiple', () => {
		assert.match(
			errors('list-box("a", label: "A", options: ("x", "y"), value: ("x", "y"))').join(),
			/needs multiple: true/,
		);
	});

	test('choice fields without options, or with one twice', () => {
		assert.match(errors('dropdown("a", label: "A")').join(), /needs options/);
		assert.match(errors('list-box("a", label: "A", options: ("x", "x"))').join(), /option twice/);
	});

	test('a button without an action it knows', () => {
		assert.match(errors('button("a", "A", action: "print")').join(), /has to be "reset"/);
	});

	test('a button whose caption is no string and that has no label', () => {
		assert.match(errors('button("a", [*A*])').join(), /field "a" needs a label/);
	});
});
