// The structure tree of a tagged PDF (ISO 32000 §14.7), as far as fields need it: the `<Link>`
// element of a marker, the marked content Typst drew inside it, and the parent tree (§14.7.5.4),
// which maps that content back to its element.

import { MAX_DEPTH } from './document.js';
import { asArray, isName, Name, Ref, textString } from './syntax.js';

/** The structure of a document, read from its catalog; empty for an untagged PDF. */
export class Structure {
	constructor(document, catalog) {
		this.document = document;
		const root = document.resolve(catalog.get('StructTreeRoot'));
		/** Whether the PDF is tagged. */
		this.tagged = root instanceof Map;
		/** The parent tree: by `/StructParent` or `/StructParents` key, an element or an array. */
		this.parents = new Map();
		const visit = (node, seen) => {
			node = document.resolve(node);
			if (!(node instanceof Map) || seen.has(node)) return;
			seen.add(node);
			const nums = document.resolve(node.get('Nums'));
			if (Array.isArray(nums)) {
				for (let i = 0; i + 1 < nums.length; i += 2) this.parents.set(nums[i], nums[i + 1]);
			}
			const kids = document.resolve(node.get('Kids'));
			if (Array.isArray(kids)) for (const kid of kids) visit(kid, seen);
		};
		if (this.tagged) visit(root.get('ParentTree'), new Set());
	}

	/** The `<Link>` element of a marker's `annotation`, with its reference, if the PDF has one. */
	link(annotation) {
		const key = annotation.get('StructParent');
		const ref = key === undefined ? undefined : this.parents.get(key);
		const value = this.document.resolve(ref);
		const found = ref instanceof Ref && value instanceof Map && isName(value.get('S'), 'Link');
		return found ? { ref, value } : undefined;
	}

	/**
	 * The MCIDs among the kids `kids` of a structure element (§14.7.4.2), numbers and MCR
	 * dictionaries, and among those of its descendant elements.
	 */
	markedContent(kids, depth = 0) {
		if (depth > MAX_DEPTH) throw new Error('the structure tree nests too deeply');
		return asArray(kids).flatMap((kid) => {
			const value = this.document.resolve(kid);
			if (Number.isInteger(value)) return [value];
			if (!(value instanceof Map)) return [];
			if (isName(value.get('Type'), 'MCR')) return [value.get('MCID')];
			if (isName(value.get('Type'), 'OBJR')) return [];
			return value.has('S') ? this.markedContent(value.get('K'), depth + 1) : [];
		});
	}

	/**
	 * Empties the entries of `mcids` in the parent tree's array for `page`, which maps each MCID of
	 * the page to its element, as a new version in `objects`.
	 */
	clear(page, mcids, objects) {
		const entry = this.parents.get(page.get('StructParents'));
		if (!(entry instanceof Ref))
			throw new Error("the PDF's parent tree holds a page's array inline");
		objects.update(this.document, entry, (array) =>
			array.map((element, mcid) => (mcids.has(mcid) ? null : element)),
		);
	}

	/**
	 * Makes `element`, a `<Link>` element as `link` gives it, a `<Form>` element (PDF/UA-1 §7.18.4),
	 * with `alt` as its alternative text when given, as a new version in `objects`.
	 */
	retag(element, alt, objects) {
		objects.update(this.document, element.ref, (value) => {
			const form = new Map(value).set('S', new Name('Form'));
			return alt === undefined ? form : form.set('Alt', textString(alt));
		});
	}

	/**
	 * Leaves `element`, a `<Link>` element as `link` gives it, holding its widget's reference alone,
	 * without the content and elements of its own Typst drew in it, as a new version in `objects`.
	 */
	keepWidget(element, objects) {
		const isWidget = (kid) => {
			const value = this.document.resolve(kid);
			return value instanceof Map && isName(value.get('Type'), 'OBJR');
		};
		objects.update(this.document, element.ref, (value) =>
			new Map(value).set('K', asArray(value.get('K')).filter(isWidget)),
		);
	}
}
