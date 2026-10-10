// The project a compiler holds in memory until a run writes it to a workspace: its files, packages,
// fonts and inputs.

import { packageDirectory, projectPath, splitDisplayPath } from './paths.js';

export class Project {
	/** The project's files, by path. */
	files = new Map();
	packages = new PackageSet();
	/** The font files given to `addFont`, in the order they were added. */
	fonts = [];
	/** What the document sees as `sys.inputs`, by key. */
	inputs = new Map();

	/** The CLI flags that give the document its `sys.inputs`. */
	inputFlags() {
		return [...this.inputs].map(([key, value]) => `--input=${key}=${value}`);
	}

	/** The bytes of a file as a diagnostic names it: `/path` or `@namespace/name:version/path`. */
	sourceBytes(path) {
		return this.packages.get(path) ?? this.files.get(path);
	}

	/** Why `path` cannot be read as a file, as the module words it; `undefined` if it can. */
	unreadableReason(path) {
		if (this.files.has(path)) return undefined;
		const isDirectory =
			path === '/' || [...this.files.keys()].some((file) => file.startsWith(`${path}/`));
		return isDirectory
			? 'failed to load file (is a directory)'
			: `file not found (searched at ${path})`;
	}
}

/** The added packages, each with its files by path and the directory the CLI looks for it in. */
class PackageSet {
	/** By specification. */
	#packages = new Map();

	/** Adds the file at `path` of the package `spec`. */
	set(spec, path, data) {
		const directory = packageDirectory(spec);
		const file = projectPath(path);
		let known = this.#packages.get(spec);
		if (!known) {
			known = { directory, files: new Map() };
			this.#packages.set(spec, known);
		}
		known.files.set(file, data);
	}

	/**
	 * The bytes of a package file as a diagnostic names it, `@namespace/name:version/path`;
	 * `undefined` for a file not added, or a path that is not a package's.
	 */
	get(displayPath) {
		const { spec, path } = splitDisplayPath(displayPath);
		return spec === undefined ? undefined : this.#packages.get(spec)?.files.get(path);
	}

	/** Every package, as `{ directory, files }`. */
	[Symbol.iterator]() {
		return this.#packages.values();
	}
}
