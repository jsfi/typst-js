// The fields of a form by name (ISO 32000 §12.7.3.1–2). The markers of one name are one field: one
// shown in several places, or a group of radio buttons or checkboxes. The periods of a name group
// fields: "address.city" is a field "city" under a field "address", which holds no value itself.

import { kindOf, mergeField } from './kinds/index.js';
import { textString } from './syntax.js';

/** A form's fields and the groups their names make. */
export class FormFields {
	/** The fields by name, each with its markers, in the order they are first met. */
	#fields;
	/** The groups by name, each with the names of its children, in the order they are met. */
	#groups;
	/** The reference of each field and group, once numbered. */
	#refs = new Map();

	/**
	 * The fields `markers` make. Throws for markers of one name that cannot be one field, a name that
	 * is a field's and a group's, and a name an action or a lock gives that no field or group has.
	 */
	constructor(markers) {
		const byName = new Map();
		for (const marker of markers) {
			byName.set(marker.field.name, [...(byName.get(marker.field.name) ?? []), marker]);
		}
		this.#fields = new Map(
			[...byName].map(([name, fieldMarkers]) => [
				name,
				{
					field: mergeField(
						name,
						fieldMarkers.map((m) => m.field),
					),
					markers: fieldMarkers,
				},
			]),
		);
		this.#groups = nameGroups(this.#fields);
		for (const { field } of this.#fields.values()) {
			for (const name of kindOf(field).names(field)) {
				if (!this.#fields.has(name) && !this.#groups.has(name)) {
					throw new Error(`field "${field.name}" names "${name}", which is no field or group`);
				}
			}
		}
	}

	/** The names of the fields, in the order they are first met. */
	fieldNames() {
		return [...this.#fields.keys()];
	}

	/** The names of the groups. */
	groupNames() {
		return [...this.#groups.keys()];
	}

	/** Field `name`: the field its markers make, and the markers. */
	field(name) {
		return this.#fields.get(name);
	}

	/** The names of the fields and groups under group `name`. */
	children(name) {
		return this.#groups.get(name);
	}

	/** Whether any field's kind passes `test`. */
	any(test) {
		return [...this.#fields.values()].some(({ field }) => test(kindOf(field)));
	}

	/**
	 * Gives each field and group its object: a field of one widget is that widget's dictionary, the
	 * others and the groups new objects of `objects`.
	 */
	number(objects) {
		for (const [name, { markers }] of this.#fields) {
			this.#refs.set(name, this.apart(name) ? objects.reserve() : markers[0].ref);
		}
		for (const name of this.#groups.keys()) this.#refs.set(name, objects.reserve());
	}

	/** Whether field `name` is an object apart from its widgets: when it has several, or groups. */
	apart(name) {
		const { field, markers } = this.#fields.get(name);
		return markers.length > 1 || field.grouped === true;
	}

	/** The reference of field or group `name`, once numbered. */
	ref(name) {
		return this.#refs.get(name);
	}

	/** The references of the fields and groups `names`. */
	refer(names) {
		return names.map((name) => this.#refs.get(name));
	}

	/**
	 * What actions and locks name the fields and groups `names` by: their fully qualified names
	 * (§12.7.3.2), which locks require and PDFium alone reads for actions too, and a group as the
	 * fields under it, the spec's reading of a group, which viewers such as PDFium do not make
	 * themselves.
	 */
	named = (names) => {
		const under = (group) => this.fieldNames().filter((f) => f.startsWith(`${group}.`));
		const expanded = names.flatMap((name) => (this.#groups.has(name) ? under(name) : [name]));
		return [...new Set(expanded)].map((name) => textString(name));
	};

	/** The partial name of `name`, its last part, which its `/T` holds. */
	partial(name) {
		return textString(name.slice(name.lastIndexOf('.') + 1));
	}

	/** The reference of the group `name` belongs to, if any. */
	parent(name) {
		const at = name.lastIndexOf('.');
		return at === -1 ? undefined : this.#refs.get(name.slice(0, at));
	}

	/** The fields and groups at the top, which the form lists. */
	roots() {
		const names = [...this.groupNames(), ...this.fieldNames()];
		return [...new Set(names.map((name) => name.split('.')[0]))];
	}
}

/**
 * The groups the fields' names make with their periods, by name, each with the names of its
 * children. Throws for a name that is a field's and a group's.
 */
function nameGroups(fields) {
	const groups = new Map();
	for (const name of fields.keys()) {
		const parts = name.split('.');
		for (let i = parts.length - 1; i > 0; i--) {
			const group = parts.slice(0, i).join('.');
			const child = parts.slice(0, i + 1).join('.');
			const children = groups.get(group) ?? [];
			if (!children.includes(child)) children.push(child);
			groups.set(group, children);
		}
	}
	for (const name of groups.keys()) {
		if (fields.has(name)) throw new Error(`"${name}" names a field and a group of fields`);
	}
	return groups;
}
