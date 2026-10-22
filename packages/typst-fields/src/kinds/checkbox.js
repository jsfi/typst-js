// Checkboxes (ISO 32000 §12.7.4.2.3): ticked or not. Checkboxes of one name and one value are one
// field in several places; of different values, a group of which the reader ticks one or none.

import { checkboxAppearances } from '../toggle-appearances.js';
import { kind, mirror } from './common.js';
import { group, readToggle, toggleEntries, toggleWidgetEntries } from './toggle.js';

/** The kind of checkboxes. */
export const checkbox = kind({
	type: 'checkbox',
	read: readToggle,
	merge(name, widgets, common) {
		const distinct = new Set(widgets.map((w) => w.value)).size > 1;
		if (!distinct) return mirror(name, widgets, common);
		return group('checkbox group', name, widgets, common, { unison: false });
	},
	fieldEntries: (field) => toggleEntries(field),
	widgetEntries: (widget, field, settings, context) =>
		toggleWidgetEntries(widget, field, settings, context, checkboxAppearances),
});
