// What the page and the service worker exchange, defined once for both: the request, which the page
// builds and the worker reads through `compileRequest`, and the answers, which the worker builds and
// the page reads through the functions below.

/** The address the worker answers, relative to the page and to the worker. */
export const COMPILE_PATH = 'compile';

/** The module file, relative to the page and to the worker, which lie in one directory. */
export const MODULE_PATH = '../../pkg/typst_wasm_bg.wasm';

/**
 * The files the examples read besides their source: by their path in the compiler's project, the
 * file beside the page and the worker.
 */
export const PROJECT_FILES = {
	'/pipeline.svg': 'pipeline.svg',
	'/refs.bib': 'samples/refs.bib',
};

/** Where the worker puts the edited source in the compiler's project. */
export const MAIN_PATH = '/main.typ';

/** The message that asks an active worker to take control of the page. */
export const CLAIM = 'claim';

/** The status of an answer whose source has errors; its body is JSON with the diagnostics. */
export const SOURCE_ERRORS = 422;

const DETAILS_LENGTH_HEADER = 'X-Typst-Details-Length';

/** Where the worker puts the Typst library of `@jsfi/typst-fields`, which the form imports. */
export const FIELDS_PATH = '/fields.typ';

/**
 * A request: `source` compiled to `format` (`"pdf"`, `"svg"` or `"query"`), `tagged` for a PDF,
 * `fields` for a PDF whose marked boxes become form fields, `inputs` as `sys.inputs`, and for a
 * query its `selector`, `field` and `one`.
 */
export function compileRequest({
	source,
	format = 'pdf',
	tagged = true,
	fields = false,
	inputs = {},
	selector,
	field,
	one,
}) {
	return { source, format, tagged, fields, inputs, selector, field, one };
}

/**
 * A JSON answer: `{ svg, diagnostics, milliseconds }` for SVG, `{ value, diagnostics }` for a
 * query, `{ diagnostics, milliseconds }` for a PDF with errors, `{ error }` when the worker
 * failed.
 */
export function jsonAnswer(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

/**
 * A PDF answer: JSON with the warnings and the compile time, then the PDF. The JSON's length in
 * bytes is in a header; in the body, the warnings can be as many as the document gives.
 */
export function pdfAnswer(pdf, diagnostics, milliseconds) {
	const details = new TextEncoder().encode(JSON.stringify({ diagnostics, milliseconds }));
	return new Response(new Blob([details, pdf]), {
		headers: {
			'Content-Type': 'application/octet-stream',
			[DETAILS_LENGTH_HEADER]: String(details.length),
		},
	});
}

/** A PDF answer read: `{ pdf, diagnostics, milliseconds }`, the PDF as a `Blob`. */
export async function readPdfAnswer(response) {
	const body = await response.blob();
	const length = Number(response.headers.get(DETAILS_LENGTH_HEADER));
	const details = JSON.parse(await body.slice(0, length).text());
	return { ...details, pdf: body.slice(length, body.size, 'application/pdf') };
}
