// The compiler over the `typst` command-line program. It keeps its project in memory, like
// @jsfi/typst-wasm's, and every call writes it to a fresh workspace, runs `typst compile` or
// `typst eval` there and reads the output back. Everything but the API @jsfi/typst-wasm has is
// private, so that the two packages' objects offer the same members.

import { join } from 'node:path';

import { bytesArgument, projectPathArgument, stringArgument } from './arguments.js';
import { requireSelectedCli } from './cli.js';
import { parseDiagnostics } from './diagnostics.js';
import { fontFaces } from './font.js';
import { inputMap, pdfSettings, querySettings, svgPages } from './options.js';
import { projectPath } from './paths.js';
import { spawnCli } from './process.js';
import { Project } from './project.js';
import { newCompileResult, newError, newQueryResult, newWarning } from './results.js';
import { SelectionError, selectElements } from './selection.js';
import { svgFlags } from './settings.js';
import { Workspace } from './workspace.js';

/** The name the CLI gives a `typst eval` expression in its diagnostics. */
const EXPRESSION = '/<input-expression>';

/** A Typst compiler with its own in-memory project. */
export class Compiler {
	/** @type {import('./cli.js').CliSelection} */
	#cli;
	#project = new Project();
	#freed = false;
	#main;

	/**
	 * Creates a compiler with an empty project. It knows the fonts given to `addFont`, and the typst
	 * program's embedded fonts unless `init()` was given `ignoreEmbeddedFonts`.
	 */
	constructor() {
		this.#cli = requireSelectedCli();
	}

	addFile(path, data) {
		this.#checkLive();
		// Both arguments' types first, then the path itself, in the order the module checks them.
		const name = stringArgument(path, 'path');
		const bytes = bytesArgument(data, 'data');
		this.#project.files.set(projectPath(name), bytes);
	}

	addFont(data) {
		this.#checkLive();
		const bytes = bytesArgument(data, 'data');
		const faces = fontFaces(bytes);
		if (faces > 0) {
			this.#project.fonts.push(bytes);
		}
		return faces;
	}

	addPackageFile(spec, path, data) {
		this.#checkLive();
		const specification = stringArgument(spec, 'spec');
		const name = stringArgument(path, 'path');
		const bytes = bytesArgument(data, 'data');
		this.#project.packages.set(specification, name, bytes);
	}

	removeFile(path) {
		this.#checkLive();
		return this.#project.files.delete(projectPathArgument(path));
	}

	setMain(path) {
		this.#checkLive();
		this.#main = projectPathArgument(path);
	}

	setInputs(inputs) {
		this.#checkLive();
		this.#project.inputs = inputMap(inputs);
	}

	compilePdf(options) {
		this.#checkLive();
		const settings = pdfSettings(options);
		const ownWarnings = settings.pagesWarning();
		const refusal = settings.tagsRefusal();
		if (refusal) {
			return newCompileResult({
				diagnostics: this.#inModuleOrder({ ownWarnings, ownErrors: [refusal] }),
			});
		}
		const { files, diagnostics } = this.#runCompile('document.pdf', settings.flags());
		return newCompileResult({
			pdf: files?.get('document.pdf'),
			diagnostics: this.#inModuleOrder({ ownWarnings, fromCli: diagnostics }),
		});
	}

