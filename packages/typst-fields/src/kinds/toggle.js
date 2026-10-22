// What checkboxes and radio buttons share (ISO 32000 §12.7.4.2.3–4): a value per button, which the
// field takes when the button is on, and buttons of one name grouped into one field, of which at
// most one value is on.

import { Name } from '../syntax.js';
import { ON } from '../toggle-appearances.js';
import { entries, flags, isBooleans } from './common.js';

/** A button's settings: its value, `Yes` unless given, whether it is on, and its group's label. */
export function readToggle(settings) {
	const { value = ON, checked = false } = settings;
	const groupLabel = settings['group-label'] ?? undefined;
	const ok =
		typeof value === 'string' &&
		value !== '' &&
		value !== 'Off' &&
		isBooleans(checked) &&
		(groupLabel === undefined || typeof groupLabel === 'string');
	return ok ? { value, checked, groupLabel } : undefined;
}

/**
 * The field the buttons `widgets` of one name make as a group, `what`, such as "radio group": the
 * value of the button that is on, or none; buttons of one value turn on together, if `unison`
 * allows it. Throws for several values on, buttons of one value both on and off, a value twice
 * without `unison`, and different group labels.
 */
export function group(what, name, widgets, common, { unison: unisonAllowed }) {
	const checked = new Set(widgets.filter((w) => w.checked).map((w) => w.value));
	if (checked.size > 1) throw new Error(`${what} "${name}" has several values checked`);
	const values = widgets.map((w) => w.value);
	const unison = new Set(values).size < values.length;
	if (unison && !unisonAllowed) {
		const twice = values.find((v, i) => values.indexOf(v) !== i);
		throw new Error(`${what} "${name}" has the value "${twice}" twice`);
	}
	if (widgets.some((w) => !w.checked && checked.has(w.value))) {
		throw new Error(
			`${what} "${name}" has buttons of the value "${[...checked][0]}" checked and not`,
		);
	}
	const labels = new Set(widgets.flatMap((w) => w.groupLabel ?? []));
	if (labels.size > 1) throw new Error(`${what} "${name}" has different group labels`);
	const [label] = labels;
	const [value] = checked;
	return { ...common, label, value, unison, widgets, grouped: true };
}

/**
 * A toggle field's entries: its value, as a name or `/Off`, and its flags with the kind's
 * `kindFlags`.
 */
export function toggleEntries(field, kindFlags) {
	const state = new Name(onValue(field) ?? 'Off');
	return entries([
		['FT', new Name('Btn')],
		['V', state],
		['DV', state],
		['Ff', flags(field, kindFlags)],
	]);
}

/** Sets a button's widget: on or off, and its appearances, `draw(box)` for the on state. */
export function toggleWidgetEntries(widget, field, settings, { box, objects }, draw) {
	const { on, off } = draw(box);
	const isOn = settings.value === onValue(field);
	widget.set('AS', new Name(isOn ? settings.value : 'Off'));
	widget.set(
		'AP',
		new Map([
			[
				'N',
				new Map([
					[settings.value, objects.add(on)],
					['Off', objects.add(off)],
				]),
			],
		]),
	);
}

/** The value a toggle field has: of a group the value on, else the button's if it is on. */
function onValue(field) {
	if (field.grouped) return field.value;
	return field.checked ? field.value : undefined;
}
