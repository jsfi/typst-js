// A newspaper page. The page's slider sets the number of columns through sys.inputs; the text flows
// through them, and Typst places the floating figures: the lead picture and the pull quote across all
// columns, the small picture at the bottom of whichever column it falls into.

#let requested = sys.inputs.at("columns", default: "3")
#let column-count = if requested in ("1", "2", "3") { int(requested) } else { 3 }

/// A stand-in for a photograph: a gradient with a label, `height` tall.
#let picture(label, height, colors) = rect(
  width: 100%,
  height: height,
  fill: gradient.linear(..colors, angle: 30deg),
  align(bottom + left, text(8pt, fill: white, weight: "bold", label)),
)

#set document(title: [The Typesetter's Gazette])
#set text(lang: "en", size: 9pt)
#set par(justify: true, first-line-indent: (amount: 1em, all: false))
#set page(
  paper: "a4",
  margin: (x: 1.5cm, top: 1.5cm, bottom: 1.5cm),
  columns: column-count,
  footer: context {
    set text(7.5pt, fill: luma(110))
    grid(columns: (1fr, auto), [The Typesetter's Gazette · #column-count column#if column-count > 1 [s]],
      [Page #counter(page).display()])
  },
)
#set columns(gutter: 0.6cm)
#show heading.where(level: 1): it => align(center, text(30pt, weight: "bold", it.body))
#show heading.where(level: 2): set text(12pt)

#place(top, scope: "parent", float: true, {
  heading(level: 1, outlined: false)[The Typesetter's Gazette]
  v(-0.6em)
  line(length: 100%, stroke: 1.2pt)
  v(-0.5em)
  grid(columns: (1fr, auto, 1fr), text(8pt)[Vol. 1, No. 3], text(8pt)[Set entirely by the document],
    align(right, text(8pt)[Free]))
  v(-0.5em)
  line(length: 100%, stroke: 0.4pt)
})

#figure(
  picture([Composing room, 6 a.m.], 5.5cm, (rgb("#1e3a5f"), rgb("#4f6dd9"), rgb("#9fb6f0"))),
  placement: top,
  scope: "parent",
  caption: [The lead picture spans every column, whatever their number.],
  alt: "Lead picture: a blue gradient standing in for a photograph of a composing room.",
)

== Columns that follow the content

#lorem(110)

#lorem(90)

#figure(
  picture([Proof sheets], 3cm, (rgb("#7c2d12"), rgb("#ea580c"))),
  placement: bottom,
  caption: [This figure floats to the bottom of its column.],
  alt: "A small picture: an orange gradient standing in for a photograph of proof sheets.",
)

== Floats find their place

#lorem(120)

#place(bottom, scope: "parent", float: true, block(
  width: 100%,
  inset: (y: 0.6em),
  stroke: (top: 1pt, bottom: 1pt),
  align(center, text(15pt, style: "italic")[“Change the number of columns, and every float finds a new place.”]),
))

#lorem(100)

== A second story

#lorem(140)

#lorem(110)
