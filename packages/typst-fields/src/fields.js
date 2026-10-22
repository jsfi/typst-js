// Turns the field markers of a PDF into form fields (ISO 32000 §12.7). A marker is a link annotation
// to `typst-field:` and the field's settings as JSON, which the Typst library writes around the box
// the field covers. Typst gives that link what PDF/UA-1 asks of a field: its place on the page, a
// `<Link>` structure element in reading order beside the field's label, and a page whose tab order
// follows the structure. So each marker becomes a widget in place: the annotation, under its own
// object number, becomes the widget, and its `<Link>` element a `<Form>` element (PDF/UA-1 §7.18.4).
// How the markers of one name make one field is `form.js`'s; what each kind of field holds,
// `kinds/`'s.

import { annotationBox } from './box.js';
import { decodeStreams, readDocument } from './document.js';
import { defaultAppearance, FONT_NAME, helvetica } from './font.js';
import { FormFields } from './form.js';
import { kindOf, MARKER, readField } from './kinds/index.js';
import { Structure } from './structure.js';
import { fromLatin1, isName, Name, PdfString, Ref, Stream, textString } from './syntax.js';
import { appendUpdate, NewObjects } from './update.js';
import { moveDrawn } from './values.js';

/**
 * `pdf` with its markers turned into fields, or `pdf` itself when it has none. Yields zlib data to
 * decompress and to compress, as `{ codec: 'inflate', data }` and `{ codec: 'deflate', data }`.
 */
export function* addFieldsTo(pdf) {
	const document = yield* readDocument(pdf);
	const ref = document.trailer.get('Root');
	const catalog = { ref, value: document.resolve(ref) };
	if (!(ref instanceof Ref) || !(catalog.value instanceof Map)) {
		throw new Error('the PDF has no catalog');
	}
	const markers = findMarkers(document, catalog.value);
	if (markers.length === 0) return pdf;
	if (catalog.value.has('AcroForm')) throw new Error('the PDF has a form already');
	const form = new FormFields(markers);
	if (form.any((kind) => kind.acts) && (yield* isPdfA(document, catalog.value))) {
		throw new Error('PDF/A forbids push buttons: a widget may not carry an action');
	}

	const objects = new NewObjects(document.trailer.get('Size'));
	const structure = new Structure(document, catalog.value);
	// Text and choice fields are typed or picked in; a form without them names no font.
	const fontRef = form.any((kind) => kind.typed) ? helvetica(objects) : undefined;
	const moved = yield* moveDrawn(document, markers, structure, objects, (settings, box) =>
		kindOf(settings).framing(settings, box),
	);
	form.number(objects);
	const context = { document, form, structure, objects, moved, fontRef };
	for (const name of form.fieldNames()) writeField(name, context);
	for (const name of form.groupNames()) writeGroup(name, context);
	if (structure.tagged) setTabOrder(markers, context);
	writeForm(catalog, context);
	return appendUpdate(document, objects);
}

/** Every marker of the document, page by page: the annotation, its page and its settings. */
function findMarkers(document, catalog) {
	const markers = [];
	for (const page of pages(document, catalog.get('Pages'))) {
		const annotations = document.resolve(document.resolve(page).get('Annots'));
		if (!Array.isArray(annotations)) continue;
		for (const ref of annotations) {
			const annotation = document.resolve(ref);
			if (!(ref instanceof Ref) || !(annotation instanceof Map)) continue;
			if (!isName(annotation.get('Subtype'), 'Link')) continue;
			const action = document.resolve(annotation.get('A'));
			const uri = action instanceof Map ? document.resolve(action.get('URI')) : undefined;
			if (!(uri instanceof PdfString)) continue;
			const url = new TextDecoder().decode(uri.bytes);
			if (url.startsWith(MARKER)) markers.push({ ref, annotation, page, field: readField(url) });
		}
	}
	return markers;
}

/**
 * Writes field `name`: its entries on its one widget, or on an object of its own whose kids its
 * widgets are, and each widget in place of its marker.
 */
