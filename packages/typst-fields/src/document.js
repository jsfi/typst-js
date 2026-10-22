// A PDF opened for reading (ISO 32000 §7.5): the cross-reference sections from the last one back,
// classic tables and cross-reference streams alike, and every object they list, those in object
// streams included. Typst's own program writes classic tables; @jsfi/typst-wasm compresses objects
// into object streams, whose data the caller's `inflate` decompresses.
//
// Reading is a generator: it yields `{ codec: 'inflate', data }`, an array of zlib data to
// decompress, and takes the decompressed bytes back, so that one reader serves a synchronous and an
// asynchronous `inflate` alike.

import { Parser, Ref, Stream, asArray, fromLatin1, isName } from './syntax.js';

/** How deep a tree of the PDF, such as the page tree or the structure tree, is followed at most. */
export const MAX_DEPTH = 64;

/** An open PDF: its trailer and its objects by number. */
export class Document {
	constructor(bytes, startxref, trailer, entries, objectStreams, lastSectionIsStream) {
		/** The PDF's bytes. */
		this.bytes = bytes;
		/** The offset of the last cross-reference section, which an update's `/Prev` names. */
		this.startxref = startxref;
		/** The trailer of the last update, which names the catalog. */
		this.trailer = trailer;
		/** Whether the last cross-reference section is a stream, which an update then follows. */
		this.lastSectionIsStream = lastSectionIsStream;
		this.entries = entries;
		this.objectStreams = objectStreams;
		this.cache = new Map();
	}

	/** The value of `value`: the object it refers to when it is a reference, else itself. */
	resolve(value) {
		return value instanceof Ref ? this.get(value.num) : value;
	}

	/** Indirect object `num`, or `null` if the PDF has none of that number (§7.3.10). */
	get(num) {
		if (this.cache.has(num)) return this.cache.get(num);
		const entry = this.entries.get(num);
		let value = null;
		if (entry?.offset !== undefined) {
			const object = new Parser(this.bytes, entry.offset, (v) => this.resolve(v)).readIndirect();
			if (object.num !== num) throw new Error(`the cross-reference table misplaces object ${num}`);
			value = object.value;
		} else if (entry) {
			const stream = this.objectStreams.get(entry.stream);
			const offset = stream.first + stream.offsets[entry.index];
			value = new Parser(stream.data, offset).readValue();
		}
		this.cache.set(num, value);
		return value;
	}
}

/** Reads `bytes` as a PDF; yields the zlib data it needs decompressed. */
export function* readDocument(bytes) {
	const startxref = findStartxref(bytes);
	const sections = readSections(bytes, startxref);
	const trailer = sections[0].trailer;
	if (trailer.has('Encrypt')) throw new Error('the PDF is encrypted');

	const streams = sections.filter((section) => section.stream);
	const decoded = yield* decodeStreams(streams.map((section) => section.stream));
	streams.forEach((section, i) => (section.entries = streamEntries(section.stream, decoded[i])));

	// The newest entry of an object wins; free entries are left out, as nothing should refer to them.
	const entries = new Map();
	for (const section of sections) {
		for (const [num, entry] of section.entries) if (!entries.has(num)) entries.set(num, entry);
	}

	const streamNumbers = [
		...new Set([...entries.values()].flatMap((e) => (e.stream === undefined ? [] : [e.stream]))),
	];
	const objectStreams = streamNumbers.map((num) => {
		const { offset } = entries.get(num) ?? {};
		if (offset === undefined) throw new Error(`object stream ${num} is not in the PDF`);
		const object = new Parser(bytes, offset).readIndirect();
		if (!(object.value instanceof Stream)) throw new Error(`object ${num} is not an object stream`);
		return object.value;
	});
	const objectStreamData = yield* decodeStreams(objectStreams);
	const parsedObjectStreams = new Map(
		streamNumbers.map((num, i) => [num, readObjectStream(objectStreams[i], objectStreamData[i])]),
	);

	return new Document(
		bytes,
		startxref,
		trailer,
		entries,
		parsedObjectStreams,
		sections[0].isStream,
	);
}

/**
 * Every cross-reference section, from the one `startxref` names back along `/Prev`, each with its
 * trailer and, for a table, its entries; a stream's entries are decoded later.
 */
function readSections(bytes, startxref) {
	const sections = [];
	const seen = new Set();
	let offset = startxref;
	while (offset !== undefined) {
		if (seen.has(offset)) throw new Error('the cross-reference sections form a loop');
		seen.add(offset);
		const section = readSection(bytes, offset);
		sections.push(section);
		// A hybrid file's table names a stream with the objects it leaves out (§7.5.8.4).
		const hybrid = section.trailer.get('XRefStm');
		if (!section.isStream && Number.isInteger(hybrid)) sections.push(readSection(bytes, hybrid));
		const previous = section.trailer.get('Prev');
		offset = Number.isInteger(previous) ? previous : undefined;
	}
	return sections;
}

/** The offset the last `startxref` of the PDF names. */
function findStartxref(bytes) {
	const tail = fromLatin1(bytes, Math.max(0, bytes.length - 1024));
	const match = [...tail.matchAll(/startxref\s+(\d+)/g)].at(-1);
	if (!match) throw new Error('not a PDF: it has no startxref');
	return Number(match[1]);
}

