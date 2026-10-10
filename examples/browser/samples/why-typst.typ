#set document(title: [Why Typst])
#set text(lang: "en", size: 10pt)
#set page(
  paper: "a5",
  margin: (x: 1.5cm, top: 2cm, bottom: 1.8cm),
  header: context {
    set text(8pt, fill: luma(110))
    grid(columns: (1fr, auto), [Why Typst · documents from code], datetime.today().display())
    line(length: 100%, stroke: 0.4pt + luma(200))
  },
  footer: context {
    set text(8pt, fill: luma(110))
    align(center)[Page #counter(page).display() of #counter(page).final().first()]
  },
)
#set heading(numbering: "1.")
#show raw.where(block: true): set text(8pt)

#let bars(data, top: 1, unit: "", color: teal) = grid(
  columns: (3.4cm, 1fr),
  row-gutter: 0.35em,
  column-gutter: 0.5em,
  ..data
    .map(((label, value)) => (
      align(right, text(8pt, label)),
      box(width: 100%, {
        box(width: value / top * 75%, height: 0.75em, fill: color)
        h(0.4em)
        text(8pt)[#value #unit]
      }),
    ))
    .flatten(),
)

= Summary

Typst turns plain-text markup into PDF, SVG or PNG in one run. It runs natively, or as WebAssembly in
the browser and in Node.js on any system.

#figure(
  image("pipeline.svg", width: 70%, alt: "Diagram: main.typ and data.json flow into the compiler, which produces PDF, SVG and PNG."),
  caption: [From source and data to the output formats, an SVG image],
)

= One source, data included

Layout and data stay apart. The source reads JSON, CSV, YAML, TOML or XML, and a table follows the
rows it is given:

```typ
#let rows = json("data.json")
#table(columns: 3,
  table.header[*Name*][*Size*][*Changed*],
  ..rows.map(r => (r.name, r.size, r.changed)).flatten(),
)
```

Values from the data are content, never markup: a name containing `#` or `$` prints as written.

= Compared with other approaches

#text(9pt, table(
  columns: (2.6cm, 1fr, 1.5fr),
  align: left,
  table.header[*Approach*][*Brings along*][*Pages and layout*],
  [Rendering HTML in a headless browser], [A complete browser engine], [Print features depend on the engine's paged-media support],
  [Drawing through a low-level PDF API], [A library], [Positions, line and page breaks are application code],
  [Macro-based typesetting], [A large distribution], [Several runs to settle references],
  [Typst], [One compiler, also as WebAssembly], [Repeating table headers, page counters and references in one run],
))

#pagebreak(weak: true)

= Measured with this package

A 249-page report of dense tables, compiled to an untagged PDF on one machine:

#figure(
  bars(
    (([WebAssembly, one thread], 6.0), ([Native, one thread], 3.8), ([Native, all cores], 2.2)),
    top: 7,
    unit: "s",
  ),
  caption: [Compile time of the 249-page report],
  alt: "Bar chart of compile times for a 249-page report: 6.0 seconds as WebAssembly on one thread, 3.8 seconds natively on one thread, 2.2 seconds natively on all cores.",
)

#figure(
  bars(
    (([Untagged], 1.3), ([Tagged, object streams], 4.8)),
    top: 6,
    unit: "MB",
    color: rgb("#4f6dd9"),
  ),
  caption: [Size of the same report as PDF],
  alt: "Bar chart of the report's PDF size: 1.3 megabytes untagged, 4.8 megabytes tagged with object streams.",
)

The compiler remembers what it laid out and, after an edit, redoes only what the edit touched: this
document recompiles in a few milliseconds.

= Mathematics as text

Formulas are written in the same source:

#math.equation(
  block: true,
  alt: "x equals minus b plus or minus the square root of b squared minus 4 a c, over 2 a",
  $x = (-b plus.minus sqrt(b^2 - 4 a c)) / (2 a)$,
)

= Accessible and archivable

PDFs are tagged by default, so assistive technology reads headings, tables and their header cells.
The compiler checks PDF/UA-1 and PDF/A when asked, and fails with the place and a hint when a document
breaks a rule, such as an image without alt text. This document passes PDF/UA-1.

= Limits

- HTML export is still experimental in Typst 0.15.
- The ecosystem of packages and templates is younger than that of older systems.
- The WebAssembly compiler runs on one thread; natively, the compiler uses every core.
