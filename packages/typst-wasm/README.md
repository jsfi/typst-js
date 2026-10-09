# @jsfi/typst-wasm

The [Typst](https://typst.app) compiler compiled to WebAssembly, for Node and browsers. It compiles
Typst documents to PDF and SVG from an in-memory project: your code hands in every file, package and
font as bytes, and the module never touches a network or a disk.

## Getting started

```sh
npm install @jsfi/typst-wasm
```

This script compiles a one-line document to `hello.pdf` in Node (22.12 or newer). The package is an ES
module, so save it as `hello.mjs`, or set `"type": "module"` in your `package.json`:

```js
import { readFile, writeFile } from 'node:fs/promises';
import { Compiler, initSync } from '@jsfi/typst-wasm';
import { defaultFontUrls } from '@jsfi/typst-wasm/fonts';

// Load the module. initSync takes its bytes or a compiled WebAssembly.Module.
initSync({
	module: await readFile(new URL(import.meta.resolve('@jsfi/typst-wasm/typst_wasm_bg.wasm'))),
});

const compiler = new Compiler();

// The module has no fonts built in. Typst's default fonts ship with the package.
for (const url of defaultFontUrls) compiler.addFont(await readFile(url));

compiler.addFile('/main.typ', new TextEncoder().encode('= Hello, Typst!'));
compiler.setMain('/main.typ');

const { pdf, diagnostics } = compiler.compilePdf();
for (const { severity, message, path, line } of diagnostics) {
	const place = path === undefined ? '' : `${path}:${line}: `; // some have no place
	console.log(`${severity}: ${place}${message}`);
}
if (pdf) await writeFile('hello.pdf', pdf);
```

Images, data and included files are added with `addFile` like `main.typ`, under the path the document
uses for them: `addFile('/logo.png', await readFile('logo.png'))` for `#image("logo.png")`.

In a browser, `await init()` replaces `initSync`. It fetches `typst_wasm_bg.wasm` from beside the
bindings; Node's `fetch` cannot read files, so Node needs `initSync`. Fetch the fonts the same way:

```js
import init, { Compiler } from '@jsfi/typst-wasm';
import { defaultFontUrls } from '@jsfi/typst-wasm/fonts';

await init();
const compiler = new Compiler();
for (const url of defaultFontUrls) {
	compiler.addFont(new Uint8Array(await (await fetch(url)).arrayBuffer()));
}
// addFile, setMain and compilePdf as above
```

A compilation blocks its thread, so run the compiler in a Web Worker in the browser, or in a
`worker_thread` in Node, for anything larger than a page.

## Reference

### Loading the module

| Export                 | Description                                                                                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init(options?)`       | Default export. Loads the module asynchronously. Without arguments it fetches `typst_wasm_bg.wasm` relative to the bindings; `{ module_or_path }` takes a URL, a `Response`, bytes or a `WebAssembly.Module` instead. Nothing is fetched before the call. |
| `initSync({ module })` | Loads the module synchronously from its bytes or a compiled `WebAssembly.Module`. A server can compile the module once and hand it to each worker.                                                                                                        |
| `version()`            | The package's version, such as `"0.1.0"`.                                                                                                                                                                                                                 |

The package has five entry points: the bindings (`@jsfi/typst-wasm`, with their types), the module
file (`@jsfi/typst-wasm/typst_wasm_bg.wasm`), the fonts' URLs (`@jsfi/typst-wasm/fonts`), the font
files (`@jsfi/typst-wasm/fonts/<file>`) and `@jsfi/typst-wasm/package.json`. Importing the bindings
has no side effects. The module is 26.9 MB, 7.1 MB with brotli (0.1.0), built for compilation speed.

Load the module before anything else: until `init()` or `initSync()` has run, every other call,
`new Compiler()` and `version()` included, throws a `TypeError` from the bindings, such as "Cannot
read properties of undefined".

### TypeScript

The types come with the package. They name browser types (`WebAssembly`, `BufferSource`,
`RequestInfo`, `URL`), which the `dom` library declares, and `Symbol.dispose`, which `@types/node`
declares. In Node, install `@types/node` (`npm install -D @types/node`) and load it, as TypeScript 7
no longer does by default:

```json
{ "compilerOptions": { "lib": ["es2022", "dom"], "types": ["node"] } }
```

In a browser project without `@types/node`, add the `esnext.disposable` library instead. Without
these, `tsc` reports errors such as TS2550 in `typst_wasm.d.ts`.

### Compiler

`new Compiler()` creates a compiler with its own empty project and no fonts. Keep one `Compiler` per
document: it caches parsed sources and memoized layout, so recompiling after an edit is much cheaper
than the first run.

| Method                             | Description                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `addFile(path, data)`              | Adds or replaces a project file, such as `/main.typ` or `/images/logo.png`. Any file the document reads goes here.        |
| `removeFile(path)`                 | Removes a project file. Returns whether it existed.                                                                       |
| `setMain(path)`                    | Sets the project file compilation starts from.                                                                            |
| `addFont(data)`                    | Adds every face of a `.ttf`, `.otf` or `.ttc` file. Returns how many faces were added.                                    |
| `addPackageFile(spec, path, data)` | Adds one file of a package, such as `("@preview/cetz:0.4.2", "/src/lib.typ", …)`. Add the package's `typst.toml` as well. |
| `setInputs(inputs)`                | Sets `sys.inputs`, replacing earlier inputs. See _Inputs_.                                                                |
| `compilePdf(options?)`             | Compiles the main file to a PDF. See _PDF options_.                                                                       |
| `compileSvg(options?)`             | Compiles the main file to one SVG string per page. Takes `{ pages }` as in _PDF options_.                                 |
| `query(selector, options?)`        | Compiles the main file and returns the elements `selector` matches. See _Queries_.                                        |

Paths, package specifications and selectors must be strings, and file data a `Uint8Array`. Anything
else throws. Every option and error follows the typst CLI: the same names, values and reasons. An
option with an invalid value throws.

### PDF options

`compilePdf(options?: PdfOptions)`:

| Option         | Type                | Default         | CLI equivalent         |
| -------------- | ------------------- | --------------- | ---------------------- |
| `tagged`       | `boolean`           | `true`          | `--no-pdf-tags`        |
| `timestamp`    | `Date` or ms        | now, local time | `--creation-timestamp` |
| `pdfStandards` | `string[]`          | none            | `--pdf-standard`       |
| `pages`        | `string`, `"2,4-6"` | all pages       | `--pages`              |

- **`tagged`** writes the structure tree that accessibility tools read. A PDF offered for download
  generally needs it. `tagged: false` leaves it out, which makes output smaller and faster to export
  when nobody reads it with assistive technology. Tagged PDFs from this package are far smaller than
  Typst's own; see
  [Smaller PDFs](https://github.com/jsfi/typst-js#smaller-pdfs-the-krilla-patch).
- **`timestamp`** is the PDF's creation and modification date, written in UTC. It is also what
  `datetime.today()` returns during the compilation.
- **`pdfStandards`** takes the CLI's names: `"1.4"` to `"2.0"`, `"a-1b"` to `"a-4e"`, `"ua-1"`. Typst
  checks the document against them and fails with errors such as "PDF/UA-1 error: missing alt text".
  An impossible combination is one error without a location.
- **`pages`** exports a selection, such as `"2,5"`, `"3-6"` or `"8-"`. Typst cannot tag a selection,
  so it is exported untagged, with a warning unless `tagged: false` is given. The standards that
  require tags (`a-1a`, `a-2a`, `a-3a`, `ua-1`) refuse it.

### Results

`compilePdf()` and `compileSvg()` return a `CompileResult`:

| Property      | Type                      | Description                                                                     |
| ------------- | ------------------------- | ------------------------------------------------------------------------------- |
| `pdf`         | `Uint8Array \| undefined` | The PDF, when compilation succeeded. It owns its buffer and can be transferred. |
| `svg`         | `string[] \| undefined`   | One SVG per page, when compilation succeeded.                                   |
| `diagnostics` | `Diagnostic[]`            | Every warning and error, whether compilation succeeded or not.                  |

Each `Diagnostic` has `severity` (`"error"` or `"warning"`), `message`, `hints`, and, where it has a
location, `path` (package files are prefixed with their spec), `start` and `end` as byte offsets, and
1-based `line` and `column`.

### Inputs

`setInputs({ key: "value", … })` sets what the document reads as `sys.inputs`. Values are strings, as
on the command line. Keys and values are trimmed like `--input key=value`. A key must not be empty or
contain `=`, and neither may contain a NUL character. Pass larger data as a file instead:
`addFile("/data.json", …)` and `json("data.json")` in the document.

### Queries

`query(selector, options?: { field?: string; one?: boolean })` compiles the document and returns the
matched elements as JSON values in a `QueryResult` (`value`, `diagnostics`). `value` is `undefined`
on failure.

- `selector` is any Typst selector: `"heading"`, `"<label>"`, `"figure.where(kind: table)"`. It is
  evaluated like `typst eval 'query(<selector>)' --in main.typ`, so a selector's errors point into
  `/<input-expression>`.
- `field` returns that field of every element, leaving out elements without it.
- `one` expects exactly one element and returns it instead of an array.

### Fonts

The module carries no fonts. Typst's defaults are in the package's `fonts/` directory: Libertinus
Serif, New Computer Modern with its math font, and DejaVu Sans Mono. `@jsfi/typst-wasm/fonts`
exports `defaultFontUrls`, their URLs, to read in Node or fetch in a browser; `fonts/index.json`
lists their file names. Keeping them out of the module saves about 10 MB of download, lets a browser
cache them separately, and lets you load only the fonts a document uses, or your own. Without any
font the compiler still compiles, but renders no text and reports a warning.

### Packages

Packages are not downloaded. Fetch `@preview` packages yourself, for example the archives at
`https://packages.typst.org/preview/<name>-<version>.tar.gz`, unpack them (they are gzipped tar
files), and add each file with `addPackageFile`, its path relative to the archive's root. A package that was not added is reported as not found.

### Limits

- Instantiating WebAssembly in a page needs `'wasm-unsafe-eval'` in its `script-src` Content Security
  Policy.
- Terminating a worker mid-compilation stops the compilation and frees its memory.
- Typst numbers every distinct file path it sees with a 16-bit counter that lives as long as the
  module instance. One instance therefore handles about 65,000 distinct paths in its life; the next
  one aborts the instance. Paths that recur (`/main.typ` on every compilation) count once. Replace a
  long-lived instance that sees ever new file names now and then, as a worker per job does.
- Reading a directory fails with "failed to load file (is a directory)", as on the CLI.

## License

Apache License 2.0 (`LICENSE`). The module contains Typst and further crates under their own
permissive licenses (`THIRD_PARTY_LICENSES.md`) and the notices they require (`NOTICE`). The fonts in
`fonts/` are under the licenses `NOTICE` names for them.
