// The appearances of checkboxes and radio buttons (ISO 32000 §12.7.4.2.3, §12.7.4.2.4): a tick or a
// dot for the on state, and nothing for `/Off`, as the box or circle beneath is the page's. Both are
// paths, not ZapfDingbats glyphs as viewers draw them, so that they need no font, which PDF/UA-1
// would require to be embedded.

import { formXObject, plainAppearance } from './appearance.js';
import { formatNumber, latin1 } from './syntax.js';

/** The name of a checkbox's on state, the one PDF 2.0 recommends. */
export const ON = 'Yes';

/** The tick's corners, as fractions of the square it is drawn in, from its short arm to its long. */
export const TICK = [
	[0.2, 0.52],
	[0.42, 0.28],
	[0.8, 0.76],
];

/** The tick's line width, as a fraction of the square it is drawn in. */
export const TICK_WIDTH = 0.12;

/** The dot's radius, as a fraction of the circle it is drawn in. */
export const DOT = 0.27;

/**
 * How far a cubic Bézier's control points lie to draw a quarter circle, as a fraction of its
 * radius.
 */
const KAPPA = 0.5523;

/** The appearance streams of a checkbox of `box`'s size: `on`, ticked, and `off`. */
export function checkboxAppearances(box) {
	const { x, y, side } = square(box);
	const [first, ...rest] = TICK.map(
		([u, v]) => `${formatNumber(x + u * side)} ${formatNumber(y + v * side)}`,
	);
	const path = `${first} m\n${rest.map((point) => `${point} l\n`).join('')}S`;
	const tick = `q\n0 G\n${formatNumber(side * TICK_WIDTH)} w\n1 J\n1 j\n${path}\nQ`;
	return states(box, tick);
}

/** The appearance streams of a radio button of `box`'s size: `on`, a dot, and `off`. */
export function radioAppearances(box) {
	const { x, y, side } = square(box);
	const [cx, cy, r] = [x + side / 2, y + side / 2, side * DOT];
	const k = r * KAPPA;
	const curve = (points) => `${points.map(formatNumber).join(' ')} c\n`;
	const dot =
		`q\n0 g\n${formatNumber(cx + r)} ${formatNumber(cy)} m\n` +
		curve([cx + r, cy + k, cx + k, cy + r, cx, cy + r]) +
		curve([cx - k, cy + r, cx - r, cy + k, cx - r, cy]) +
		curve([cx - r, cy - k, cx - k, cy - r, cx, cy - r]) +
		curve([cx + k, cy - r, cx + r, cy - k, cx + r, cy]) +
		'f\nQ';
	return states(box, dot);
}

/** The largest square centred in `box`. */
function square({ width, height }) {
	const side = Math.min(width, height);
	return { x: (width - side) / 2, y: (height - side) / 2, side };
}

/** The appearances of a button's states: `on` drawing `on`, `off` drawing nothing. */
function states(box, on) {
	return { on: formXObject(box, latin1(on)), off: plainAppearance(box) };
}
