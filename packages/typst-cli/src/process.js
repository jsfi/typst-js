// Running the `typst` program the way this package needs it: in the project's directory, offline,
// and without what would make it differ from the module.

import { spawnSync } from 'node:child_process';

/**
 * A proxy nothing listens on. The module never touches the network, so the CLI must not either: a
 * package that was not added fails to download at once, and is reported as not found.
 */
const NO_NETWORK = 'http://127.0.0.1:9';

/**
 * Room for what the CLI prints: a query's JSON for a large document runs to many megabytes, beyond
 * `spawnSync`'s default of one.
 */
const MAX_OUTPUT_BYTES = 1024 ** 3;

/** The status the program exits with when it rejects its arguments, such as an option's value. */
const USAGE_ERROR = 2;

/**
 * Runs `executable` with `args` in `cwd` and returns what it printed and its status. Arguments the
 * program rejects throw its reason, as the module throws for an invalid option.
 */
export function spawnCli(executable, args, cwd) {
	const run = spawnSync(executable, args, {
		cwd,
		encoding: 'utf8',
		maxBuffer: MAX_OUTPUT_BYTES,
		env: cliEnvironment(),
	});
	if (run.error) {
		throw new Error(`The typst CLI could not be run: ${run.error.message}`);
	}
	if (run.status === USAGE_ERROR) {
		throw new Error(/^error: (.*)$/m.exec(run.stderr)?.[1] ?? run.stderr.trim());
	}
	return run;
}

/**
 * The environment the CLI runs in: this process's, without what would make it differ from the
 * module (Typst's own variables and `SOURCE_DATE_EPOCH`, which fixes the creation date), offline,
 * and without colors in its diagnostics.
 */
function cliEnvironment() {
	const environment = Object.fromEntries(
		Object.entries(process.env).filter(
			([name]) => !name.startsWith('TYPST_') && name !== 'SOURCE_DATE_EPOCH',
		),
	);
	for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']) {
		environment[name] = NO_NETWORK;
		environment[name.toLowerCase()] = NO_NETWORK;
	}
	return { ...environment, NO_PROXY: '', no_proxy: '', NO_COLOR: '1' };
}