function writeField(name, { document, form, structure, objects, moved, fontRef }) {
	const { field, markers } = form.field(name);
	const kind = kindOf(field);
	const entries = new Map();
	if (field.label !== undefined) entries.set('TU', textString(field.label));
	for (const [key, value] of kind.fieldEntries(field, form.named)) entries.set(key, value);
	entries.set('T', form.partial(name));
	const parent = form.parent(name);
	if (parent) entries.set('Parent', parent);
	const apart = form.apart(name);
	if (apart) {
		objects.set(
			form.ref(name),
			entries.set(
				'Kids',
				markers.map((m) => m.ref),
			),
		);
	}
	for (const marker of markers) {
		const box = annotationBox(document, marker.annotation);
		const widget = new Map([
			['Type', new Name('Annot')],
			['Subtype', new Name('Widget')],
			['Rect', box.rect],
			['F', marker.annotation.get('F') ?? 4],
			['P', marker.page],
		]);
		const structParent = marker.annotation.get('StructParent');
		if (structParent !== undefined) widget.set('StructParent', structParent);
		if (apart) widget.set('Parent', form.ref(name));
		else for (const [key, value] of entries) widget.set(key, value);
		kind.widgetEntries(widget, field, marker.field, {
			box,
			moved: moved.get(marker.ref.num),
			fontRef,
			objects,
			named: form.named,
		});
		objects.set(marker.ref, widget);
		const element = structure.link(marker.annotation);
		// A button of a group has its own label, as the group's field names the group (§7.18.1).
		if (element) structure.retag(element, field.grouped ? marker.field.label : undefined, objects);
	}
}

/** Writes group `name`: its partial name and its kids, the fields and groups under it. */
function writeGroup(name, { form, objects }) {
	const node = new Map([
		['T', form.partial(name)],
		['Kids', form.refer(form.children(name))],
	]);
	const parent = form.parent(name);
	if (parent) node.set('Parent', parent);
	objects.set(form.ref(name), node);
}

/**
 * Has the reader tab through the fields of each page in the order of the structure (PDF/UA-1
 * §7.18.3), which Typst asks for already; a page that does not gets it here.
 */
function setTabOrder(markers, { document, objects }) {
	for (const { page } of markers) {
		if (!isName(objects.latest(document, page).get('Tabs'), 'S')) {
			objects.update(document, page, (current) => new Map(current).set('Tabs', new Name('S')));
		}
	}
}

/**
 * Writes the form (§12.7.2), which lists the top fields and groups, and adds it to `catalog`, the
 * document's catalog as `{ ref, value }`.
 */
function writeForm(catalog, { form, objects, fontRef }) {
	const entries = new Map([['Fields', form.refer(form.roots())]]);
	if (fontRef) {
		entries.set('DA', defaultAppearance(0));
		entries.set('DR', new Map([['Font', new Map([[FONT_NAME, fontRef]])]]));
	}
	objects.set(catalog.ref, new Map(catalog.value).set('AcroForm', objects.add(entries)));
}

/** The references of the document's pages, in order (§7.7.3). */
function pages(document, root) {
	const result = [];
	const visit = (ref, seen) => {
		const node = document.resolve(ref);
		if (!(node instanceof Map) || seen.has(node)) return;
		seen.add(node);
		const kids = document.resolve(node.get('Kids'));
		if (Array.isArray(kids)) for (const kid of kids) visit(kid, seen);
		else if (ref instanceof Ref) result.push(ref);
	};
	visit(root, new Set());
	return result;
}

/** Whether the document claims PDF/A conformance in its metadata (ISO 19005-2 §6.6.2.2). */
function* isPdfA(document, catalog) {
	const metadata = document.resolve(catalog.get('Metadata'));
	if (!(metadata instanceof Stream)) return false;
	const [xml] = yield* decodeStreams([metadata]);
	return /pdfaid:part/.test(fromLatin1(xml));
}
