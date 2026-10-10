// @jsfi/typst-cli: the API of @jsfi/typst-wasm over the `typst` command-line program. `init()` and
// `initSync()` select the program instead of loading a module; everything else is the module's API,
// which index.d.ts carries over from its declarations.

import { readFileSync } from 'node:fs';

export { init as default, initSync } from './cli.js';
export { Compiler } from './compiler.js';
export { CompileResult, Diagnostic, QueryResult } from './results.js';

/** The version in package.json, read on the first call. */
let packageVersion;

/** The version of this package. */
export function version() {
	packageVersion ??= JSON.parse(
		readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
	).version;
	return packageVersion;
}
