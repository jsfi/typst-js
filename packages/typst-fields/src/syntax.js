// PDF objects as this package reads and writes them (ISO 32000 §7.3): dictionaries are maps from key
// to value, arrays are arrays, numbers, booleans and null are JavaScript's own, and names, strings,
// references and streams have a class each. Strings and names keep their bytes, so that what is read
// is written back unchanged.

/** A name, such as `/Type`, by its bytes as a Latin-1 string. */
export class Name {
	constructor(value) {
		this.value = value;
	}
}

/** A string, by its bytes. */
export class PdfString {
	constructor(bytes) {
		this.bytes = bytes;
	}
}

/** A reference to an indirect object, `12 0 R`. */
export class Ref {
	constructor(num, gen = 0) {
		this.num = num;
		this.gen = gen;
	}
}

/** A stream: its dictionary and its data, still encoded by the dictionary's filters. */
export class Stream {
	constructor(dict, data) {
		this.dict = dict;
		this.data = data;
	}
}

/** Whether `value` is the name `name`. */
export function isName(value, name) {
	return value instanceof Name && value.value === name;
}

/** `parts`, arrays of bytes, as one, in their order. */
export function concat(parts) {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

/** `value` as an array: itself if it is one, else an array of it, as PDF writes one object alone. */
export function asArray(value) {
	return Array.isArray(value) ? value : [value];
}

/** The bytes of a Latin-1 string, as PDF syntax is written. */
export function latin1(text) {
	const bytes = new Uint8Array(text.length);
	for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
	return bytes;
}

/** The Latin-1 string of `bytes` from `start` to `end`. */
export function fromLatin1(bytes, start = 0, end = bytes.length) {
	let text = '';
	for (let i = start; i < end; i += 0x8000) {
		text += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, end)));
	}
	return text;
}

/**
 * A text string (§7.9.2.2) of `text`: PDFDocEncoding where it is printable ASCII, UTF-16BE with a
 * byte order mark otherwise.
 */
export function textString(text) {
	if (/^[ -~]*$/.test(text)) return new PdfString(latin1(text));
	const bytes = [0xfe, 0xff];
	for (let i = 0; i < text.length; i++) {
		const unit = text.charCodeAt(i);
		bytes.push(unit >> 8, unit & 0xff);
	}
	return new PdfString(Uint8Array.from(bytes));
}

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

/** Reads PDF objects from bytes, from a position on. */
export class Parser {
	/**
	 * @param {Uint8Array} bytes
	 * @param {number} position
	 * @param {(value: unknown) => unknown} resolve Gives the value of a stream's `/Length` when it is
	 *   a reference
	 */
	constructor(bytes, position = 0, resolve = (value) => value) {
		this.bytes = bytes;
		this.position = position;
		this.resolve = resolve;
	}

	/** Reads an indirect object, `12 0 obj … endobj`, and returns its number, generation and value. */
	readIndirect() {
		const num = this.readValue();
		const gen = this.readValue();
		if (!Number.isInteger(num) || !Number.isInteger(gen) || this.readKeyword() !== 'obj') {
			throw new Error(`no object at byte ${this.position}`);
		}
		let value = this.readValue();
		const keyword = this.readKeyword();
		if (keyword === 'stream' && value instanceof Map) value = this.readStreamData(value);
		return { num, gen, value };
	}

