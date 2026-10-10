// The benchmark document: 100 pages of dense tables, one section per page, with synthetic data that
// Typst computes itself, so the document is the same everywhere. Tables are what tags make large: every
// cell is a structure element of its own in a tagged PDF. `benchmarks/pdf.mjs` compiles it; any typst
// program can as well.

#let pages = 100
#let rows-per-page = 60

#let regions = ("North", "East", "South", "West", "Central", "Coast", "Highlands", "Valley")
#let products = ("Anchor", "Beacon", "Cinder", "Delta", "Ember", "Falcon", "Granite", "Harbor", "Iris", "Juniper", "Kestrel", "Lumen")
#let grades = ("A", "B", "C", "D")

/// A number below `modulus` from `seed` that looks random: a quadratic modulo a prime, the same
/// everywhere.
#let pick(seed, modulus) = calc.rem(calc.rem(seed * seed * 7919 + seed * 104729 + 1299709, 1000003), modulus)

/// One row of the table on `page`: an id, a product, a region, a date, two amounts, a share and a grade.
#let row(page, index) = {
  let seed = page * rows-per-page + index
  let units = pick(seed, 9000) + 100
  let price = pick(seed + 17, 50000) / 100 + 1
  (
    [#page.#index],
    products.at(pick(seed, products.len())),
    regions.at(pick(seed + 3, regions.len())),
    "2026-" + str(pick(seed + 11, 12) + 101).slice(1),
    str(units),
    str(calc.round(price, digits: 2)),
    [#calc.round(units * price / 1000, digits: 1) k],
    grades.at(pick(seed + 5, grades.len())),
  )
}

#set document(title: [Benchmark: dense tables])
#set page(paper: "a4", margin: 1.5cm)
#set text(font: "Libertinus Serif", size: 8pt, lang: "en")
#set table(stroke: 0.4pt + luma(160), inset: (x: 4pt, y: 3pt))

#for page in range(1, pages + 1) {
  heading[Section #page: #regions.at(calc.rem(page, regions.len()))]
  table(
    columns: (auto, 1fr, 1fr, auto, auto, auto, auto, auto),
    align: (left, left, left, left, right, right, right, center),
    table.header([*Id*], [*Product*], [*Region*], [*Month*], [*Units*], [*Price*], [*Revenue*], [*Grade*]),
    ..range(1, rows-per-page + 1).map(index => row(page, index)).flatten(),
  )
  if page < pages { pagebreak() }
}

// The page count, for `benchmarks/pdf.mjs` to check that the document keeps its 100 pages.
#context [#metadata(counter(page).final().first()) <page-count>]
