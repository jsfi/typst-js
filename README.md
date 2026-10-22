# typst-js

[Typst](https://typst.app) is a markup-based typesetting system: a document is plain text with
markup for headings, emphasis and lists, plus a scripting language for everything else (styles,
tables, computed content). Typst compiles it to PDF, SVG or PNG in milliseconds rather than seconds.
It is open source, written in Rust, and a modern alternative to LaTeX.

- Website and online editor: <https://typst.app>
- Documentation and language reference: <https://typst.app/docs>
- Compiler source: <https://github.com/typst/typst>
- Package registry (Typst Universe): <https://typst.app/universe>

## Why this repository exists

Typst's own compiler is a Rust library and a command-line program. Neither can be called from
JavaScript. This repository provides three npm packages: two that let JavaScript run Typst, in Node
and in browsers, behind one API, and one that adds form fields to the PDFs they make:

| Package                                                 | What it is                                                                                                       | Runs in           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------- |
| [`@jsfi/typst-wasm`](packages/typst-wasm/README.md)     | The Typst compiler compiled to WebAssembly, with an in-memory file system. It never touches a network or a disk. | Node and browsers |
| [`@jsfi/typst-cli`](packages/typst-cli/README.md)       | The same API, running the official `typst` command-line program.                                                 | Node              |
| [`@jsfi/typst-fields`](packages/typst-fields/README.md) | Fillable, accessible form fields, added to the PDFs of either package after compiling.                           | Node and browsers |

`@jsfi/typst-fields` works on the PDFs of both: a Typst library marks boxes in the document, and the
package turns them into form fields of every kind PDF has, still passing PDF/UA-1.

Code written against `@jsfi/typst-wasm` runs on `@jsfi/typst-cli`, and back. Two things differ:
`init()` and `initSync()`, because one loads a module and the other finds a program, and fonts,
which the program embeds and the module leaves to `addFont`. Each package's README is its manual: a
first example, every option, and links to the examples.

### Which package to use

| Aspect                    | `@jsfi/typst-wasm`               | `@jsfi/typst-cli`                              |
| ------------------------- | -------------------------------- | ---------------------------------------------- |
| A large document          | Compiles on one thread           | Compiles on every core, several times faster   |
| Tagged PDFs               | With object streams: far smaller | Without them: Typst's own size                 |
| Recompiling after an edit | Reuses cached work: far faster   | Starts from scratch every time                 |
| Where it runs             | Node and browsers                | Node only                                      |
| Fonts                     | Added by the host with `addFont` | Typst's defaults built in, more with `addFont` |
| Installation              | The npm package alone            | The npm package and the `typst` program        |

Use `@jsfi/typst-wasm` in a browser, for a live preview, or wherever installing a program is not
possible. Use `@jsfi/typst-cli` for large documents on a server where the `typst` program is
available. Because the API is shared, switching later changes the import, the `init()` call and,
towards the module, adding fonts.

## Versions

The three packages are released together, at the same version, following semantic versioning: equal
versions of `@jsfi/typst-wasm` and `@jsfi/typst-cli` have the same API, and `@jsfi/typst-fields` of
that version works on their PDFs. This table pairs them with Typst.

| `@jsfi/typst-wasm` | `@jsfi/typst-cli` | `@jsfi/typst-fields` | Typst                      |
| ------------------ | ----------------- | -------------------- | -------------------------- |
| 0.1.x              | 0.1.x             | 0.1.x                | 0.15.1 bundled / CLI 0.15+ |

## Smaller PDFs: the krilla patch

Accessible PDFs are tagged: they carry a structure tree for assistive technology, one small PDF
object per heading, paragraph and table cell. Typst's PDF library, krilla, stores each of them on its
own. In a table-heavy document the tags then outweigh the content: the 100-page benchmark under
_Measurements_ is 10.3 MB tagged, 19 times its untagged size. At that price, accessibility is what
gets switched off.

`@jsfi/typst-wasm` therefore patches krilla to compress those objects together, which brings the
tagged benchmark down to 1.7 MB. `@jsfi/typst-cli` runs the official `typst`
program, which has no such patch, so its tagged PDFs keep their full size. What the patch changes,
and how, is in [CONTRIBUTING.md](CONTRIBUTING.md#the-object-stream-patch).

## Measurements

[`benchmarks/tables.typ`](benchmarks/tables.typ) is 100 pages of dense tables with synthetic data.
`npm run bench` ([`benchmarks/pdf.mjs`](benchmarks/pdf.mjs)) compiles it to PDF, tagged and untagged,
with each package and with the `typst` program on one thread, all with the fonts the module ships and
every run in a process of its own. Median of five runs on an Apple M2 Max, Node 24.21.0, typst 0.15.1:

|                              | Tagged | PDF      | Untagged | PDF     |
| ---------------------------- | ------ | -------- | -------- | ------- |
| `@jsfi/typst-wasm`           | 2.69 s | 1.68 MB  | 2.50 s   | 0.50 MB |
| `@jsfi/typst-cli`, all cores | 1.18 s | 10.30 MB | 1.08 s   | 0.55 MB |
| `typst compile --jobs 1`     | 1.49 s | 10.30 MB | 1.38 s   | 0.55 MB |

The module runs on one thread, so `typst compile --jobs 1` is the fair comparison of speed:
WebAssembly takes about 1.8 times as long. The times are the compilation alone; loading the module
comes before it, and the CLI package's include writing the project to disk and starting the program.
Only the module's PDFs are smaller, through the patch of _Smaller PDFs_, which puts the objects of an
untagged PDF into object streams as well. The numbers depend on the machine and its load; run the
benchmark to compare a change on yours.

## Examples

- [`examples/node.mjs`](examples/node.mjs) compiles a document in Node with `@jsfi/typst-wasm`, and
  [`examples/node-cli.mjs`](examples/node-cli.mjs) the same document with `@jsfi/typst-cli`. Both
  take their steps from [`examples/demo.mjs`](examples/demo.mjs), which has to lie beside them.
- [`examples/browser/`](examples/browser/README.md) is a page with a live preview whose service
  worker runs the module, with examples of what Typst can do.

## Contributing

How to build, test, format and release the packages is in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache License 2.0 ([`LICENSE`](LICENSE)). `@jsfi/typst-wasm` contains Typst and further crates under
their own permissive licenses, and the fonts it ships are under the licenses its `NOTICE` names; its
README names the files that list them.
