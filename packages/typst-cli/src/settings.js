// What the checked options mean for the CLI: its flags, and the diagnostics this package gives for
// them before or instead of running it, as the module gives them.

import { newError, newWarning } from './results.js';

/** The standards that require a tagged PDF, with the names the CLI's errors give them. */
const ACCESSIBLE_STANDARDS = [
	['a-1a', 'PDF/A-1a'],
	['a-2a', 'PDF/A-2a'],
	['a-3a', 'PDF/A-3a'],
	['ua-1', 'PDF/UA-1'],
];

/** The checked options of `compilePdf`, and what they mean for the CLI. */
export class PdfSettings {
	/** The CLI's warning that a page selection leaves the PDF untagged, and its hint on refusal. */
	static #PAGES_IMPLY_UNTAGGED = 'using pages implies tagged: false';

	/** The `tagged` option as given: `false` asks for an untagged PDF. */
	#requestedTagged;

	constructor({ requestedTagged, timestamp, standards, pages }) {
		this.#requestedTagged = requestedTagged;
		this.timestamp = timestamp;
		this.standards = standards;
		this.pages = pages;
	}

	/** Whether the PDF is tagged: unless `tagged: false` is given, and never for a page selection. */
	get tagged() {
		return this.#requestedTagged !== false && this.pages === undefined;
	}

	/** Whether the page selection, not the caller, left the PDF untagged, which the CLI warns about. */
	get untaggedByPages() {
		return this.pages !== undefined && this.#requestedTagged !== false;
	}

	/** The warning a page selection gives unless `tagged: false` silences it, as a list. */
	pagesWarning() {
		if (!this.untaggedByPages) return [];
		return [
			newWarning(PdfSettings.#PAGES_IMPLY_UNTAGGED, [
				'the resulting PDF will be inaccessible',
				'set tagged: false to silence this warning',
			]),
		];
	}

	/** The error for a standard that requires tags in an untagged PDF, or `undefined`. */
	tagsRefusal() {
		if (this.tagged) return undefined;
		const refused = ACCESSIBLE_STANDARDS.find(([standard]) => this.standards.includes(standard));
		if (!refused) return undefined;
		return newError(
			`cannot disable PDF tags when exporting a ${refused[1]} document`,
			this.untaggedByPages ? [PdfSettings.#PAGES_IMPLY_UNTAGGED] : [],
		);
	}

	/**
	 * The CLI flags for these settings. A value is joined to its flag with `=`, so that a negative
	 * timestamp (a date before 1970) is not read as a flag of its own.
	 */
	flags() {
		const flags = [];
		if (!this.tagged) flags.push('--no-pdf-tags');
		if (this.timestamp !== undefined) {
			flags.push(`--creation-timestamp=${Math.floor(this.timestamp / 1000)}`);
		}
		if (this.standards.length > 0) flags.push(`--pdf-standard=${this.standards.join(',')}`);
		flags.push(...pagesFlag(this.pages));
		return flags;
	}
}

/** The CLI flags for SVG output of the page selection `pages`, or all pages. */
export function svgFlags(pages) {
	return ['--format=svg', ...pagesFlag(pages)];
}

/** The flag for a page selection, as a list: none without one. */
function pagesFlag(pages) {
	return pages === undefined ? [] : [`--pages=${pages}`];
}
