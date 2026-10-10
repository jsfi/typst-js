// Content and style apart. The release notes below are written once; the page's dropdown picks a
// theme through sys.inputs, and only the set and show rules of that theme change.

#let theme = sys.inputs.at("theme", default: "classic")

/// Numbers the sections, not the title: "1", "1.1" from the second heading level on.
#let section-numbering(..levels) = if levels.pos().len() > 1 { numbering("1.1", ..levels.pos().slice(1)) }

#let classic(body) = {
  set text(font: "Libertinus Serif", size: 10.5pt)
  set par(justify: true)
  set heading(numbering: section-numbering)
  show heading.where(level: 1): set align(center)
  show heading.where(level: 1): set text(size: 15pt)
  show raw.where(block: true): block.with(inset: (left: 1em))
  show quote: set text(style: "italic")
  set table(stroke: (x, y) => (top: if y <= 1 { 0.6pt } else { 0pt }, bottom: 0.6pt))
  body
}

#let modern(body) = {
  let accent = rgb("#0f766e")
  set text(font: "New Computer Modern", size: 10pt)
  show heading: set text(fill: accent)
  show heading.where(level: 1): it => block(below: 0.8em, text(size: 18pt, weight: "regular", it.body))
  show heading.where(level: 2): it => block(
    stroke: (left: 3pt + accent),
    inset: (left: 0.6em, y: 0.15em),
    above: 1.2em,
    it.body,
  )
  show raw.where(block: true): it => block(fill: rgb("#f0fdfa"), inset: 0.8em, radius: 0.4em, width: 100%, it)
  show quote: it => block(fill: rgb("#f0fdfa"), inset: 0.8em, radius: 0.4em, width: 100%, it.body)
  set table(stroke: none, fill: (x, y) => if y == 0 { accent.lighten(75%) } else if calc.even(y) { luma(245) })
  set list(marker: text(fill: accent)[▸])
  body
}

#let technical(body) = {
  set text(font: "DejaVu Sans Mono", size: 8.5pt)
  set par(leading: 0.7em)
  set heading(numbering: section-numbering)
  show heading: it => block(above: 1.2em, below: 0.6em, upper(it))
  show heading.where(level: 1): it => block(width: 100%, inset: 0.5em, stroke: 1pt, upper(it.body))
  show raw.where(block: true): it => block(stroke: (left: 2pt), inset: (left: 0.8em, y: 0.3em), it)
  show quote: it => block(inset: (left: 1em), [> #it.body])
  set table(stroke: 0.5pt)
  set list(marker: [-])
  body
}

#set document(title: [Release notes 3.2])
#set page(
  paper: "a5",
  margin: (x: 1.5cm, top: 1.8cm, bottom: 1.6cm),
  footer: context align(center, text(8pt, fill: luma(110))[Theme: #theme · page #counter(page).display()]),
)

#show: (classic: classic, modern: modern, technical: technical).at(theme, default: classic)

= Release notes 3.2

Version 3.2 makes exports faster and accessible by default, and replaces the old configuration format.

== Highlights

- PDF export writes object streams, which makes tagged documents several times smaller.
- Every export is tagged, so assistive technology can read headings and tables.
- Configuration moves from INI to TOML; old files are converted on first start.

== Performance

#table(
  columns: (1fr, auto, auto),
  align: (left, right, right),
  table.header[*Export*][*3.1*][*3.2*],
  [Report, 250 pages], [9.0 s], [7.4 s],
  [Tagged PDF size], [29.2 MB], [4.8 MB],
  [Recompile after an edit], [120 ms], [10 ms],
)

== Configuration

The new format groups settings by area:

```toml
[export]
tagged = true
standards = ["ua-1"]

[fonts]
paths = ["./fonts"]
```

#quote(block: true)[Content and style stay apart: this page changes theme without a single change to
its text.]

== Upgrading

Install 3.2 over 3.1. The first start converts the configuration and keeps a copy of the old file.
