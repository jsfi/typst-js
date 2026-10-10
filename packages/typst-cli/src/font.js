// Font files as this package sees them: how many faces a file holds, which `addFont` returns, and the
// extension it is written out with. The program checks the faces themselves when it loads them.

const TRUE_TYPE = [0x00010000, 0x74727565]; // and 'true'
const OPEN_TYPE = 0x4f54544f; // 'OTTO'
const COLLECTION = 0x74746366; // 'ttcf'

/** How many faces a font file holds, as its header says: 0 for anything that is not a font. */
export function fontFaces(data) {
	const magic = readUint32(data, 0);
	if (magic === COLLECTION) return readUint32(data, 8) ?? 0;
	return magic === OPEN_TYPE || TRUE_TYPE.includes(magic) ? 1 : 0;
}

/** The file extension of a font file: `ttc`, `otf` or `ttf`. */
export function fontExtension(data) {
	const magic = readUint32(data, 0);
	return magic === COLLECTION ? 'ttc' : magic === OPEN_TYPE ? 'otf' : 'ttf';
}

/** The big-endian 32-bit unsigned integer at `offset` in `data`, or `undefined` past the end. */
function readUint32(data, offset) {
	if (offset + 4 > data.byteLength) return undefined;
	return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset);
}
