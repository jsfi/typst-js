/**
 * The Typst library that marks fields. Add it to the project, for example as `/fields.typ`, and
 * import from it `text-field`, `checkbox`, `radio`, `dropdown`, `list-box`, `button` and
 * `signature-field`.
 */
export const fieldsLibrary: string;

/**
 * The input that has the Typst library draw on the page what only the fields draw in the PDF, a
 * checkbox's tick, a radio button's dot and a list box's highlight, for a preview made without
 * `addFields`, such as an SVG: set it to `"true"` with `setInputs`. Never set it for the PDF given
 * to `addFields`, or the page shows them beneath the fields, whatever the reader changes.
 */
export const previewInput: 'fields-preview';

/** Decompresses zlib data (RFC 1950), as `node:zlib`'s `inflateSync` and fflate's `unzlibSync` do. */
export type Inflate = (data: Uint8Array) => Uint8Array;

/**
 * Compresses data as zlib data (RFC 1950), as `node:zlib`'s `deflateSync` and fflate's `zlibSync`
 * do.
 */
export type Deflate = (data: Uint8Array) => Uint8Array;

/** `Inflate`, or one that returns a promise, such as one that runs a `DecompressionStream`. */
export type InflateAsync = (data: Uint8Array) => Uint8Array | Promise<Uint8Array>;

/** `Deflate`, or one that returns a promise, such as one that runs a `CompressionStream`. */
export type DeflateAsync = (data: Uint8Array) => Uint8Array | Promise<Uint8Array>;

export interface FieldOptions {
	/**
	 * Decompresses the PDF's compressed data: the object streams of @jsfi/typst-wasm's PDFs, and the
	 * pages of fields with values. Not called for a PDF without either.
	 */
	inflate?: Inflate;
	/**
	 * Compresses the pages and appearances of fields with values, which `addFields` writes anew. Not
	 * called for a PDF whose fields have no values.
	 */
	deflate?: Deflate;
}

/** `FieldOptions`, whose functions may return promises. */
export interface FieldOptionsAsync {
	inflate?: InflateAsync;
	deflate?: DeflateAsync;
}

/**
 * The PDF with a form field over every box the Typst library marked, or `pdf` itself when it has
 * none. The fields are added as an incremental update, after the PDF's unchanged bytes.
 */
export function addFields(pdf: Uint8Array, options?: FieldOptions): Uint8Array;

/**
 * `addFields` with an `inflate` and a `deflate` that may return promises, such as ones that run the
 * browser's `DecompressionStream` and `CompressionStream`.
 */
export function addFieldsAsync(pdf: Uint8Array, options?: FieldOptionsAsync): Promise<Uint8Array>;
