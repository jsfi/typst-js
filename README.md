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
JavaScript. This repository provides two npm packages that let JavaScript run Typst, in Node and in
browsers, behind one API:

| Package                                             | What it is                                                                                                       | Runs in           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------- |
| [`@jsfi/typst-wasm`](packages/typst-wasm/README.md) | The Typst compiler compiled to WebAssembly, with an in-memory file system. It never touches a network or a disk. | Node and browsers |
| [`@jsfi/typst-cli`](packages/typst-cli/README.md)   | The same API, running the official `typst` command-line program.                                                 | Node              |

Code written against one package runs on the other. Two things differ: `init()` and `initSync()`,
because one loads a module and the other finds a program, and fonts, which the program embeds and
the module leaves to `addFont`. Each package's README is its manual: a first example, every option,
and links to the examples.

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

Both packages are released together, at the same version, following semantic versioning: equal
versions have the same API. This table pairs them with Typst.

| `@jsfi/typst-wasm` | `@jsfi/typst-cli` | Typst                      |
| ------------------ | ----------------- | -------------------------- |
| 0.1.x              | 0.1.x             | 0.15.1 bundled / CLI 0.15+ |

## Smaller PDFs: the krilla patch

Accessible PDFs are tagged: they carry a structure tree for assistive technology, one small PDF
object per heading, paragraph and table cell. Typst's PDF library, krilla, stores each of them on its
own. In a table-heavy document the tags then outweigh the content many times over. At that price,
accessibility is what gets switched off.

`@jsfi/typst-wasm` therefore patches krilla to compress those objects together. `@jsfi/typst-cli`
runs the official `typst` program, which has no such patch, so its tagged PDFs keep their full
size. What the patch changes, and how, is in [CONTRIBUTING.md](CONTRIBUTING.md#the-object-stream-patch).

## Examples

- [`examples/node.mjs`](examples/node.mjs) compiles a document in Node with `@jsfi/typst-wasm`, and
  [`examples/node-cli.mjs`](examples/node-cli.mjs) the same document with `@jsfi/typst-cli`. Both
  take their steps from [`examples/demo.mjs`](examples/demo.mjs), which has to lie beside them.
- [`examples/browser/`](examples/browser/README.md) is a page with a live preview whose service
  worker runs the module, with examples of what Typst can do.

## Contributing

How to build, test and format the packages is in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache License 2.0 ([`LICENSE`](LICENSE)). `@jsfi/typst-wasm` contains Typst and further crates under
their own permissive licenses, and the fonts it ships are under the licenses its `NOTICE` names; its
README names the files that list them.
