// The results as @jsfi/typst-wasm returns them, as plain objects: the CLI's output is already in
// JavaScript, so there is nothing to release.

/**
 * Plain data with `free()` and disposal as @jsfi/typst-wasm's objects have them, so that code
 * written for the module runs unchanged; there is nothing to release.
 */
class ModuleObjectBase {
	free() {}

	[Symbol.dispose]() {}
}

/**
 * The outcome of one compilation: the output when it succeeded, and every warning and error either
 * way. Created by the compiler only, as the module's are.
 */
export class CompileResult extends ModuleObjectBase {}

/**
 * The outcome of a query: the matched value when it succeeded, and every warning and error either
 * way. Created by the compiler only, as the module's are.
 */
export class QueryResult extends ModuleObjectBase {}

/** A diagnostic's fields, in the order the module's `toJSON()` gives them. */
const DIAGNOSTIC_FIELDS = [
	'column',
	'end',
	'hints',
	'line',
	'message',
	'path',
	'severity',
	'start',
];

/** The diagnostic's fields of `source` as a plain object, in the order of `DIAGNOSTIC_FIELDS`. */
function diagnosticFields(source) {
	return Object.fromEntries(DIAGNOSTIC_FIELDS.map((field) => [field, source[field]]));
}

/** A warning or error, with its place when it has one. Created by the compiler only. */
export class Diagnostic extends ModuleObjectBase {
	/** The fields as a plain object, as the module's `toJSON()` gives them. */
	toJSON() {
		return diagnosticFields(this);
	}

	toString() {
		return JSON.stringify(this);
	}
}

// The factories this package builds its results with. index.js does not export them, so that the
// classes, like the module's, cannot be constructed with fields from outside.

export function newCompileResult({ pdf, svg, diagnostics }) {
	return Object.assign(new CompileResult(), { pdf, svg, diagnostics });
}

export function newQueryResult({ value, diagnostics }) {
	return Object.assign(new QueryResult(), { value, diagnostics });
}

/**
 * A diagnostic from `fields`, any of those `DIAGNOSTIC_FIELDS` names; the others are `undefined`,
 * and the hints empty unless given.
 */
export function newDiagnostic(fields) {
	return Object.assign(new Diagnostic(), diagnosticFields({ hints: [], ...fields }));
}

/** An error of this package's own, about no place in the document. */
export function newError(message, hints = []) {
	return newDiagnostic({ severity: 'error', message, hints });
}

/** A warning of this package's own, about no place in the document. */
export function newWarning(message, hints = []) {
	return newDiagnostic({ severity: 'warning', message, hints });
}
