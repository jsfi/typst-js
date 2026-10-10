// A diagnostic's byte range, recovered from the line and column the CLI names and the display column
// its carets end at: the source lines as Typst splits them, and the columns codespan draws their
// characters at.

/** Typst's tab width in its diagnostics. */
const TAB_WIDTH = 2;

/**
 * The lines of `text` as Typst splits them, each able to turn a character index into a byte offset
 * and a display column, as codespan draws it, into the byte after the character there.
 */
function sourceLines(text) {
	const encoder = new TextEncoder();
	const lines = [];
	let offset = 0;
	for (const [, content, newline] of text.matchAll(
		/([^\n\v\f\r\u0085\u2028\u2029]*)(\r\n|[\n\v\f\r\u0085\u2028\u2029]|$)/gu,
	)) {
		// oxlint-disable-next-line typescript/no-misused-spread -- Typst counts columns in code points, which the spread yields; graphemes would not match the module's offsets.
		const characters = [...content];
		const start = offset;
		/** The byte offset in the file of the character at `index` on this line. */
		const byteAt = (index) => start + encoder.encode(characters.slice(0, index).join('')).length;
		lines.push({
			byteAt,
			byteAfterColumn: (display) => {
				let column = 0;
				for (let index = 0; index < characters.length; index++) {
					column += displayWidth(characters[index], column);
					if (column > display) return byteAt(index + 1);
				}
				return byteAt(characters.length);
			},
		});
		offset += encoder.encode(content + newline).length;
		if (newline === '') break;
	}
	return lines;
}

/** Characters codespan draws two columns wide: East Asian wide and full-width ones, and emoji. */
const WIDE =
	/[\u1100-\u115F\u231A\u231B\u2329\u232A\u23E9-\u23EC\u23F0\u23F3\u25FD\u25FE\u2614\u2615\u2648-\u2653\u267F\u2693\u26A1\u26AA\u26AB\u26BD\u26BE\u26C4\u26C5\u26CE\u26D4\u26EA\u26F2\u26F3\u26F5\u26FA\u26FD\u2705\u270A\u270B\u2728\u274C\u274E\u2753-\u2755\u2757\u2795-\u2797\u27B0\u27BF\u2B1B\u2B1C\u2B50\u2B55\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6\u{16FE0}-\u{16FE4}\u{17000}-\u{18CFF}\u{1B000}-\u{1B2FF}\u{1F004}\u{1F0CF}\u{1F18E}\u{1F191}-\u{1F19A}\u{1F200}-\u{1F251}\u{1F300}-\u{1F320}\u{1F32D}-\u{1F335}\u{1F337}-\u{1F37C}\u{1F37E}-\u{1F393}\u{1F3A0}-\u{1F3CA}\u{1F3CF}-\u{1F3D3}\u{1F3E0}-\u{1F3F0}\u{1F3F4}\u{1F3F8}-\u{1F43E}\u{1F440}\u{1F442}-\u{1F4FC}\u{1F4FF}-\u{1F53D}\u{1F54B}-\u{1F54E}\u{1F550}-\u{1F567}\u{1F57A}\u{1F595}\u{1F596}\u{1F5A4}\u{1F5FB}-\u{1F64F}\u{1F680}-\u{1F6C5}\u{1F6CC}\u{1F6D0}-\u{1F6D2}\u{1F6D5}-\u{1F6D7}\u{1F6DC}-\u{1F6DF}\u{1F6EB}\u{1F6EC}\u{1F6F4}-\u{1F6FC}\u{1F7E0}-\u{1F7EB}\u{1F7F0}\u{1F90C}-\u{1F93A}\u{1F93C}-\u{1F945}\u{1F947}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{20000}-\u{2FFFD}\u{30000}-\u{3FFFD}]/u;

/** Characters codespan draws no column wide: combining marks, joiners and controls. */
const ZERO_WIDTH_CHARACTER = /[\p{Mn}\p{Me}\p{Cc}\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF]/u;

/** The columns codespan gives `character` at display column `column`: tabs stop every two. */
function displayWidth(character, column) {
	if (character === '\t') return TAB_WIDTH - (column % TAB_WIDTH);
	if (ZERO_WIDTH_CHARACTER.test(character)) return 0;
	return WIDE.test(character) ? 2 : 1;
}

/**
 * The byte range in `data` of the span the CLI draws at `place`: its start at `line` and `column`
 * (one-based, as the CLI counts them), and its end where the carets `end`, `{ line, lastColumn }`,
 * stop, or at the start if the span is `empty`. Gives `{ start, end, column }`, the column as the
 * module counts it; less if the source is unknown or the carets were not found.
 *
 * @param {Uint8Array | undefined} data
 * @param {{
 * 	path: string;
 * 	line: number;
 * 	column: number;
 * 	end?: { line: number; lastColumn: number };
 * }} place
 * @param {{ empty: boolean }} options
 */
export function byteRange(data, { line, column: cliColumn, end: carets }, { empty }) {
	if (!data || line === undefined) return {};
	const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(data);
	const lines = sourceLines(text);
	const startLine = lines[line - 1];
	if (!startLine) return {};
	// The CLI reads a source without its byte order mark, the module with it: on the first line, the
	// mark is one more character before the column.
	const column = line === 1 && text.startsWith('\uFEFF') ? cliColumn + 1 : cliColumn;
	const start = startLine.byteAt(column - 1);
	if (empty) return { start, end: start, column };
	const endLine = carets && lines[carets.line - 1];
	if (!endLine) return { start, column };
	return { start, end: endLine.byteAfterColumn(carets.lastColumn), column };
}
