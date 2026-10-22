# Typst in a service worker

`index.html` edits a Typst source with a live SVG preview and downloads it as SVG, or as a PDF that is
tagged or not as its checkbox says. It offers the examples in `samples/`, each showing a feature of
Typst, and one a form whose PDF has fillable fields, made by
[`@jsfi/typst-fields`](../../packages/typst-fields/README.md).

| File                 | What it does                                                        |
| -------------------- | ------------------------------------------------------------------- |
| `index.html`         | The page: the editor, the controls, the preview and the downloads   |
| `page.js`            | Runs the page: loading an example, the preview and the downloads    |
| `examples.js`        | Lists the examples with their controls                              |
| `controls.js`        | Builds the controls and reads their values                          |
| `diagnostic-list.js` | Lists the diagnostics, each jumping to its place in the source      |
| `outline.js`         | Lists the report's outline beside the preview                       |
| `jump.js`            | The buttons in the diagnostics and the outline that jump to a place |
| `registration.js`    | Registers the service worker and waits until it controls the page   |
| `protocol.js`        | Defines the requests and answers between the page and the worker    |
| `service-worker.js`  | Compiles with the module, which it caches with the fonts and assets |
| `style.css`          | Styles the page                                                     |
| `serve.mjs`          | Serves the page, `pkg/` and `@jsfi/typst-fields` on localhost       |
| `samples/`           | The examples' Typst sources, and the bibliography `citations` cites |
| `pipeline.svg`       | The image `why-typst` shows, added to the compiler's project        |
| `examples.test.mjs`  | Checks that `samples/`, `examples.js` and the table below agree     |

The controls above the editor belong to the selected example and do not change its source: they set
`sys.inputs`, which the source reads (the page sends `inputs`, the worker calls `setInputs`), and every
change recompiles the same source.

| Example      | Shows                                                                       | Controls       |
| ------------ | --------------------------------------------------------------------------- | -------------- |
| `why-typst`  | Two pages with header, footer, an SVG image, tables, charts and a formula   | none           |
| `price-list` | Running subtotals in header and footer, from metadata on every row          | font size      |
| `citations`  | One paper in any citation style, from `refs.bib`                            | citation style |
| `report`     | Contents and page references that follow a reflow; an outline via `query()` | font size      |
| `index`      | A back-of-book index with page ranges, rebuilt as the text reflows          | font size      |
| `languages`  | Quotation marks, hyphenation and names that follow the language             | language       |
| `newspaper`  | Columns with floating figures placed across or inside them                  | columns        |
| `themes`     | One text in three looks, only `set` and `show` rules differ                 | theme          |
| `form`       | Form fields of every kind and feature, with values in Latin and Arabic      | values         |
| `calendar`   | A year with ISO weeks and localized names, computed by the document         | year, language |

The documents pass PDF/UA-1 with tagging on. `pipeline.svg` and `samples/refs.bib` are files of the
compiler's project, which the worker adds with `addFile`.

```sh
./build.sh        # at the repository root, builds pkg/
npm run example   # serves the example and pkg/ with examples/browser/serve.mjs
```

Then open <http://localhost:8000/examples/browser/> (`node examples/browser/serve.mjs 8080` for another
port). `?example=` with an example's name from the table opens it directly, such as
`?example=calendar`; the address follows the selection, so it can be shared as it is.

Service workers run only over HTTPS or on `localhost`, which the server binds to. The first visit
downloads the module (the page shows its size) and the fonts into the worker's cache, which takes a moment; later visits
load them from the cache instead of the network.

## How it works

- **Install:** the worker puts the module and Typst's default fonts into Cache Storage, then takes
  control of the page at once (`skipWaiting`, `clients.claim`), which the page waits for on its first
  visit. When a later visit finds changed files, a new worker installs and takes over, and the page
  reloads once, so that it compiles with the new code rather than the worker that served it.
  Browsers look for changes in a module worker's own script only, not in the modules it imports, so
  `serve.mjs` ends the worker's script with a fingerprint of the code it imports: each file's name,
  size and time of change. A static host needs such a version in the worker's script, too.
- **Compile:** the page posts a request to `compile`: the source, the format, whether to tag a PDF
  and the controls' values for `sys.inputs`. The worker answers with the PDF, the SVG pages, or the
  diagnostics of a source with errors. `protocol.js` defines the requests and answers for both sides.
- **Files besides the source:** the worker caches `pipeline.svg` with the fonts and adds it to the
  compiler's project as `/pipeline.svg`, which the document reads with `image("pipeline.svg")`. Any
  image, data or source file reaches a document this way, through `addFile`.
- **Form fields:** the worker adds the Typst library of `@jsfi/typst-fields` to the project as
  `/fields.typ`, which `form` imports, and passes the form's PDF through `addFieldsAsync` before it
  answers, with the browser's `DecompressionStream` and `CompressionStream` as `inflate` and
  `deflate`. The preview, an SVG, shows the boxes and the values Typst set in them; the downloaded
  PDF has fields over them. As the preview has no fields, the worker sets the input `previewInput`
  names for it, and the library draws the ticks, dots and highlights the fields would. A refusal,
  such as of a value in an untagged PDF, shows as an error among the diagnostics.
- **Diagnostics:** the worker passes each diagnostic's file, byte range, line and column on. One that
  points into the edited source is a button: clicking it selects the faulty span in the editor, the
  page converting the UTF-8 byte offsets into the editor's UTF-16 positions.
- **Outline:** for the report, the page posts a query for `<outline-data>`; the worker answers with
  the value of `compiler.query()`, metadata the document fills with its headings,
  numbers and pages, and the page lists them beside the preview, each entry scrolling to its page.
- **One compiler per worker:** it is set up on the first request and kept, so a recompile after an edit
  reuses what Typst already laid out. The browser may stop an idle worker; the next request sets the
  compiler up again from the cache.

## Limits

- **Firefox** does not support service workers that are ES modules (`type: "module"`), which the
  bindings are; Chromium-based browsers and Safari do. A dedicated `Worker` with `type: "module"` works
  in every current browser, including Firefox, if the cache and the fetch interface are not needed.
- **A compile blocks the worker.** While it runs, every other request in the worker's scope waits, so
  the scope is this directory only.
- **The PDF is copied** out of WebAssembly memory once per compile; the module's memory only grows and
  is returned when the browser stops the worker.