/** The cross-reference section at `offset`: a table with its trailer, or a stream. */
function readSection(bytes, offset) {
	const parser = new Parser(bytes, offset);
	if (fromLatin1(bytes, offset, offset + 4) !== 'xref') {
		const { value } = parser.readIndirect();
		if (!(value instanceof Stream) || !isName(value.dict.get('Type'), 'XRef')) {
			throw new Error(`no cross-reference section at byte ${offset}`);
		}
		return { isStream: true, trailer: value.dict, stream: value, entries: new Map() };
	}
	parser.position += 4;
	const entries = new Map();
	for (;;) {
		const keyword = parser.readKeyword();
		if (keyword === 'trailer') break;
		const first = Number(keyword);
		const count = parser.tryInteger();
		if (!Number.isInteger(first) || count === undefined) {
			throw new Error(`a broken cross-reference table at byte ${offset}`);
		}
		for (let i = 0; i < count; i++) {
			const entryOffset = parser.tryInteger();
			parser.tryInteger();
			const type = parser.readKeyword();
			if (entryOffset === undefined || (type !== 'n' && type !== 'f')) {
				throw new Error(`a broken cross-reference table at byte ${offset}`);
			}
			if (type === 'n') entries.set(first + i, { offset: entryOffset });
		}
	}
	const trailer = parser.readValue();
	if (!(trailer instanceof Map)) throw new Error(`no trailer after the table at byte ${offset}`);
	return { isStream: false, trailer, entries };
}

/** The entries of a cross-reference stream (§7.5.8), from its decoded data. */
function streamEntries(stream, data) {
	const widths = stream.dict.get('W');
	const size = stream.dict.get('Size');
	const index = stream.dict.get('Index') ?? [0, size];
	if (!Array.isArray(widths) || widths.length !== 3 || !widths.every(Number.isInteger)) {
		throw new Error('a cross-reference stream without a valid /W');
	}
	const rowLength = widths[0] + widths[1] + widths[2];
	const entries = new Map();
	let position = 0;
	const field = (width, fallback) => {
		if (width === 0) return fallback;
		let value = 0;
		for (let i = 0; i < width; i++) value = value * 256 + data[position++];
		return value;
	};
	for (let i = 0; i < index.length; i += 2) {
		for (let num = index[i]; num < index[i] + index[i + 1]; num++) {
			if (position + rowLength > data.length)
				throw new Error('a cross-reference stream is too short');
			const type = field(widths[0], 1);
			const second = field(widths[1], 0);
			const third = field(widths[2], 0);
			if (type === 1) entries.set(num, { offset: second });
			else if (type === 2) entries.set(num, { stream: second, index: third });
		}
	}
	return entries;
}

/** An object stream (§7.5.7): its decoded data and where each of its objects begins. */
function readObjectStream(stream, data) {
	const count = stream.dict.get('N');
	const first = stream.dict.get('First');
	const parser = new Parser(data);
	const offsets = [];
	for (let i = 0; i < count; i++) {
		parser.tryInteger();
		offsets.push(parser.tryInteger());
	}
	if (!Number.isInteger(first) || offsets.some((o) => o === undefined)) {
		throw new Error('a broken object stream');
	}
	return { data, first, offsets };
}

/**
 * The decoded data of each stream: yields the compressed ones for `inflate`, then undoes
 * predictors.
 */
export function* decodeStreams(streams) {
	const filters = streams.map((stream) => {
		const filter = stream.dict.get('Filter');
		const names = asArray(filter ?? []);
		if (names.length > 1 || (names.length === 1 && !isName(names[0], 'FlateDecode'))) {
			throw new Error(
				`cannot decode a stream with the filter ${names.map((n) => `/${n.value}`).join(' ')}`,
			);
		}
		return names.length === 1;
	});
	const compressed = streams.filter((_, i) => filters[i]).map((stream) => stream.data);
	const inflated = compressed.length > 0 ? yield { codec: 'inflate', data: compressed } : [];
	let next = 0;
	return streams.map((stream, i) => {
		if (!filters[i]) return stream.data;
		const parms = stream.dict.get('DecodeParms');
		return unpredict(inflated[next++], Array.isArray(parms) ? parms[0] : parms);
	});
}

/** Reverses a PNG predictor (§7.4.4.4), which cross-reference streams use. */
function unpredict(data, parms) {
	const predictor = parms instanceof Map ? (parms.get('Predictor') ?? 1) : 1;
	if (predictor === 1) return data;
	if (predictor < 10) throw new Error(`cannot decode predictor ${predictor}`);
	const colors = parms.get('Colors') ?? 1;
	const bits = parms.get('BitsPerComponent') ?? 8;
	const columns = parms.get('Columns') ?? 1;
	const pixel = Math.ceil((colors * bits) / 8);
	const row = Math.ceil((colors * bits * columns) / 8);
	const rows = Math.floor(data.length / (row + 1));
	const out = new Uint8Array(rows * row);
	for (let r = 0; r < rows; r++) {
		const type = data[r * (row + 1)];
		const input = data.subarray(r * (row + 1) + 1, (r + 1) * (row + 1));
		const base = r * row;
		for (let i = 0; i < row; i++) {
			const left = i >= pixel ? out[base + i - pixel] : 0;
			const up = r > 0 ? out[base - row + i] : 0;
			const upLeft = r > 0 && i >= pixel ? out[base - row + i - pixel] : 0;
			let add;
			if (type === 0) add = 0;
			else if (type === 1) add = left;
			else if (type === 2) add = up;
			else if (type === 3) add = (left + up) >> 1;
			else if (type === 4) add = paeth(left, up, upLeft);
			else throw new Error(`a PNG predictor row of type ${type}`);
			out[base + i] = (input[i] + add) & 0xff;
		}
	}
	return out;
}

function paeth(a, b, c) {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
