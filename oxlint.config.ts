import { defineConfig } from 'oxlint';

import { generatedPaths } from './ignored.config.ts';

/**
 * Lint settings for the whole repository. Read by the `oxlint` binary and by editor integrations
 * that look for this file, and imported into the root `vite.config.ts` for `vp lint`. One
 * definition, both consumers.
 */
export default defineConfig({
	options: {
		typeAware: true,
		typeCheck: true,
	},
	plugins: ['unicorn', 'typescript', 'oxc'],
	ignorePatterns: generatedPaths,
});
