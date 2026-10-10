// Project paths and package specifications, resolved as Typst resolves them. A path that would lead
// out of the workspace throws before anything is written.

/** A version as Typst writes one, `major.minor.patch`, as a regular expression's source. */
export const VERSION = String.raw`\d+\.\d+\.\d+`;

/** `path` resolved against the project root, as `/a/b`, failing like Typst's own virtual paths. */
export function projectPath(path) {
	if (path.includes('\\')) {
		throw new Error('path contains backslash');
	}
	const segments = [];
	for (const segment of path.split('/')) {
		if (segment === '' || segment === '.') continue;
		if (segment === '..') {
			if (segments.length === 0) throw new Error('path escapes project root');
			segments.pop();
		} else {
			segments.push(segment);
		}
	}
	return `/${segments.join('/')}`;
}

/** Typst's identifiers: a letter or `_`, then letters, digits, `_` and `-`. */
const IDENT = String.raw`[\p{XID_Start}_][\p{XID_Continue}_-]*`;

/**
 * The path segments under a package directory where the CLI looks for the package `spec`,
 * `@namespace/name:major.minor.patch`. Namespace and name have to be identifiers, as in Typst, so
 * that neither leads out of the package directory.
 */
export function packageDirectory(spec) {
	const match = new RegExp(
		String.raw`^@(?<namespace>${IDENT})\/(?<name>${IDENT}):(?<version>${VERSION})$`,
		'u',
	).exec(spec);
	if (!match) throw new Error(`invalid package specification: ${spec}`);
	const { namespace, name, version } = match.groups;
	return [namespace, name, version];
}

/**
 * A file as diagnostics name it, split into the package specification and the path inside the
 * package: `{ spec, path }` for `@namespace/name:version/path`, `{ path }` for a project file.
 */
export function splitDisplayPath(text) {
	const match = new RegExp(String.raw`^(?<spec>@[^/]+\/[^/:]+:${VERSION})(?<path>\/.*)$`, 's').exec(
		text,
	);
	return match ? { spec: match.groups.spec, path: match.groups.path } : { path: text };
}
