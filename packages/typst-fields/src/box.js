// The box a field covers: its marker annotation's rectangle (ISO 32000 §7.9.5), which a widget keeps
// as its own, and its size, which the field's appearances are drawn at.

/** The box of `annotation`: `rect` with its lower-left corner first, and its `width` and `height`. */
export function annotationBox(document, annotation) {
	const [x1, y1, x2, y2] = annotation.get('Rect').map((v) => document.resolve(v));
	const rect = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
	return { rect, width: rect[2] - rect[0], height: rect[3] - rect[1] };
}
