// Text fields (ISO 32000 §12.7.4.3): typed in, on one line or several, hidden as a password, or one
// character per cell as a comb. A value is drawn by Typst in the box and moves into the field.

import { Name, textString } from '../syntax.js';
import {
	entries,
	flags,
	isAlign,
	isBooleans,
	isSize,
	kind,
	quadding,
	typedWidgetEntries,
} from './common.js';

/** The kind of text fields. */
export const text = kind({
	type: 'text',
	typed: true,
	perWidget: ['size'],
	read(settings) {
		const { value = '', multiline = false, password = false, comb = false, size = 0 } = settings;
		const { align = 'left', spellcheck = true, scroll = true } = settings;
		const maxLength = settings['max-length'] ?? undefined;
		const ok =
			typeof value === 'string' &&
			isBooleans(multiline, password, comb, spellcheck, scroll) &&
			isSize(size) &&
			isAlign(align) &&
			(maxLength === undefined || (Number.isInteger(maxLength) && maxLength > 0)) &&
			(!comb || maxLength !== undefined);
		const draws = value === '' ? undefined : 'value';
		const kindSettings = { value, multiline, password, comb, maxLength, align, spellcheck, scroll };
		return ok ? { ...kindSettings, size, draws } : undefined;
	},
	fieldEntries: (field) =>
		entries([
			['FT', new Name('Tx')],
			['V', textString(field.value)],
			['DV', textString(field.value)],
			[
				'Ff',
				flags(field, {
					multiline: field.multiline,
					password: field.password,
					comb: field.comb,
					doNotSpellCheck: !field.spellcheck,
					doNotScroll: !field.scroll,
				}),
			],
			['MaxLen', field.maxLength],
			['Q', quadding(field.align)],
		]),
	widgetEntries: (widget, field, settings, context) =>
		typedWidgetEntries(widget, settings, context),
	// The value goes in the section viewers replace with what the reader types.
	framing: () => [['/Tx BMC', 'EMC']],
});
