// The kinds of field the Typst library marks (ISO 32000 §12.7.4), one module each, all of the shape
// `kind` in common.js describes, and what they share: reading a marker's settings, and merging the
// markers of one name into one field.

import { button } from './button.js';
import { checkbox } from './checkbox.js';
import { choice } from './choice.js';
import { isBooleans } from './common.js';
import { radio } from './radio.js';
import { signature } from './signature.js';
import { text } from './text.js';

/** What a marker's URL begins with; the field's settings follow as JSON. */
export const MARKER = 'typst-field:';

const KINDS = new Map([text, checkbox, radio, choice, button, signature].map((k) => [k.type, k]));

/** The kind of a field, or of a marker's settings. */
export function kindOf({ type }) {
	return KINDS.get(type);
}

/** A marker's settings, from its URL, checked as far as this package relies on them. */
export function readField(url) {
	let settings;
	try {
		settings = JSON.parse(url.slice(MARKER.length)) ?? {};
	} catch {
		throw new Error(`a field marker is not JSON: ${url}`);
	}
	const { type, name, label, required = false, export: exported = true } = settings;
	const readOnly = settings['read-only'] ?? false;
	const valid =
		KINDS.has(type) &&
		typeof name === 'string' &&
		name.split('.').every((part) => part !== '') &&
		typeof label === 'string' &&
		isBooleans(required, readOnly, exported);
	const kindSettings = valid ? kindOf(settings).read(settings) : undefined;
	if (!kindSettings) throw new Error(`a field marker has invalid settings: ${url}`);
	return { type, name, label, required, readOnly, exported, ...kindSettings };
}

/**
 * The field the markers of one name make, from their settings, `widgets`, by their kind: what all
 * their kinds share, and what the kind makes of them. Required, read-only and not exported apply to
 * the field if any widget asks for them. Throws for widgets of different kinds.
 */
export function mergeField(name, widgets) {
	const [first] = widgets;
	if (widgets.some((w) => w.type !== first.type)) throw new Error(`two fields are named "${name}"`);
	const common = {
		type: first.type,
		name,
		required: widgets.some((w) => w.required),
		readOnly: widgets.some((w) => w.readOnly),
		exported: widgets.every((w) => w.exported),
	};
	return kindOf(first).merge(name, widgets, common);
}
