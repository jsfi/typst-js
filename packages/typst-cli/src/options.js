// The option objects of the API, read into what the CLI needs. The program checks the values itself,
// and its reasons are thrown (see `spawnCli`); checked here is only a value of the wrong type, which
// would otherwise pass as another.

import { PdfSettings } from './settings.js';

/** `check(value, option)` for a value that is set, as the module reads an optional field. */
const checkIfSet = (value, check, option) =>
	value === undefined || value === null ? undefined : check(value, option);

/** `options` of `compilePdf`, read. */
export function pdfSettings(options) {
	const { tagged, timestamp, pdfStandards, pages } = options ?? {};
	return new PdfSettings({
		requestedTagged: checkIfSet(tagged, checkedBoolean, 'PdfOptions.tagged'),
		timestamp: checkIfSet(timestamp, checkedTimestamp),
		standards: checkIfSet(pdfStandards, checkedStandards) ?? [],
		pages: checkIfSet(pages, checkedString, 'PdfOptions.pages'),
	});
}

/** The page selection in the `options` of `compileSvg`; `undefined` for all pages. */
export function svgPages(options) {
	return checkIfSet(options?.pages, checkedString, 'SvgOptions.pages');
}

/** `options` of `query`, read: `{ field, one }`. */
export function querySettings(options) {
	const { field, one } = options ?? {};
	return {
		field: checkIfSet(field, checkedString, 'QueryOptions.field'),
		one: checkIfSet(one, checkedBoolean, 'QueryOptions.one') === true,
	};
}

/** `inputs` for `sys.inputs` as a `Map`; the CLI trims keys and values as it reads them. */
export function inputMap(inputs) {
	if (typeof inputs !== 'object' || inputs === null || Array.isArray(inputs)) {
		throw new Error('inputs must be an object');
	}
	for (const [key, value] of Object.entries(inputs)) {
		if (typeof value !== 'string') {
			throw new Error(`invalid value for input '${key}': inputs must be strings`);
		}
		// The CLI splits `--input key=value` at the first `=`, so such a key would arrive as another.
		if (key.includes('=')) {
			throw new Error(`invalid input key '${key}': it must not contain '='`);
		}
	}
	return new Map(Object.entries(inputs));
}

export function checkedString(value, option) {
	if (typeof value !== 'string') throw new Error(`${option} must be a string`);
	return value;
}

export function checkedBoolean(value, option) {
	if (typeof value !== 'boolean') throw new Error(`${option} must be a boolean`);
	return value;
}

/** A timestamp as milliseconds since 1970, from a `Date` or a number. */
function checkedTimestamp(value) {
	if (value instanceof Date) return value.getTime();
	if (typeof value === 'number') return value;
	throw new Error('PdfOptions.timestamp must be a Date or a number of milliseconds');
}

function checkedStandards(value) {
	if (!Array.isArray(value) || value.some((name) => typeof name !== 'string')) {
		throw new Error('PdfOptions.pdfStandards must be an array of strings');
	}
	return value;
}
