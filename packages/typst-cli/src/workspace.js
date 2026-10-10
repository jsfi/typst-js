// The temporary directory one run of the CLI works in: the project, its fonts and packages written
// out for the run, a package cache of its own, and the directory the CLI writes its output to. The
// compiler removes it after the run, so no directory outlives a call.

import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { fontExtension } from './font.js';
import { VERSION } from './paths.js';

export class Workspace {
	#root = mkdtempSync(join(tmpdir(), 'jsfi-typst-'));
	project = join(this.#root, 'project');
	fonts = join(this.#root, 'fonts');
	packages = join(this.#root, 'packages');
	cache = join(this.#root, 'cache');
	output = join(this.#root, 'output');

	/** The project and package directories as the CLI may name them: as created, or resolved. */
	#spellings;

	constructor() {
		for (const directory of [this.project, this.fonts, this.packages, this.cache, this.output]) {
			mkdirSync(directory, { recursive: true });
		}
		const longestFirst = (directory) =>
			[directory, realpathSync(directory)].toSorted((a, b) => b.length - a.length);
		this.#spellings = {
			project: longestFirst(this.project),
			packages: longestFirst(this.packages),
		};
	}

	/** Writes the files, fonts and package files of `project`. */
	write({ files, fonts, packages }) {
		for (const [path, data] of files) writeFile(join(this.project, path), data);
		// Typst loads the fonts of a directory in the order of their names, so the names keep the
		// order they were added in, as the module does.
		for (const [index, data] of fonts.entries()) {
			const name = `font-${String(index).padStart(6, '0')}.${fontExtension(data)}`;
			writeFile(join(this.fonts, name), data);
		}
		for (const { directory, files: packageFiles } of packages) {
			for (const [path, data] of packageFiles) {
				writeFile(join(this.packages, ...directory, path), data);
			}
		}
	}

	/**
	 * The flags that confine the CLI to the written project: its root, fonts (never the system's, and
	 * Typst's embedded ones unless `ignoreEmbeddedFonts`) and packages (with a cache of their own, so
	 * nothing reaches the user's).
	 *
	 * @param {import('./cli.js').CliSelection} cli
	 */
	confinementFlags({ ignoreEmbeddedFonts }) {
		return [
			'--root=.',
			`--font-path=${this.fonts}`,
			'--ignore-system-fonts',
			...(ignoreEmbeddedFonts ? ['--ignore-embedded-fonts'] : []),
			`--package-path=${this.packages}`,
			`--package-cache-path=${this.cache}`,
			'--diagnostic-format=human',
		];
	}

	/**
	 * `text` with the workspace's paths replaced: a project file becomes `/path`, a package file
	 * `@namespace/name:version/path`, as the module names them.
	 */
	moduleNames(text) {
		let result = text;
		for (const directory of this.#spellings.packages) {
			result = result.replaceAll(
				new RegExp(
					`${escapeRegExp(directory)}/(?<namespace>[^/]+)/(?<name>[^/]+)/(?<version>${VERSION})/`,
					'g',
				),
				'@$<namespace>/$<name>:$<version>/',
			);
		}
		for (const directory of this.#spellings.project)
			result = result.replaceAll(`${directory}/`, '/');
		return result;
	}

	/** The files the CLI wrote to the output directory, by name. */
	readOutput() {
		return new Map(
			readdirSync(this.output).map((name) => [
				name,
				new Uint8Array(readFileSync(join(this.output, name))),
			]),
		);
	}

	remove() {
		rmSync(this.#root, { recursive: true, force: true });
	}
}

/**
 * Writes `data` to `path`, its directories first, with the reason the file system gives if it
 * cannot.
 */
function writeFile(path, data) {
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, data);
	} catch (error) {
		throw new Error(`The file system cannot hold a project file: ${error.message}`, {
			cause: error,
		});
	}
}

function escapeRegExp(text) {
	return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
