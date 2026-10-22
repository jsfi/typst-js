// @jsfi/typst-fields: fillable form fields for the PDFs of @jsfi/typst-wasm and @jsfi/typst-cli. The
// Typst library marks where fields go; `addFields` turns the marks of the finished PDF into fields.

import { addFieldsTo } from './fields.js';

export { fieldsLibrary, previewInput } from './library.js';

/** Why each codec's data is handed to the caller, for the error when its option is missing. */
const NEEDED_FOR = {
	inflate: 'the PDF has compressed data, which needs the `inflate` option to read',
	deflate:
		'the PDF has fields that show what Typst set in them, whose pages need the `deflate` option to write',
};

/**
 * `pdf` with a form field over every box the Typst library marked, or `pdf` itself when it has
 * none. `inflate` and `deflate` have to be synchronous; `addFieldsAsync` also takes ones that
 * return promises.
 */
export function addFields(pdf, options = {}) {
	const steps = addFieldsTo(pdf);
	let step = steps.next();
	while (!step.done) {
		const { codec, data } = step.value;
		const results = data.map((bytes) => {
			const result = codecFor(options, codec)(bytes);
			if (typeof result?.then === 'function') {
				throw new TypeError(`${codec} returned a promise; use addFieldsAsync for that`);
			}
			return asBytes(result, codec);
		});
		step = steps.next(results);
	}
	return step.value;
}

/** `addFields` with an `inflate` and a `deflate` that may return promises. */
export async function addFieldsAsync(pdf, options = {}) {
	const steps = addFieldsTo(pdf);
	let step = steps.next();
	while (!step.done) {
		const { codec, data } = step.value;
		const results = await Promise.all(data.map((bytes) => codecFor(options, codec)(bytes)));
		step = steps.next(results.map((result) => asBytes(result, codec)));
	}
	return step.value;
}

/** The caller's function for `codec`, `inflate` or `deflate`; throws when the options lack it. */
function codecFor(options, codec) {
	if (typeof options[codec] !== 'function') throw new TypeError(NEEDED_FOR[codec]);
	return options[codec];
}

/** `data` as `codec` returned it, which has to be bytes. */
function asBytes(data, codec) {
	if (!(data instanceof Uint8Array)) throw new TypeError(`${codec} has to return a Uint8Array`);
	return data;
}
