// What the kinds of field share: the shape each kind's module exports, the field flags (ISO 32000
// §12.7.3.1, Tables 221, 226, 228 and 230), and the checks of their settings.

import { emptyAppearance } from '../appearance.js';
import { defaultAppearance } from '../font.js';

/** Field flags, by bit value. */
const FLAG = {
	readOnly: 1 << 0,
	required: 1 << 1,
	noExport: 1 << 2,
	multiline: 1 << 12,
	password: 1 << 13,
	noToggleToOff: 1 << 14,
	radio: 1 << 15,
	pushbutton: 1 << 16,
	combo: 1 << 17,
	edit: 1 << 18,
	multiSelect: 1 << 21,
	doNotSpellCheck: 1 << 22,
	doNotScroll: 1 << 23,
	comb: 1 << 24,
	radiosInUnison: 1 << 25,
	commitOnSelChange: 1 << 26,
};

/** The quadding of variable text (§12.7.3.3): how a field's text lines up. */
const QUADDING = { left: 0, center: 1, right: 2 };

/**
 * A kind of field, from what sets it apart, with defaults for what it leaves out:
 *
 * - `type`: its name in a marker's settings.
 * - `read(settings)`: its own settings, checked, or `undefined` for invalid ones. They include
 *   `draws`, `'value'`, `'options'` or `'caption'`, when Typst draws something in its box.
 * - `merge(name, widgets, common)`: the field the widgets of one name make; `mirror` by default.
 * - `perWidget`: the settings that may differ between the places one field is shown in, such as its
 *   text's size, which `mirror` lets them; none by default.
 * - `fieldEntries(field, named)`: the field's own entries, in order.
 * - `widgetEntries(widget, field, settings, context)`: sets a widget's appearances and state.
 * - `framing(settings, box)`: the appearances what Typst drew in the box moves into, each as what
 *   surrounds it; none by default.
 * - `typed`: whether the reader types or picks in it, in the form's default appearance.
 * - `acts`: whether it carries an action, which PDF/A forbids.
 * - `names(field)`: the fields and groups its action or lock acts on, by name; none by default.
 */
export function kind(spec) {
	const perWidget = spec.perWidget ?? [];
	return {
		merge: (name, widgets, common) => mirror(name, widgets, common, perWidget),
		framing: () => [],
		typed: false,
		acts: false,
		names: () => [],
		...spec,
		perWidget,
	};
}

/**
 * The field the widgets of one name make when they show one field in several places: they have to
 * agree in everything but the settings `perWidget` names.
 */
export function mirror(name, widgets, common, perWidget = []) {
	const [first] = widgets;
	const ignored = Object.fromEntries(perWidget.map((setting) => [setting, undefined]));
	const key = (w) => JSON.stringify({ ...w, ...ignored });
	if (widgets.some((w) => key(w) !== key(first))) {
		throw new Error(`the fields named "${name}" differ in their settings, which one field cannot`);
	}
	return { ...first, ...common, label: first.label, widgets };
}

/**
 * `/Ff`: the flags every field takes, from its `readOnly`, `required` and `exported`, and
 * `kindFlags`, the kind's, by name; `undefined` when none is set.
 */
export function flags(field, kindFlags = {}) {
	const set = {
		readOnly: field.readOnly,
		required: field.required,
		noExport: !field.exported,
		...kindFlags,
	};
	const bits = Object.entries(set).reduce((sum, [flag, on]) => sum | (on ? FLAG[flag] : 0), 0);
	return bits || undefined;
}

/** A dictionary of `pairs`, in their order, leaving out those whose value is `undefined`. */
export function entries(pairs) {
	return new Map(pairs.filter(([, value]) => value !== undefined));
}

/** `/Q` of an alignment, or `undefined` for left, which is the default. */
export function quadding(align) {
	return align === 'left' ? undefined : QUADDING[align];
}

/**
 * Sets a widget of a field the reader types or picks in: its default appearance, at its text's
 * size, and its appearance, what Typst drew if it moved any, else an empty one.
 */
export function typedWidgetEntries(widget, settings, { box, moved, fontRef, objects }) {
	widget.set('DA', defaultAppearance(settings.size));
	widget.set('AP', new Map([['N', moved?.[0] ?? objects.add(emptyAppearance(box, fontRef))]]));
}

/** Whether all `values` are booleans, as settings that switch something on or off are. */
export function isBooleans(...values) {
	return values.every((value) => typeof value === 'boolean');
}

/** Whether `value` is a size in points, or a line height: a number of 0 or more. */
export function isSize(value) {
	return typeof value === 'number' && value >= 0;
}

/** Whether `value` is an alignment a field's text takes: left, center or right. */
export function isAlign(value) {
	return Object.hasOwn(QUADDING, value);
}

/** Whether `value` is an array of field or group names, as actions and locks give them. */
export function isNames(value) {
	return Array.isArray(value) && value.every((name) => typeof name === 'string');
}
