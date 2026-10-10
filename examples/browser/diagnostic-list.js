// The diagnostics below the editor.

import { jumpButton } from './jump.js';
import { MAIN_PATH } from './protocol.js';

/** The list of diagnostics, each that points into the edited source jumping to its place. */
export class DiagnosticList {
	#list;
	#editor;

	constructor(list, editor) {
		this.#list = list;
		this.#editor = editor;
	}

	/**
	 * Lists `diagnostics`, compiled from the source `compiled`. One that points into the edited
	 * source is a button that selects the faulty span in the editor; the byte offsets are UTF-8 into
	 * `compiled`, and the editor counts UTF-16 code units. Once the source has changed, the offsets
	 * no longer fit it, so a click says so and waits for the next preview instead.
	 */
	show(diagnostics, compiled) {
		const bytes = new TextEncoder().encode(compiled);
		const decoder = new TextDecoder();
		const toEditor = (offset) => decoder.decode(bytes.subarray(0, offset)).length;
		this.#list.replaceChildren(
			...diagnostics.map((diagnostic) => {
				const item = document.createElement('li');
				item.className = diagnostic.severity;
				const text = describe(diagnostic);
				if (diagnostic.path !== MAIN_PATH || diagnostic.start === undefined) {
					item.textContent = text;
					return item;
				}
				const jump = () => {
					if (this.#editor.value !== compiled) {
						markStale(item);
						return;
					}
					this.#select(
						toEditor(diagnostic.start),
						toEditor(diagnostic.end ?? diagnostic.start),
						diagnostic.line,
					);
				};
				item.append(jumpButton(text, 'Select this place in the source', jump));
				return item;
			}),
		);
	}

	/** Selects `start` to `end` in the editor and scrolls `line` into view, a little below the top. */
	#select(start, end, line) {
		const editor = this.#editor;
		editor.focus();
		editor.setSelectionRange(start, end);
		const style = getComputedStyle(editor);
		// `normal` has no number; browsers draw it at about 1.2 times the font size.
		const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
		editor.scrollTop = Math.max(0, (line - 3) * lineHeight);
	}
}

/** "error (line 2, column 5): message; hint: …", the file named unless it is the edited one. */
function describe({ severity, message, hints, path, line, column }) {
	const place =
		line === undefined
			? ''
			: ` (line ${line}, column ${column}${path === MAIN_PATH ? '' : `, ${path}`})`;
	return `${severity}${place}: ${message}${hints.map((hint) => `; hint: ${hint}`).join('')}`;
}

function markStale(item) {
	if (item.querySelector('.stale')) return;
	const stale = document.createElement('span');
	stale.className = 'stale';
	stale.textContent = 'The source has changed since; the next preview updates this list.';
	item.append(stale);
}
