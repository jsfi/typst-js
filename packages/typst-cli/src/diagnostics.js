// The CLI's human-readable diagnostics, read back into the module's: the message, the hints, the
// place each one starts at, and its byte range, recovered from the carets codespan draws under the
// source. Paths in the workspace are given the names the module gives the same files.

import { byteRange } from './byte-range.js';
import { projectPath, splitDisplayPath, VERSION } from './paths.js';
import { newDiagnostic } from './results.js';

/**
 * The errors Typst's parser reports at a position, with an empty span, which codespan draws as one
 * caret like a span of one character.
 */
const EMPTY_SPAN_ERRORS = new Set(
	[
		'argument list',
		'arrow',
		'block',
		'colon',
		'comma',
		'comma or semicolon',
		'equals sign',
		'expression',
		'identifier',
		'keyword `in`',
		'named or keyed pair',
		'pattern',
		'semicolon or line break',
	].map((thing) => `expected ${thing}`),
);

/** The columns a multi-line span's gutter takes before the source, for the one span it draws. */
const MULTI_LINE_GUTTER = 2;

/**
 * The diagnostics in `output`. `source(path)` gives the bytes of a file as a diagnostic names it;
 * `rename(text)` replaces the workspace's paths in a message or hint with the module's names.
 */
export function parseDiagnostics(output, source, rename) {
	return splitIntoDiagnostics(output).map((lines) => readDiagnostic(lines, source, rename));
}

/** The output's lines, one list per diagnostic, each starting with its `error:` or `warning:`. */
function splitIntoDiagnostics(output) {
	const result = [];
	for (const line of output.split(/\r?\n/)) {
		if (/^(error|warning): /.test(line)) result.push([line]);
		else result.at(-1)?.push(line);
	}
	return result;
}

/** Lines of the source snippet and the hints, which end a message that runs over several lines. */
const SNIPPET = /^\s*(┌─|│|\d+ │|= hint:|hint:)/;

/**
 * One diagnostic from its lines: its message, then what the snippet below says about its place and
 * its hints, read back into the module's terms.
 */
function readDiagnostic([header, ...lines], source, rename) {
	const [, severity, firstLine] = /^(error|warning): (.*)$/.exec(header);
	const { message, rest } = readMessage(firstLine, lines);
	const { place, hints } = readSnippet(rest);
	const data = place === undefined ? undefined : source(place.path);
	const empty = severity === 'error' && EMPTY_SPAN_ERRORS.has(message);
	const range = place === undefined ? {} : byteRange(data, place, { empty });
	return newDiagnostic({
		severity,
		message:
			notADirectory(message, place?.path, range, data) ??
			packageNotFound(message) ??
			rename(message),
		hints: hints.map(rename),
		path: place?.path,
		line: place?.line,
		// The column as the CLI names it, unless the byte range corrects it.
		column: place?.column,
		...range,
	});
}

/** The message, which continues from its first line up to the snippet; and the lines after it. */
function readMessage(firstLine, lines) {
	let index = 0;
	const message = [firstLine];
	while (index < lines.length && lines[index] !== '' && !SNIPPET.test(lines[index])) {
		message.push(lines[index++]);
	}
	return { message: message.join('\n'), rest: lines.slice(index) };
}

/**
 * What the snippet says: the place of the diagnostic, `{ path, line, column, end }`, from the first
 * `┌─ path:line:column` and the carets under the source, which give its `end`; and `= hint:` lines
 * (or plain `hint:` lines after an error without a location), which add hints.
 */
function readSnippet(lines) {
	let location;
	let carets;
	let lastLine;
	const hints = [];
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (location === undefined && LOCATION_LINE.test(line)) {
			({ location, index } = readLocation(lines, index));
			continue;
		}
		const sourceLine = /^\s*(\d+) │/.exec(line);
		if (sourceLine) lastLine = Number(sourceLine[1]);
		carets ??= caretsEnd(line, location?.line, lastLine);
		const hint = /^(?:\s*= )?hint: (.*)$/.exec(line);
		if (hint) hints.push(hint[1]);
	}
	return { place: location && { ...location, end: carets }, hints };
}

