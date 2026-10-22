// Radio buttons (ISO 32000 §12.7.4.2.4): the buttons of one name are a group, of which the reader
// picks one and cannot pick none once picked; buttons of one value turn on together.

import { radioAppearances } from '../toggle-appearances.js';
import { kind } from './common.js';
import { group, readToggle, toggleEntries, toggleWidgetEntries } from './toggle.js';

/** The kind of radio buttons. */
export const radio = kind({
	type: 'radio',
	read: readToggle,
	merge: (name, widgets, common) => group('radio group', name, widgets, common, { unison: true }),
	fieldEntries: (field) =>
		toggleEntries(field, { radio: true, noToggleToOff: true, radiosInUnison: field.unison }),
	widgetEntries: (widget, field, settings, context) =>
		toggleWidgetEntries(widget, field, settings, context, radioAppearances),
});
