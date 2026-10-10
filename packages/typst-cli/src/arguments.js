// Arguments JavaScript does not check, so that one of the wrong type throws, as in the module,
// instead of being taken for something else.

import { projectPath } from './paths.js';

/** `value`, which has to be a string. */
export function stringArgument(value, name) {
	if (typeof value !== 'string') throw new Error(`${name} must be a string`);
	return value;
}

/** `value`, which has to be a `Uint8Array`, as a copy of its own. */
export function bytesArgument(value, name) {
	if (!(value instanceof Uint8Array)) throw new Error(`${name} must be a Uint8Array`);
	return Uint8Array.from(value);
}

/** A project path argument: a string, resolved against the project root as Typst resolves it. */
export function projectPathArgument(value) {
	return projectPath(stringArgument(value, 'path'));
}