	/** Reads one object: a value, or a reference such as `12 0 R`. */
	readValue() {
		this.skipWhitespace();
		const byte = this.bytes[this.position];
		if (byte === undefined) throw new Error('the PDF ends inside an object');
		if (byte === 0x2f) return this.readName();
		if (byte === 0x28) return this.readLiteralString();
		if (byte === 0x5b) {
			this.position++;
			const array = [];
			while (this.peekDelimiter() !== 0x5d) array.push(this.readValue());
			this.position++;
			return array;
		}
		if (byte === 0x3c) {
			if (this.bytes[this.position + 1] !== 0x3c) return this.readHexString();
			this.position += 2;
			const dict = new Map();
			while (this.peekDelimiter() !== 0x3e) {
				const key = this.readValue();
				if (!(key instanceof Name)) throw new Error(`a dictionary key at byte ${this.position}`);
				dict.set(key.value, this.readValue());
			}
			this.position += 2;
			return dict;
		}
		const token = this.readKeyword();
		if (token === 'true') return true;
		if (token === 'false') return false;
		if (token === 'null') return null;
		const number = Number(token);
		if (token === '' || Number.isNaN(number)) {
			throw new Error(`unexpected "${token}" at byte ${this.position}`);
		}
		if (Number.isInteger(number) && !token.includes('.')) {
			const after = this.position;
			const gen = this.tryInteger();
			if (gen !== undefined && this.readKeyword() === 'R') return new Ref(number, gen);
			this.position = after;
		}
		return number;
	}

	/** Reads a keyword or number: the regular characters up to the next delimiter. */
	readKeyword() {
		this.skipWhitespace();
		const start = this.position;
		while (this.position < this.bytes.length && !isBoundary(this.bytes[this.position])) {
			this.position++;
		}
		return fromLatin1(this.bytes, start, this.position);
	}

	/** Skips whitespace and comments, and returns the byte after them. */
	peekDelimiter() {
		this.skipWhitespace();
		if (this.position >= this.bytes.length) throw new Error('the PDF ends inside an object');
		return this.bytes[this.position];
	}

	skipWhitespace() {
		const { bytes } = this;
		while (this.position < bytes.length) {
			const byte = bytes[this.position];
			if (WHITESPACE.has(byte)) this.position++;
			else if (byte === 0x25) {
				while (
					this.position < bytes.length &&
					bytes[this.position] !== 0x0a &&
					bytes[this.position] !== 0x0d
				) {
					this.position++;
				}
			} else break;
		}
	}

	/** Reads a non-negative integer if one comes next, and leaves the position after it. */
	tryInteger() {
		const token = this.readKeyword();
		return /^\d+$/.test(token) ? Number(token) : undefined;
	}

	readName() {
		this.position++;
		let name = '';
		while (this.position < this.bytes.length && !isBoundary(this.bytes[this.position])) {
			const byte = this.bytes[this.position++];
			if (byte === 0x23) {
				name += String.fromCharCode(
					parseInt(fromLatin1(this.bytes, this.position, this.position + 2), 16),
				);
				this.position += 2;
			} else name += String.fromCharCode(byte);
		}
		return new Name(name);
	}

	readLiteralString() {
		const { bytes } = this;
		const out = [];
		let depth = 0;
		this.position++;
		for (;;) {
			const byte = bytes[this.position++];
			if (byte === undefined) throw new Error('the PDF ends inside a string');
			if (byte === 0x29 && depth === 0) break;
			if (byte === 0x28) depth++;
			if (byte === 0x29) depth--;
			if (byte === 0x0d) {
				// An end of line in a string is a line feed, whichever it is (§7.3.4.2).
				if (bytes[this.position] === 0x0a) this.position++;
				out.push(0x0a);
			} else if (byte === 0x5c) {
				const next = bytes[this.position++];
				const escaped = { 0x6e: 0x0a, 0x72: 0x0d, 0x74: 0x09, 0x62: 0x08, 0x66: 0x0c }[next];
				if (escaped !== undefined) out.push(escaped);
				else if (next >= 0x30 && next <= 0x37) {
					let code = next - 0x30;
					for (
						let i = 0;
						i < 2 && bytes[this.position] >= 0x30 && bytes[this.position] <= 0x37;
						i++
					) {
						code = code * 8 + bytes[this.position++] - 0x30;
					}
					out.push(code & 0xff);
				} else if (next === 0x0d) {
					if (bytes[this.position] === 0x0a) this.position++;
				} else if (next !== 0x0a) out.push(next);
			} else out.push(byte);
		}
		return new PdfString(Uint8Array.from(out));
	}

