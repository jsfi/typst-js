// The appearances of widgets (ISO 32000 §12.5.5): form XObjects as large as a field's box, which
// viewers draw over it. An empty text or choice field has the `/Tx BMC … EMC` section viewers fill
// when the reader types (§12.7.4.3); a field with a value takes its appearance from the page, where
// Typst drew the value (see `values.js`).

import { FONT_NAME } from './font.js';
import { latin1, Name, Stream } from './syntax.js';

/**
 * How far from its edges viewers draw a field's text, in points; what Typst sets in it keeps to
 * that.
 */
export const PADDING = 2;

/** A form XObject of `box`'s size that draws `content`, with `resources` when it uses any. */
export function formXObject(box, content, resources) {
	const dict = new Map([
		['Type', new Name('XObject')],
		['Subtype', new Name('Form')],
		['BBox', [0, 0, box.width, box.height]],
	]);
	if (resources) dict.set('Resources', resources);
	return new Stream(dict, content);
}

/** The appearance of an empty field of `box`'s size, typed in the font `fontRef`. */
export function emptyAppearance(box, fontRef) {
	const resources = new Map([['Font', new Map([[FONT_NAME, fontRef]])]]);
	return formXObject(box, latin1('/Tx BMC\nEMC'), resources);
}

/** An appearance that draws nothing: a signature field's until it is signed, a button's off state. */
export function plainAppearance(box) {
	return formXObject(box, latin1(''));
}
