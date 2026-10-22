// Choice fields (ISO 32000 §12.7.4.4): a drop-down list, of which the reader picks one option or,
// when editable, types their own, and a list box, of which they pick one or several. Typst draws the
// picked option of a drop-down list, and the options of a list box, which move into the field.

import { PADDING } from '../appearance.js';
import { asArray, formatNumber, Name, textString } from '../syntax.js';
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

/** The highlight of a list box's picked options, as viewers draw it: light blue. */
export const HIGHLIGHT = [0.6, 0.75, 0.85];

/**
 * How far a list box's highlight stays from its sides, in points, as viewers keep it inside the
 * border.
 */
const BORDER = 1;

/** The kind of choice fields: drop-down lists and list boxes. */
export const choice = kind({
	type: 'choice',
	typed: true,
	perWidget: ['size', 'lineHeight'],
	read(settings) {
		const { options, value = null, list = false, multiple = false, editable = false } = settings;
		const { size = 0, align = 'left', spellcheck = true } = settings;
		const commitOnChange = settings['commit-on-change'] ?? false;
		const lineHeight = settings['line-height'] ?? 0;
		const pairs =
			Array.isArray(options) &&
			options.length > 0 &&
			options.every(
				(o) => Array.isArray(o) && o.length === 2 && o.every((part) => typeof part === 'string'),
			);
		const values = asArray(value ?? []);
		const ok =
			pairs &&
			values.every((v) => typeof v === 'string') &&
			isBooleans(list, multiple, editable, spellcheck, commitOnChange) &&
			isSize(size) &&
			isSize(lineHeight) &&
			isAlign(align) &&
			(multiple || values.length <= 1) &&
			(editable || values.every((v) => options.some(([option]) => option === v)));
		const draws = list ? 'options' : values.length > 0 ? 'value' : undefined;
		const kindSettings = {
			options,
			values,
			list,
			multiple,
			editable,
			align,
			spellcheck,
			commitOnChange,
		};
		return ok ? { ...kindSettings, size, lineHeight, draws } : undefined;
	},
	fieldEntries(field) {
		const value =
			field.values.length === 0
				? undefined
				: field.multiple
					? field.values.map(textString)
					: textString(field.values[0]);
		const indices =
			field.list && field.values.length > 0 ? picked(field).sort((a, b) => a - b) : undefined;
		return entries([
			['FT', new Name('Ch')],
			[
				'Opt',
				field.options.map(([exported, shown]) =>
					exported === shown ? textString(shown) : [textString(exported), textString(shown)],
				),
			],
			['V', value],
			['DV', value],
			['I', indices],
			[
				'Ff',
				flags(field, {
					combo: !field.list,
					edit: field.editable,
					multiSelect: field.multiple,
					doNotSpellCheck: field.editable && !field.spellcheck,
					commitOnSelChange: field.commitOnChange,
				}),
			],
			['Q', quadding(field.align)],
		]);
	},
	widgetEntries: (widget, field, settings, context) =>
		typedWidgetEntries(widget, settings, context),
	// What Typst drew goes in the section viewers replace; a list box's picked options are
	// highlighted beneath it, a line high, across the box but for its border, as viewers draw them.
	framing(settings, box) {
		const top = box.height - PADDING;
		const rects = settings.list
			? picked(settings).map(
					(line) =>
						`${BORDER} ${formatNumber(top - (line + 1) * settings.lineHeight)} ` +
						`${formatNumber(box.width - 2 * BORDER)} ${formatNumber(settings.lineHeight)} re`,
				)
			: [];
		const highlight =
			rects.length > 0 ? `\nq\n${HIGHLIGHT.join(' ')} rg\n${rects.join('\n')}\nf\nQ` : '';
		return [[`/Tx BMC${highlight}`, 'EMC']];
	},
});

/** The indices of the picked options. */
function picked({ options, values }) {
	return values.map((value) => options.findIndex(([option]) => option === value));
}
