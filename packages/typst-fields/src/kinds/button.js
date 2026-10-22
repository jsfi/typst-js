// Push buttons (ISO 32000 §12.7.4.2.2): no value, an action when clicked (§12.6.4), and the caption
// Typst drew in the box, which moves into the button, once as it looks and once pressed.

import { formatNumber, Name, PdfString } from '../syntax.js';
import { entries, flags, isNames, kind } from './common.js';

/** The flags of the reset-form and submit-form actions (§12.7.5.2, Tables 237 and 239). */
const ACTION_FLAG = { exclude: 1 << 0, empty: 1 << 1, get: 1 << 3 };
const SUBMIT_FORMAT = { html: 1 << 2, fdf: 0, xfdf: 1 << 5, pdf: 1 << 8 };

/** The kind of push buttons. */
export const button = kind({
	type: 'button',
	acts: true,
	read(settings) {
		const action = readAction(settings.action);
		const { press } = settings;
		const ok = action !== undefined && typeof press === 'number' && press >= 0;
		return ok ? { action, press, draws: 'caption' } : undefined;
	},
	names: (field) => (field.action.type === 'link' ? [] : field.action.fields),
	fieldEntries: (field) =>
		entries([
			['FT', new Name('Btn')],
			['Ff', flags(field, { pushbutton: true })],
		]),
	widgetEntries(widget, field, settings, { moved, named }) {
		const [normal, down] = moved;
		widget.set('A', actionEntries(settings.action, named));
		// Pressed, the viewer shows the down appearance; without one, it highlights the button its
		// own way.
		if (down) widget.set('H', new Name('P'));
		widget.set(
			'AP',
			entries([
				['N', normal],
				['D', down],
			]),
		);
	},
	// The caption as it looks, and pressed, moved by `press` points right and down unless that is 0.
	framing(settings) {
		const shift = `${formatNumber(settings.press)} ${formatNumber(-settings.press)}`;
		const pressed = [`q\n1 0 0 1 ${shift} cm`, 'Q'];
		return settings.press > 0 ? [['', ''], pressed] : [['', '']];
	},
});

/** A button's action, checked: reset the form, submit it, or open a link. */
function readAction(action) {
	if (action === null || typeof action !== 'object') return undefined;
	const { fields = [], exclude = false, empty = false, format = 'html', method = 'post' } = action;
	if (!isNames(fields) || typeof exclude !== 'boolean' || typeof empty !== 'boolean') {
		return undefined;
	}
	if (action.reset === true) return { type: 'reset', fields, exclude };
	if (typeof action.link === 'string') return { type: 'link', url: action.link };
	const ok =
		typeof action.submit === 'string' &&
		Object.hasOwn(SUBMIT_FORMAT, format) &&
		(method === 'post' || (method === 'get' && format === 'html'));
	return ok
		? { type: 'submit', url: action.submit, format, method, fields, exclude, empty }
		: undefined;
}

/** The action dictionary of `spec`; `named(names)` gives the fields it acts on by name. */
function actionEntries(spec, named) {
	const url = (text) => new PdfString(new TextEncoder().encode(text));
	if (spec.type === 'link') {
		return entries([
			['S', new Name('URI')],
			['URI', url(spec.url)],
		]);
	}
	const submit = spec.type === 'submit';
	const bits =
		(spec.exclude ? ACTION_FLAG.exclude : 0) |
		(submit ? SUBMIT_FORMAT[spec.format] : 0) |
		(submit && spec.empty ? ACTION_FLAG.empty : 0) |
		(submit && spec.method === 'get' ? ACTION_FLAG.get : 0);
	const target = new Map([
		['FS', new Name('URL')],
		['F', url(spec.url ?? '')],
	]);
	return entries([
		['S', new Name(submit ? 'SubmitForm' : 'ResetForm')],
		['F', submit ? target : undefined],
		['Fields', spec.fields.length > 0 ? named(spec.fields) : undefined],
		['Flags', bits || undefined],
	]);
}
