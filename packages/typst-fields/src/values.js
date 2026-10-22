// What Typst draws inside a field: a value, a list's options, a button's caption. The library has
// Typst set it inside the field's box, so that Typst shapes it, sets it in the document's font and
// breaks its lines; Typst tags it as content of the field's link. It moves from its page into its
// field's appearance: the marked-content sections its link's structure element holds, directly or
// through elements of its own such as `<Strong>`, are copied into the appearance and cut out of the
// page, and leave the structure, where the field now stands for them. Pages are read through
// `inflate` and written back, like the appearances, through `deflate`.

import { formXObject } from './appearance.js';
import { annotationBox } from './box.js';
import { cut, markedSections } from './content.js';
import { decodeStreams, MAX_DEPTH } from './document.js';
import { asArray, concat, formatNumber, latin1, Name, Stream } from './syntax.js';

/** What a field's settings say Typst draws in it, as an error names it. */
const DRAWN = { value: 'a value', options: 'options', caption: 'a caption' };

/**
 * Moves what Typst drew in the fields of `markers` into appearances, adding them and the changed
 * pages, structure elements and parent tree arrays to `objects`, a `NewObjects`; `framing(settings,
 * box)` gives the appearances to make, each as what it draws before and after the content. Returns
 * each field's moved appearances, by the number of its annotation. Yields data to decompress and to
 * compress, as `{ codec: 'inflate', data }` and `{ codec: 'deflate', data }`.
 */
export function* moveDrawn(document, markers, structure, objects, framing) {
	const pages = taggedFields(markers, structure);
	if (pages.length === 0) return new Map();
	const contents = yield* readPages(document, pages);
	const writes = cutDrawn(document, pages, contents, framing);
	const compressed = yield { codec: 'deflate', data: writes.map((w) => w.data) };
	return writeMoved(document, structure, objects, writes, compressed);
}

/**
 * The pages with fields Typst drew in, each with its fields, their marker, `<Link>` element and the
 * MCIDs of what Typst drew, and with the MCIDs of them all. Throws for a field the PDF does not
 * tag.
 */
function taggedFields(markers, structure) {
	const pages = new Map();
	for (const marker of markers.filter((m) => m.field.draws)) {
		const element = structure.link(marker.annotation);
		const mcids = new Set(element ? structure.markedContent(element.value.get('K')) : []);
		if (mcids.size === 0) throw untagged(marker);
		const page = pages.get(marker.page.num) ?? { ref: marker.page, fields: [], mcids: new Set() };
		page.fields.push({ marker, element, mcids });
		for (const mcid of mcids) page.mcids.add(mcid);
		pages.set(marker.page.num, page);
	}
	return [...pages.values()];
}

/**
 * The content of each page, its streams joined as one (§7.8.2); also sets each page's dictionary as
 * its `value`. Yields the compressed streams to decompress.
 */
function* readPages(document, pages) {
	for (const page of pages) {
		page.value = document.resolve(page.ref);
		page.streams = asArray(document.resolve(page.value.get('Contents'))).map((c) =>
			document.resolve(c),
		);
		if (!page.streams.every((s) => s instanceof Stream)) throw new Error('a page without content');
	}
	const decoded = yield* decodeStreams(pages.flatMap((page) => page.streams));
	let next = 0;
	return pages.map((page) => joinLines(page.streams.map(() => decoded[next++])));
}

/**
 * What to write, uncompressed: for each field the appearances `framing` asks for, with the sections
 * Typst drew in it moved to the box's corner, and for each page its content without them.
 */
function cutDrawn(document, pages, contents, framing) {
	const writes = [];
	for (const [i, page] of pages.entries()) {
		const content = contents[i];
		const sections = markedSections(content, page.mcids);
		for (const field of page.fields) {
			const fieldSections = sections.filter((s) => field.mcids.has(s.mcid));
			if (fieldSections.length === 0) throw untagged(field.marker);
			const box = annotationBox(document, field.marker.annotation);
			const [x, y] = box.rect;
			for (const [before, after] of framing(field.marker.field, box)) {
				const data = joinLines([
					latin1(`${before}\nq\n1 0 0 1 ${formatNumber(-x)} ${formatNumber(-y)} cm`),
					...fieldSections.map((s) => s.inner),
					latin1(`Q\n${after}`),
				]);
				writes.push({ field, box, data });
			}
		}
		writes.push({ page, data: cut(content, sections) });
	}
	return writes;
}

/**
 * Writes `writes`, as `compressed`, to `objects`: the appearances, each page with its new content
 * and its parent tree array without the moved MCIDs, and each field's `<Link>` element without what
 * Typst drew. Returns each field's appearances, by the number of its annotation.
 */
function writeMoved(document, structure, objects, writes, compressed) {
	const moved = new Map();
	for (const [i, write] of writes.entries()) {
		const flate = (stream) => {
			stream.dict.set('Filter', new Name('FlateDecode'));
			stream.data = compressed[i];
			return stream;
		};
		if (write.page) {
			const { page } = write;
			const contents = objects.add(flate(new Stream(new Map(), new Uint8Array())));
			objects.set(page.ref, new Map(page.value).set('Contents', contents));
			structure.clear(page.value, page.mcids, objects);
			continue;
		}
		const { marker, element } = write.field;
		const resources = inherited(document, document.resolve(marker.page), 'Resources');
		const ref = objects.add(
			flate(formXObject(write.box, new Uint8Array(), resources ?? new Map())),
		);
		moved.set(marker.ref.num, [...(moved.get(marker.ref.num) ?? []), ref]);
		structure.keepWidget(element, objects);
	}
	return moved;
}

/** The value of a page attribute that pages inherit from the page tree (§7.7.3.4). */
function inherited(document, page, key) {
	for (let node = page, depth = 0; node instanceof Map && depth < MAX_DEPTH; depth++) {
		if (node.has(key)) return node.get(key);
		node = document.resolve(node.get('Parent'));
	}
	return undefined;
}

/** `parts` joined by line feeds, so that no two tokens run together. */
function joinLines(parts) {
	const lineFeed = Uint8Array.of(0x0a);
	return concat(parts.flatMap((part) => [part, lineFeed]));
}

/** The error for a marker whose field Typst drew in, but which the PDF does not tag. */
function untagged({ field }) {
	return new Error(
		`field "${field.name}" has ${DRAWN[field.draws]}, which needs a tagged PDF: Typst writes one ` +
			'unless it is given `tagged: false` or `pages`',
	);
}
