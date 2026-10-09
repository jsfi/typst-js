import { defineConfig } from 'oxfmt';

import { generatedPaths } from './ignored.config.ts';

/**
 * Formatter settings for the whole repository. Read by the `oxfmt` binary and by editor
 * integrations that look for this file, and imported into the root `vite.config.ts` for `vp fmt`.
 * One definition, both consumers.
 */
export default defineConfig({
	ignorePatterns: [
		...generatedPaths,
		// A Handlebars template for cargo-about, which oxfmt cannot parse.
		'about.hbs',
	],
	bracketSameLine: true,
	jsdoc: true,
	singleQuote: true,
	sortImports: true,
	useTabs: true,
});