	readHexString() {
		this.position++;
		let digits = '';
		for (;;) {
			const byte = this.bytes[this.position++];
			if (byte === undefined) throw new Error('the PDF ends inside a string');
			if (byte === 0x3e) break;
			if (!WHITESPACE.has(byte)) digits += String.fromCharCode(byte);
		}
		if (digits.length % 2) digits += '0';
		const out = new Uint8Array(digits.length / 2);
		for (let i = 0; i < out.length; i++) out[i] = parseInt(digits.slice(2 * i, 2 * i + 2), 16);
		return new PdfString(out);
	}

	/** Reads the data after `stream`, as long as the dictionary's `/Length` says. */
	readStreamData(dict) {
		if (this.bytes[this.position] === 0x0d) this.position++;
		if (this.bytes[this.position] === 0x0a) this.position++;
		const length = this.resolve(dict.get('Length'));
		if (!Number.isInteger(length) || this.position + length > this.bytes.length) {
			throw new Error(`a stream at byte ${this.position} has no valid /Length`);
		}
		const data = this.bytes.subarray(this.position, this.position + length);
		this.position += length;
		if (this.readKeyword() !== 'endstream') {
			throw new Error(`a stream at byte ${this.position} does not end where its /Length says`);
		}
		return new Stream(dict, data);
	}
}

function isBoundary(byte) {
	return WHITESPACE.has(byte) || DELIMITERS.has(byte);
}

/** The PDF syntax of `value`, as a Latin-1 string; streams are written by `writeObject`. */
export function serialize(value) {
	if (value === null) return 'null';
	if (typeof value === 'boolean') return String(value);
	if (typeof value === 'number') return formatNumber(value);
	if (value instanceof Name) return `/${escapeName(value.value)}`;
	if (value instanceof Ref) return `${value.num} ${value.gen} R`;
	if (value instanceof PdfString) {
		return `<${Array.from(value.bytes, (b) => b.toString(16).padStart(2, '0')).join('')}>`;
	}
	if (Array.isArray(value)) return `[${value.map(serialize).join(' ')}]`;
	if (value instanceof Map) {
		let text = '<<';
		for (const [key, entry] of value) text += `/${escapeName(key)} ${serialize(entry)}`;
		return `${text}>>`;
	}
	throw new TypeError(`cannot write ${String(value)} as a PDF object`);
}

/** The bytes of indirect object `num`, a value or a stream, from `num 0 obj` to `endobj`. */
export function writeObject(num, gen, value) {
	if (!(value instanceof Stream)) return latin1(`${num} ${gen} obj\n${serialize(value)}\nendobj\n`);
	const dict = new Map(value.dict).set('Length', value.data.length);
	const head = latin1(`${num} ${gen} obj\n${serialize(dict)}\nstream\n`);
	const tail = latin1('\nendstream\nendobj\n');
	const bytes = new Uint8Array(head.length + value.data.length + tail.length);
	bytes.set(head);
	bytes.set(value.data, head.length);
	bytes.set(tail, head.length + value.data.length);
	return bytes;
}

/** A number as PDF writes it, in objects and content streams: no exponent, at most five decimals. */
export function formatNumber(number) {
	if (!Number.isFinite(number)) throw new TypeError(`cannot write ${number} as a PDF number`);
	if (Number.isInteger(number)) return String(number);
	return number.toFixed(5).replace(/\.?0+$/, '');
}

function escapeName(name) {
	let text = '';
	for (const char of name) {
		const code = char.charCodeAt(0);
		const regular = code > 0x20 && code < 0x7f && code !== 0x23 && !DELIMITERS.has(code);
		text += regular ? char : `#${code.toString(16).padStart(2, '0')}`;
	}
	return text;
}
