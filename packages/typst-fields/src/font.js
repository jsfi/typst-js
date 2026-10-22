// The font text and choice fields are typed in: Helvetica, unembedded, so that what the reader types
// is drawn in a font of their viewer and the PDF carries none for it. An empty field's appearance
// draws no text, so PDF/UA-1, which requires every font that draws to be embedded, still holds; a
// prefilled value is drawn in the document's own fonts, by Typst (see `values.js`).

import { formatNumber, latin1, Name, PdfString } from './syntax.js';

/** The name the fields' default appearance gives the font they are typed in. */
export const FONT_NAME = 'FieldFont';

/** Adds Helvetica, unembedded, to `objects`: a standard font every viewer has (§9.6.2.2). */
export function helvetica(objects) {
	return objects.add(
		new Map([
			['Type', new Name('Font')],
			['Subtype', new Name('Type1')],
			['BaseFont', new Name('Helvetica')],
			['Encoding', new Name('WinAnsiEncoding')],
		]),
	);
}

/** The default appearance (§12.7.3.3) at `size` points, black; 0 lets the viewer fit the text. */
export function defaultAppearance(size) {
	return new PdfString(latin1(`/${FONT_NAME} ${formatNumber(size)} Tf 0 g`));
}