	compileSvg(options) {
		this.#checkLive();
		const { files, diagnostics } = this.#runCompile('page-{0p}.svg', svgFlags(svgPages(options)));
		const decoder = new TextDecoder();
		const svg =
			files && [...files.keys()].toSorted().map((name) => decoder.decode(files.get(name)));
		return newCompileResult({ svg, diagnostics: this.#inModuleOrder({ fromCli: diagnostics }) });
	}

	query(selector, options) {
		this.#checkLive();
		const expression = `query(${stringArgument(selector, 'selector')})`;
		const settings = querySettings(options);
		const { stdout, diagnostics } = this.#runCli(
			() => ['eval', expression, '--in', this.#mainPath(), '--format=json'],
			new TextEncoder().encode(expression),
		);
		let value;
		const ownErrors = [];
		if (stdout !== undefined) {
			try {
				value = selectElements(JSON.parse(stdout), settings);
			} catch (error) {
				if (!(error instanceof SelectionError)) throw error;
				ownErrors.push(newError(error.message));
			}
		}
		return newQueryResult({
			value,
			diagnostics: this.#inModuleOrder({ fromCli: diagnostics, ownErrors }),
		});
	}

	/**
	 * Releases the compiler. The project lives in JavaScript objects, so this only marks it released,
	 * after which every call throws as the module's does.
	 */
	free() {
		this.#checkLive();
		this.#freed = true;
	}

	[Symbol.dispose]() {
		this.free();
	}

	#checkLive() {
		if (this.#freed) throw new Error('null pointer passed to rust');
	}

	/**
	 * The module's warning that no text is rendered, while the CLI ignores its embedded fonts and no
	 * font is added; with a hint of this package's own, as its messages do not point to the
	 * module's.
	 */
	#noFontsWarning() {
		if (!this.#cli.ignoreEmbeddedFonts || this.#project.fonts.length > 0) return [];
		return [
			newWarning('no fonts are loaded, so no text is rendered', [
				'load fonts with addFont(), or call init() without ignoreEmbeddedFonts',
			]),
		];
	}

	/**
	 * The main file as the CLI takes it, relative to the project directory it runs in; `./` keeps a
	 * name such as `-draft.typ` from being read as a flag.
	 */
	#mainPath() {
		return `.${this.#main}`;
	}

	/** Runs `typst compile` with `flags`, writing to `file` in the output directory. */
	#runCompile(file, flags) {
		return this.#runCli((output) => ['compile', this.#mainPath(), join(output, file), ...flags]);
	}

	/**
	 * The diagnostics in the module's order: `ownWarnings`, which this package gives before
	 * compiling; the CLI's warnings; the no-fonts warning; the CLI's errors; then `ownErrors`, which
	 * this package gives after compiling.
	 */
	#inModuleOrder({ ownWarnings = [], fromCli = [], ownErrors = [] }) {
		const { warning = [], error = [] } = Object.groupBy(fromCli, (entry) => entry.severity);
		return [...ownWarnings, ...warning, ...this.#noFontsWarning(), ...error, ...ownErrors];
	}

	/**
	 * What a run of the CLI gave: the diagnostics and, when it succeeded, the files it wrote, by
	 * name, and what it printed.
	 *
	 * @typedef {{
	 * 	diagnostics: import('./results.js').Diagnostic[];
	 * 	files?: Map<string, Uint8Array>;
	 * 	stdout?: string;
	 * }} CliRun
	 */

	/**
	 * Runs the CLI on the project, written to a workspace for this run alone, with the arguments
	 * `argumentsFor(outputDirectory)` gives before the project's own, and reads back the diagnostics
	 * and, if it succeeded, its output before the workspace goes. `expression` is the source of
	 * `/<input-expression>`, for diagnostics in a query.
	 *
	 * @returns {CliRun}
	 */
	#runCli(argumentsFor, expression) {
		if (this.#main === undefined) {
			throw new Error('No main file set; call setMain() first.');
		}
		const unreadable = this.#project.unreadableReason(this.#main);
		if (unreadable) return { diagnostics: [newError(unreadable)] };
		const workspace = new Workspace();
		try {
			workspace.write(this.#project);
			const run = spawnCli(
				this.#cli.path,
				[
					...argumentsFor(workspace.output),
					...workspace.confinementFlags(this.#cli),
					...this.#project.inputFlags(),
				],
				workspace.project,
			);
			const diagnostics = parseDiagnostics(
				run.stderr,
				(path) => (path === EXPRESSION ? expression : this.#project.sourceBytes(path)),
				(text) => workspace.moduleNames(text),
			);
			if (run.status !== 0) return { diagnostics };
			return { files: workspace.readOutput(), stdout: run.stdout, diagnostics };
		} finally {
			workspace.remove();
		}
	}
}
