# @jsfi/typst-cli

The API of [`@jsfi/typst-wasm`](https://github.com/jsfi/typst-js/tree/main/packages/typst-wasm#readme)
on top of the official [`typst`](https://github.com/typst/typst) command-line program, for Node. Code
written against one package runs on the other. `init()` and `initSync()` differ, because this
package finds a program instead of loading a module, and so do fonts: the program brings Typst's
defaults, which the module leaves to `addFont` (see _Differences from @jsfi/typst-wasm_).

The [repository's README](https://github.com/jsfi/typst-js#which-package-to-use) compares the two
packages. In short: this one compiles large documents on every core, but starts from scratch on each
call and writes larger tagged PDFs.

## Getting started

Install the package, and the `typst` program in a version the
[version table](https://github.com/jsfi/typst-js#versions) names; Typst's
[installation instructions](https://github.com/typst/typst#installation) list its packages and
releases:

```sh
npm install @jsfi/typst-cli
typst --version   # 0.15 or newer, on the PATH or anywhere else
```

This script compiles a one-line document to `hello.pdf` in Node (22.12 or newer). The package is an ES
module, so save it as `hello.mjs`, or set `"type": "module"` in your `package.json`:

```js
import { writeFile } from 'node:fs/promises';
import init, { Compiler } from '@jsfi/typst-cli';

const { version } = await init(); // finds `typst` on the PATH and checks its version
console.log(`typst ${version}`);

const compiler = new Compiler(); // with Typst's default fonts, which the program embeds
compiler.addFile('/main.typ', new TextEncoder().encode('= Hello, Typst!'));
compiler.setMain('/main.typ');

const { pdf, diagnostics } = compiler.compilePdf();
for (const { severity, message, path, line } of diagnostics) {
	const place = path === undefined ? '' : `${path}:${line}: `; // some have no place
	console.log(`${severity}: ${place}${message}`);
}
if (pdf) await writeFile('hello.pdf', pdf);
```

The program's embedded fonts are Typst's defaults: Libertinus Serif, New Computer Modern with its
math font, and DejaVu Sans Mono. Further fonts are added with `addFont`; the fonts installed on the
system are never used, so a document comes out the same on every machine.

## Reference

### init()

```ts
init(options?: InitOptions): Promise<{ path: string; version: string }>
initSync(options?: InitOptions): { path: string; version: string }
```

| Option                | Type      | Default             | Description                                                                                                |
| --------------------- | --------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `typstPath`           | `string`  | `typst` on the PATH | The typst executable to run, a command name or a path.                                                     |
| `ignoreEmbeddedFonts` | `boolean` | `false`             | Leaves out the program's embedded fonts, so that only fonts given to `addFont` are used, as in the module. |

Both run the program to read its version, and throw if it cannot be run or is older than 0.15, the
Typst version the module bundles. The program then serves every `Compiler` created afterwards; a
`Compiler` created before keeps its own. They return the program's absolute `path`, as found on the
`PATH` or resolved from `typstPath`, and its `version`, such as `"0.15.1"`.

`version()` returns this package's version.

### TypeScript

The types come with the package. They name `Symbol.dispose`, which `@types/node` declares; install
it (`npm install -D @types/node`) and load it, as TypeScript 7 no longer does by default:

```json
{ "compilerOptions": { "lib": ["es2022"], "types": ["node"] } }
```

Without it, `tsc` reports TS2550 in `index.d.ts`, and the getting-started script's `node:fs/promises`
and `console` are unknown.

### Compiler, options and results

Everything after `init()` is `@jsfi/typst-wasm`'s API, with the same names, options, results and
errors. Its README is the reference:

- [Compiler](https://github.com/jsfi/typst-js/tree/main/packages/typst-wasm#compiler): `addFile`,
  `removeFile`, `setMain`, `addFont`, `addPackageFile`, `setInputs`, `compilePdf`, `compileSvg`,
  `query`
- [PDF options](https://github.com/jsfi/typst-js/tree/main/packages/typst-wasm#pdf-options):
  `tagged`, `timestamp`, `pdfStandards`, `pages`
- [Results](https://github.com/jsfi/typst-js/tree/main/packages/typst-wasm#results),
  [Inputs](https://github.com/jsfi/typst-js/tree/main/packages/typst-wasm#inputs),
  [Queries](https://github.com/jsfi/typst-js/tree/main/packages/typst-wasm#queries) and
  [Packages](https://github.com/jsfi/typst-js/tree/main/packages/typst-wasm#packages)

The two packages cannot drift apart: this package's type declarations are generated from the
module's, and its tests run every call on both packages and compare results and errors. How is in
[CONTRIBUTING.md](https://github.com/jsfi/typst-js/blob/main/CONTRIBUTING.md#one-api-for-both-packages).

### How it runs the program

A compiler keeps the project in memory, like the module. For each call it writes the project to a new
temporary directory, runs `typst compile` (or `typst eval` for a query) there, and reads back the
output and the diagnostics. The call waits for the program and blocks its thread until it finishes,
so a server that has to stay responsive runs the compiler in a `worker_thread`. It passes `--no-pdf-tags` explicitly for a page selection, so that both
packages warn and refuse alike. The program runs offline with a package cache of its own: a package that was not added with
`addPackageFile` is not found, as in the module.

### Differences from @jsfi/typst-wasm

For valid arguments the results are the same, with three exceptions that come from the program's
fonts, the file system and the program's output. Invalid arguments throw in both packages, but with
reasons of their own:

- **Fonts.** The program embeds Typst's default fonts, which the module leaves to `addFont`. So a
  compiler without any added font still renders text, and gives no warning that no fonts are loaded.
  `init({ ignoreEmbeddedFonts: true })` makes it behave as the module does, except that the warning's
  hint suggests calling `init()` without that option.

- **File names.** Each compilation writes the project to disk, and a file system cannot hold every
  set of names memory can. A file that would also have to be a directory (`/a` beside `/a/b.txt`), a
  file at the root `/` itself and names that are too long make the compilation throw, with the
  reason, where the module compiles. Of two names the file system does not tell apart (`/A.txt` and
  `/a.txt` where case is ignored, as on macOS and Windows by default; two Unicode spellings of
  `/é.txt`), the one written last is kept, and a document that reads `/X.TXT` finds an added
  `/x.txt`, where the module reports the file as not found.
- **Empty spans.** An error with an empty span that Typst's parser did not report, such as one in a
  malformed CSV file, comes back one character long, as the program draws it.

The errors for invalid arguments differ in what they say and in when they come:

- A value of the wrong type throws at once, as in the module.
- A value the program rejects, such as `pages: '0'` or an input key that is blank, throws when the
  compiler runs the program, with the program's reason, which names its flag:
  `invalid value '0' for '--pages <PAGES>': page numbers start at one`.
- `addFont` counts the faces a font file's header names, so it may count a damaged face that the
  module rejects and the program leaves out.

## Examples

- [`examples/node-cli.mjs`](https://github.com/jsfi/typst-js/blob/main/examples/node-cli.mjs)
  compiles a document with an included chapter to PDF and SVG with this package, recompiles after an
  edit, and prints diagnostics. The steps are in
  [`examples/demo.mjs`](https://github.com/jsfi/typst-js/blob/main/examples/demo.mjs), which has to
  lie beside it.
- [`examples/browser/`](https://github.com/jsfi/typst-js/tree/main/examples/browser#readme) shows
  what Typst can do, with nine example documents in `samples/`. The page itself needs
  `@jsfi/typst-wasm`, since this package runs only in Node.

## License

Apache License 2.0.
