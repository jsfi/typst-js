// A report that keeps itself in order. The page's slider sets the font size through sys.inputs: the
// text reflows, the tables move to other pages, and the contents, the list of tables and every
// "Table 3 on page 4" follow on their own.

#let font-size = float(sys.inputs.at("font-size", default: "10")) * 1pt

#let topics = (
  (name: "Inventory", text: "Every service was listed with its owner, its dependencies and its data.", rows: (("Services", "41", "38"), ("Owners named", "29", "38"), ("Undocumented dependencies", "17", "2"))),
  (name: "Database", text: "The databases moved to a managed cluster with point-in-time recovery.", rows: (("Instances", "9", "3"), ("Recovery point (min)", "1440", "5"), ("Restore drill (h)", "6.5", "0.8"))),
  (name: "Storage", text: "Files moved to object storage with lifecycle rules for old versions.", rows: (("Volume (TB)", "62", "48"), ("Monthly growth (%)", "4.1", "2.3"), ("Copies", "1", "3"))),
  (name: "Network", text: "Internal traffic now stays in private networks with explicit rules.", rows: (("Open ports", "214", "19"), ("Median latency (ms)", "12.4", "3.1"), ("Rules reviewed", "0", "57"))),
  (name: "Authentication", text: "All services authenticate through one identity provider.", rows: (("Login systems", "6", "1"), ("Accounts without MFA", "143", "0"), ("Shared passwords", "22", "0"))),
  (name: "Monitoring", text: "Metrics, logs and traces share one pipeline and one retention policy.", rows: (("Dashboards", "88", "24"), ("Alerts per week", "310", "41"), ("Mean time to detect (min)", "47", "6"))),
)

#let table-label(i) = label("table-" + str(i))

/// "Table 2 on page 3": the reference and the page it landed on, both settled by Typst.
#let table-reference(i) = context {
  let target = table-label(i)
  [#ref(target) on page #locate(target).page()]
}

/// The text of content, for the outline the page reads.
#let plain(it) = if type(it) == str { it } else if it.has("text") { it.text } else if it.has("children") {
  it.children.map(plain).join()
} else if it.has("body") { plain(it.body) } else { " " }

#set document(title: [Platform migration report])
#set text(lang: "en", size: font-size)
#set par(justify: true)
#set heading(numbering: "1.")
#set page(
  paper: "a5",
  margin: (x: 1.5cm, top: 2cm, bottom: 1.8cm),
  header: context {
    set text(8pt, fill: luma(110))
    grid(columns: (1fr, auto), [Platform migration report], [Set in #font-size.pt() pt])
    line(length: 100%, stroke: 0.4pt + luma(200))
  },
  footer: context align(center, text(8pt, fill: luma(110))[
    Page #counter(page).display() of #counter(page).final().first()
  ]),
)

#align(center, text(16pt, weight: "bold")[Platform migration report])
#align(center, text(fill: luma(110))[A fictional example of a document that keeps itself in order])

#outline(title: [Contents], depth: 1)
#outline(title: [Tables], target: figure.where(kind: table))

// Text of different lengths before each table, so that the tables land at different places on
// their pages and change pages at different font sizes.
#let lengths = (70, 140, 95, 160, 110, 130)

#for (i, topic) in topics.enumerate(start: 1) [
  = #topic.name

  #topic.text#footnote[Measured over the four weeks before and after the move of #lower(topic.name).]
  The figures before and after the migration are in #table-reference(i).
  #if i > 1 [
    Compare #table-reference(i - 1) for the previous step, and #table-reference(1) for the
    inventory the migration started from.
  ]

  #lorem(lengths.at(i - 1))

  #figure(
    table(
      columns: (1fr, auto, auto),
      align: (left, right, right),
      table.header[*Measure*][*Before*][*After*],
      ..topic.rows.flatten(),
    ),
    caption: [#topic.name before and after the migration],
  ) #table-label(i)
]

= Summary

The migration covered #topics.len() areas, from #lower(topics.first().name) to #lower(topics.last().name).
Their figures are in #topics.enumerate(start: 1).map(((i, _)) => table-reference(i)).join([, ], last: [ and ]).

// The outline as data for the page around the document: every outlined heading with its number, title
// and page, which the page reads with `query("<outline-data>", { field: "value", one: true })`.
#context [#metadata(query(heading.where(outlined: true)).map(it => (
  level: it.level,
  number: if it.numbering == none { none } else { numbering(it.numbering, ..counter(heading).at(it.location())) },
  title: plain(it.body),
  page: it.location().page(),
)))<outline-data>]

