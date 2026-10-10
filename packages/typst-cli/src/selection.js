// What a query returns from the elements `typst eval` found, as the module selects them.

/**
 * The key `typst eval` adds to every element's JSON for its type, which is not a field the module
 * finds by name.
 */
const ELEMENT_TYPE_KEY = 'func';

/** Why the elements a query found do not match what it asked for, as the module reports it. */
export class SelectionError extends Error {}

/**
 * The elements, or their `field`, and with `one` the single element, as the module selects them.
 * Throws a `SelectionError` when they do not match.
 */
export function selectElements(elements, { field, one }) {
	if (one && elements.length !== 1) {
		throw new SelectionError(`expected exactly one element, found ${elements.length}`);
	}
	const mapped =
		field === undefined
			? elements
			: elements
					.filter((element) => field !== ELEMENT_TYPE_KEY && Object.hasOwn(element, field))
					.map((element) => element[field]);
	if (!one) return mapped;
	if (mapped.length === 0) throw new SelectionError('no such field found for element');
	return mapped[0];
}
