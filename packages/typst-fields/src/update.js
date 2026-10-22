// An incremental update (ISO 32000 §7.5.6): new and changed objects appended after the PDF's end,
// with a cross-reference section for them alone and a trailer that points back to the previous one.
// The section takes the form of the PDF's last one, a table or a stream, as readers expect; the
// stream is left uncompressed, as it is small.

import { concat, Name, Ref, Stream, latin1, serialize, writeObject } from './syntax.js';

/**
 * The objects an update writes: new ones, numbered from the document's `/Size` on, and new versions
 * of the document's own, under their numbers.
 */
export class NewObjects {
	constructor(size) {
		/** The number the next new object gets, and in the end the update's `/Size`. */
		this.size = size;
		/** The objects by number. */
		this.byNumber = new Map();
	}

	/** A number for an object to come, which `set` gives a value. */
	reserve() {
		return new Ref(this.size++);
	}

	/** Adds `value` as a new object, and returns its reference. */
	add(value) {
		const ref = this.reserve();
		this.set(ref, value);
		return ref;
	}

	/** Sets the object `ref` refers to, a new one or a new version of the document's. */
	set(ref, value) {
		this.byNumber.set(ref.num, value);
	}

	/** The object `ref` refers to, if this update writes it. */
	get(ref) {
		return this.byNumber.get(ref.num);
	}

	/** The object `ref` refers to as this update leaves it: its new version, or `document`'s. */
	latest(document, ref) {
		return this.get(ref) ?? document.resolve(ref);
	}

	/** Sets the object `ref` refers to to `change` of it as this update leaves it (see `latest`). */
	update(document, ref, change) {
		this.set(ref, change(this.latest(document, ref)));
	}
}

/** The PDF of `document` with `objects`, a `NewObjects`, appended. */
export function appendUpdate(document, objects) {
	const { size } = objects;
	const { bytes, trailer } = document;
	const chunks = [bytes];
	let length = bytes.length;
	const push = (chunk) => {
		chunks.push(chunk);
		length += chunk.length;
	};
	if (bytes.at(-1) !== 0x0a && bytes.at(-1) !== 0x0d) push(latin1('\n'));

	// The offset of each object, in the order of their numbers, which the section lists them in.
	const offsets = new Map();
	for (const num of [...objects.byNumber.keys()].sort((a, b) => a - b)) {
		offsets.set(num, length);
		push(writeObject(num, 0, objects.byNumber.get(num)));
	}

	const next = new Map([['Size', size]]);
	for (const key of ['Root', 'Info', 'ID']) if (trailer.has(key)) next.set(key, trailer.get(key));
	next.set('Prev', document.startxref);

	const sectionOffset = length;
	if (document.lastSectionIsStream) {
		// The stream lists itself, as one more object: `size` is above every number in `offsets`, so
		// added last it stays in the order of their numbers.
		offsets.set(size, sectionOffset);
		next.set('Size', size + 1);
		push(writeObject(size, 0, crossReferenceStream(offsets, next)));
	} else {
		push(latin1(`xref\n${crossReferenceTable(offsets)}trailer\n${serialize(next)}\n`));
	}
	push(latin1(`startxref\n${sectionOffset}\n%%EOF\n`));

	return concat(chunks);
}

/** Runs of consecutive object numbers, as cross-reference subsections group them. */
function runs(numbers) {
	const result = [];
	for (const num of numbers) {
		const last = result.at(-1);
		if (last && last.at(-1) === num - 1) last.push(num);
		else result.push([num]);
	}
	return result;
}

/**
 * The subsections of a cross-reference table (§7.5.4) of the objects at `offsets`, in the order of
 * their numbers.
 */
function crossReferenceTable(offsets) {
	let text = '';
	for (const run of runs([...offsets.keys()])) {
		text += `${run[0]} ${run.length}\n`;
		for (const num of run) text += `${String(offsets.get(num)).padStart(10, '0')} 00000 n\r\n`;
	}
	return text;
}

/**
 * A cross-reference stream (§7.5.8) of the objects at `offsets`, in the order of their numbers,
 * with `trailer`'s entries: one row per object, its offset as wide as the largest needs.
 */
function crossReferenceStream(offsets, trailer) {
	const numbers = [...offsets.keys()];
	let width = 1;
	while (2 ** (8 * width) <= Math.max(...offsets.values())) width++;
	const data = new Uint8Array(numbers.length * (2 + width));
	numbers.forEach((num, row) => {
		const at = row * (2 + width);
		data[at] = 1;
		let offset = offsets.get(num);
		for (let i = width; i > 0; i--) {
			data[at + i] = offset % 256;
			offset = Math.floor(offset / 256);
		}
		// The generation, 0, is the last byte.
	});
	const dict = new Map([
		['Type', new Name('XRef')],
		...trailer,
		['Index', runs(numbers).flatMap((run) => [run[0], run.length])],
		['W', [1, width, 1]],
	]);
	return new Stream(dict, data);
}
