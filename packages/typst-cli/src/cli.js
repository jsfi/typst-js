// Selecting the `typst` program: `init()` and `initSync()`, the one part of the API that differs from
// @jsfi/typst-wasm's, where they load the module instead.

import { spawnSync } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join, resolve, sep } from 'node:path';

import { checkedBoolean, checkedString } from './options.js';
import { VERSION } from './paths.js';

/** Whether `version`, `[major, minor, patch]`, is `minimum` or newer. */
function atLeast(version, minimum) {
	const index = version.findIndex((part, i) => part !== minimum[i]);
	return index < 0 || version[index] > minimum[index];
}

/**
 * The oldest CLI this package runs: the Typst minor version the module bundles, whose diagnostics
 * read like the module's, and whose `typst eval` takes `--in`, which `query()` needs.
 */
const MINIMUM_VERSION = [0, 15, 0];

/**
 * The CLI `init()` selected: the absolute path of the executable, and whether to leave out the
 * fonts it embeds.
 *
 * @typedef {{ path: string; ignoreEmbeddedFonts: boolean }} CliSelection
 */

/**
 * The CLI every `Compiler` created from now on runs.
 *
 * @type {CliSelection | undefined}
 */
let selection;

/**
 * Runs the typst CLI at `typstPath` to read its version and makes it the one every `Compiler`
 * created from now on runs, with Typst's embedded fonts unless `ignoreEmbeddedFonts`. Throws if it
 * cannot be run or is older than this package needs.
 */
export function initSync({ typstPath = 'typst', ignoreEmbeddedFonts = false } = {}) {
	checkedString(typstPath, 'InitOptions.typstPath');
	checkedBoolean(ignoreEmbeddedFonts, 'InitOptions.ignoreEmbeddedFonts');
	const install = `install typst ${MINIMUM_VERSION.join('.')} or newer, or pass its path as typstPath.`;
	const path = resolveExecutable(typstPath);
	if (path === undefined) {
		const name = typstPath === 'typst' ? '' : ` ${typstPath}`;
		throw new Error(`The typst CLI${name} is not on the PATH; ${install}`);
	}
	const probe = spawnSync(path, ['--version'], { encoding: 'utf8' });
	if (probe.error || probe.status !== 0) {
		throw new Error(`The typst CLI at ${path} could not be run; ${install}`);
	}
	const version = new RegExp(`typst (?<version>${VERSION})`)
		.exec(probe.stdout)
		?.groups.version.split('.')
		.map(Number);
	if (!version || !atLeast(version, MINIMUM_VERSION)) {
		throw new Error(
			`The typst CLI at ${path} reports "${probe.stdout.trim()}", ` +
				`but ${MINIMUM_VERSION.join('.')} or newer is needed.`,
		);
	}
	selection = { path, ignoreEmbeddedFonts };
	return { path, version: version.join('.') };
}

/**
 * The absolute path of the executable `command` names: resolved against the working directory if it
 * contains a path separator, else the first match on the PATH, as a shell finds it (with the
 * extensions in PATHEXT on Windows). `undefined` if the PATH has none.
 */
function resolveExecutable(command) {
	if (command.includes('/') || command.includes(sep)) return resolve(command);
	const extensions =
		process.platform === 'win32'
			? ['', ...(process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')]
			: [''];
	for (const directory of (process.env.PATH ?? '').split(delimiter)) {
		if (directory === '') continue;
		for (const extension of extensions) {
			const candidate = join(directory, command + extension);
			if (isExecutableFile(candidate)) return resolve(candidate);
		}
	}
	return undefined;
}

function isExecutableFile(path) {
	try {
		accessSync(path, constants.X_OK);
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

/** `initSync()` as a promise, for code written against @jsfi/typst-wasm's `init()`. */
export async function init(options) {
	return initSync(options);
}

/** The CLI `init()` selected, for a new `Compiler`; throws if `init()` was not called. */
export function requireSelectedCli() {
	if (selection === undefined) {
		throw new Error('No typst CLI selected; call init() or initSync() first.');
	}
	return selection;
}
