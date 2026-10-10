// The outline beside the preview, for an example that publishes one.

import { jumpButton } from './jump.js';

/** What the page asks the compiler for: the outline the document publishes as metadata. */
export const OUTLINE_QUERY = { selector: '<outline-data>', field: 'value', one: true };

/** The outline panel: its headings, each scrolling the preview's pages to its page. */
export class Outline {
	#panel;
	#list;
	#pages;

	constructor(panel, list, pages) {
		this.#panel = panel;
		this.#list = list;
		this.#pages = pages;
	}

	/** Shows the headings of `value`, the answer to `OUTLINE_QUERY`, or hides the panel without. */
	show(value) {
		if (!Array.isArray(value)) {
			this.hide();
			return;
		}
		this.#list.replaceChildren(
			...value.map(({ number, title, page }) => {
				const item = document.createElement('li');
				item.append(
					jumpButton(`${number ?? ''} ${title} · page ${page}`.trim(), undefined, () =>
						this.#pages.children[page - 1]?.scrollIntoView({ behavior: 'smooth' }),
					),
				);
				return item;
			}),
		);
		this.#panel.hidden = false;
	}

	hide() {
		this.#panel.hidden = true;
	}
}
