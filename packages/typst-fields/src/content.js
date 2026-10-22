// Marked content in a page's content stream (ISO 32000 §14.6): the sections tagged with given MCIDs,
// by their byte ranges, so that they can be cut out of the page and drawn elsewhere. Typst writes
// each such section self-contained, with the state it draws in saved, set and restored inside it,
// so its operators draw the same wherever they are copied.

import { concat, Parser, fromLatin1 } from './syntax.js';

/** The bytes that may begin an operand rather than an operator. */
const OPERAND_STARTS = new Set([0x2f, 0x28, 0x3c, 0x5b]); // / ( < [

/**
 * The sections of `content` marked with one of `mcids`, outermost only, in stream order: `start`
 * and `end` enclose the section with its `BDC` and `EMC`, `inner` the bytes between them.
 */
export function markedSections(content, mcids) {
	const parser = new Parser(content);
	const sections = [];
	const open = [];
	let operands = [];
	let operandStart;
	for (;;) {
		parser.skipWhitespace();
		const start = parser.position;
		if (start >= content.length) break;
		if (OPERAND_STARTS.has(content[start])) {
			operandStart ??= start;
			operands.push(parser.readValue());
			continue;
		}
		const token = parser.readKeyword();
		if (token === '') throw new Error(`unexpected byte ${content[start]} in a content stream`);
		if (token === 'true' || token === 'false' || token === 'null' || isNumber(token)) {
			operandStart ??= start;
			operands.push(token);
			continue;
		}
		if (token === 'BI') skipInlineImage(parser);
		else if (token === 'BMC' || token === 'BDC') {
			const properties = token === 'BDC' ? operands[1] : undefined;
			const mcid = properties instanceof Map ? properties.get('MCID') : undefined;
			open.push({ start: operandStart ?? start, inner: parser.position, mcid });
		} else if (token === 'EMC') {
			const section = open.pop();
			if (!section) throw new Error('a content stream ends marked content it never began');
			const outermost = !open.some((s) => mcids.has(s.mcid));
			if (mcids.has(section.mcid) && outermost) {
				sections.push({
					mcid: section.mcid,
					start: section.start,
					end: parser.position,
					inner: content.subarray(section.inner, start),
				});
			}
		}
		operands = [];
		operandStart = undefined;
	}
	return sections;
}

/** `content` without the byte ranges of `sections`, which are in stream order. */
export function cut(content, sections) {
	const parts = [];
	let at = 0;
	for (const { start, end } of sections) {
		parts.push(content.subarray(at, start));
		at = end;
	}
	parts.push(content.subarray(at));
	return concat(parts);
}

/** Whether a content stream token is a number, an operand rather than an operator. */
function isNumber(token) {
	return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(token);
}

/** Moves past an inline image's data (§8.9.7), which ends at `EI` between whitespace. */
function skipInlineImage(parser) {
	const { bytes } = parser;
	const data = fromLatin1(bytes, parser.position);
	const id = /\sID\s/.exec(data);
	const ei = id && /\sEI(?=\s|$)/.exec(data.slice(id.index + id[0].length));
	if (!id || !ei) throw new Error('a content stream has an inline image without its end');
	parser.position += id.index + id[0].length + ei.index + ei[0].length;
}
