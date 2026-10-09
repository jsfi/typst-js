/**
 * What neither the formatter nor the linter looks at: installed and generated files, and the crates
 * vendored as their authors wrote them. Imported by `oxfmt.config.ts` and `oxlint.config.ts`.
 */
export const generatedPaths = ['**/node_modules/**', 'pkg/**', 'vendor/**', 'target/**'];
