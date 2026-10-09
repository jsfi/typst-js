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
JavaScript. This repository provides an npm package that lets JavaScript run Typst, in Node and in
browsers:

| Package                                             | What it is                                                                                                       | Runs in           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------- |
| [`@jsfi/typst-wasm`](packages/typst-wasm/README.md) | The Typst compiler compiled to WebAssembly, with an in-memory file system. It never touches a network or a disk. | Node and browsers |

Its README is its manual: a first example and every option.

## Versions

The package follows semantic versioning. This table pairs its versions with Typst.

| `@jsfi/typst-wasm` | Typst  |
| ------------------ | ------ |
| 0.1.x              | 0.15.1 |

## Contributing

How to build and format the package is in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache License 2.0 ([`LICENSE`](LICENSE)). `@jsfi/typst-wasm` contains Typst and further crates under
their own permissive licenses, and the fonts it ships are under the licenses its `NOTICE` names; its
README names the files that list them.
