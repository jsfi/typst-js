// The examples in samples/, each with the controls whose values reach it as sys.inputs: a range, a
// select or a number, keyed by the input's name.

import { number, range, select } from './controls.js';

/** A font-size slider from `min` to `max` points, starting at 10, which reflows the document. */
function fontSize(min, max) {
	return range('font-size', 'Font size', { min, max, step: 0.5, value: '10', unit: ' pt' });
}

/** The languages the samples are written in. */
const LANGUAGES = [
	['en', 'English'],
	['de', 'Deutsch'],
	['fr', 'Français'],
	['es', 'Español'],
];

export const EXAMPLES = [
	{ id: 'why-typst', label: 'Why Typst: two pages with an image and charts', controls: [] },
	{
		id: 'price-list',
		label: 'Price list: running subtotals in header and footer',
		controls: [fontSize(6, 16)],
	},
	{
		id: 'citations',
		label: 'Citations: one paper, any citation style',
		controls: [
			select('style', 'Citation style', [
				['ieee', 'IEEE'],
				['apa', 'APA'],
				['chicago-author-date', 'Chicago (author-date)'],
				['chicago-notes', 'Chicago (notes)'],
				['mla', 'MLA'],
				['nature', 'Nature'],
				['association-for-computing-machinery', 'ACM'],
				['harvard-cite-them-right', 'Harvard'],
			]),
		],
	},
	{
		id: 'report',
		label: 'Report: contents and page references that follow a reflow',
		outline: true,
		controls: [fontSize(7, 14)],
	},
	{
		id: 'index',
		label: 'Index: a back-of-book index that follows a reflow',
		controls: [fontSize(7, 14)],
	},
	{
		id: 'languages',
		label: 'Languages: quotes, hyphenation and names by language',
		controls: [select('lang', 'Language', LANGUAGES)],
	},
	{
		id: 'newspaper',
		label: 'Newspaper: columns and floating figures',
		controls: [range('columns', 'Columns', { min: 1, max: 3, step: 1, value: '3' })],
	},
	{
		id: 'themes',
		label: 'Themes: one text, three looks through show rules',
		controls: [
			select('theme', 'Theme', [
				['classic', 'Classic'],
				['modern', 'Modern'],
				['technical', 'Technical'],
			]),
		],
	},
	{
		id: 'form',
		label: 'Form: fillable fields, prefilled in any script',
		fields: true,
		controls: [
			select('values', 'Values', [
				['empty', 'Empty'],
				['prefilled', 'Prefilled'],
			]),
		],
	},
	{
		id: 'calendar',
		label: 'Calendar: a year computed by the document',
		controls: [
			number('year', 'Year', { min: 1600, max: 2400, value: String(new Date().getFullYear()) }),
			select('lang', 'Language', [...LANGUAGES, ['it', 'Italiano'], ['nl', 'Nederlands']]),
		],
	},
];