/** The line that locates a diagnostic: `┌─ path:line:column`. */
const LOCATION_LINE = /^\s*┌─ (.*)$/;

/**
 * The location that starts on `lines[index]`, read over as many lines as a path with line breaks
 * takes, with the index of the line it ends on.
 */
function readLocation(lines, start) {
	let index = start;
	let text = LOCATION_LINE.exec(lines[index])[1];
	let location = parseLocation(text);
	while (!location && index + 1 < lines.length) {
		text += `\n${lines[++index]}`;
		location = parseLocation(text);
	}
	return { location, index };
}

/**
 * Where the carets on `line` end, if it is a caret line, as `{ line, lastColumn }`: the source line
 * and the display column of the last character they mark. Carets under a single line (`│ ^^^`) end
 * on `startLine`; the bottom of a span over several lines (`│ ╰──^`) on `lastLine`, the last source
 * line shown.
 */
function caretsEnd(line, startLine, lastLine) {
	const carets = /^\s*│ ( *)(\^+)/.exec(line);
	if (carets) return { line: startLine, lastColumn: carets[1].length + carets[2].length - 1 };
	const bottom = /^\s*│ (.*╰─*)\^/.exec(line);
	if (bottom) return { line: lastLine, lastColumn: bottom[1].length - MULTI_LINE_GUTTER };
	return undefined;
}

/**
 * The module's message for a path that runs through a file as if it were a directory, which the CLI
 * reports with the operating system's error and no path. The path is the string the span covers,
 * resolved as Typst resolves it; `undefined` for any other diagnostic.
 */
function notADirectory(message, path, { start, end }, data) {
	if (!/^failed to load file \(Not a directory \(os error \d+\)\)$/.test(message)) return undefined;
	if (data === undefined || start === undefined || end === undefined) return undefined;
	const literal = /^"([^"\\]*)"$/.exec(new TextDecoder().decode(data.subarray(start, end)));
	const resolved = literal && resolve(path, literal[1]);
	return resolved && `file not found (searched at ${resolved})`;
}

/**
 * The module's message for a package of which no file was added: the CLI, kept offline, fails to
 * download it instead. `undefined` for any other message.
 */
function packageNotFound(message) {
	const download = new RegExp(
		String.raw`^failed to download package \(\w+:\/\/[^/]+\/(?<namespace>[^/]+)\/(?<name>.+)-(?<version>${VERSION})\.tar\.gz:`,
	).exec(message);
	if (!download) return undefined;
	const { namespace, name, version } = download.groups;
	return `package not found (searched for @${namespace}/${name}:${version})`;
}

/**
 * `written`, a path in the file at `from`, as the module names it: from the project's or the
 * package's root if it starts with `/`, otherwise from the file's directory.
 */
function resolve(from, written) {
	const { spec = '', path: inside } = splitDisplayPath(from);
	const joined = written.startsWith('/')
		? written
		: `${inside.slice(0, inside.lastIndexOf('/'))}/${written}`;
	try {
		return spec + projectPath(joined);
	} catch {
		return undefined;
	}
}

/**
 * The place `text`, `path:line:column`, names: `{ path, line, column }`, its column counting from 0
 * and ours from 1; `undefined` while it is incomplete, as a path with a line break in it spans
 * several lines of output. A path is a package's if it starts with a package specification, as a
 * project path may start with `@` as well.
 */
function parseLocation(text) {
	const location = /^(.+):(\d+):(\d+)$/s.exec(text);
	if (!location) return undefined;
	const inPackage = splitDisplayPath(location[1]).spec !== undefined;
	return {
		path: inPackage ? location[1] : `/${location[1]}`,
		line: Number(location[2]),
		column: Number(location[3]) + 1,
	};
}
