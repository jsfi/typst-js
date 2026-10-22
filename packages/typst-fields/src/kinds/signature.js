// Signature fields (ISO 32000 §12.7.4.5): an empty box the reader signs in, in their viewer, which
// may lock fields once signed (Table 233). A signature is in one place only.

import { plainAppearance } from '../appearance.js';
import { Name } from '../syntax.js';
import { entries, flags, isNames, kind, mirror } from './common.js';

/** The kind of signature fields. */
export const signature = kind({
	type: 'signature',
	read(settings) {
		const lock = readLock(settings.lock ?? null);
		return lock ? { lock } : undefined;
	},
	merge(name, widgets, common) {
		if (widgets.length > 1) {
			throw new Error(
				`signature field "${name}" is in several places, which a signature cannot be`,
			);
		}
		return mirror(name, widgets, common);
	},
	names: (field) => field.lock.fields ?? [],
	fieldEntries: (field, named) =>
		entries([
			['FT', new Name('Sig')],
			['Ff', flags(field)],
			['Lock', field.lock.mode === 'none' ? undefined : lockEntries(field.lock, named)],
		]),
	widgetEntries(widget, field, settings, { box, objects }) {
		widget.set('AP', new Map([['N', objects.add(plainAppearance(box))]]));
	},
});

/** A signature's lock, checked: none, all fields, the fields named, or all but those. */
function readLock(lock) {
	if (lock === null) return { mode: 'none' };
	if (lock === 'all') return { mode: 'all' };
	if (lock && isNames(lock.fields)) return { mode: 'include', fields: lock.fields };
	if (lock && isNames(lock.except)) return { mode: 'exclude', fields: lock.except };
	return undefined;
}

/** The lock dictionary of `spec`; `named(names)` gives the fields it locks by name. */
function lockEntries(spec, named) {
	return entries([
		['Type', new Name('SigFieldLock')],
		['Action', new Name({ all: 'All', include: 'Include', exclude: 'Exclude' }[spec.mode])],
		['Fields', spec.fields ? named(spec.fields) : undefined],
	]);
}
