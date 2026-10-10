// One source, any citation style. The citations and the bibliography come from refs.bib, a second
// file of the project; the style comes from the page's dropdown through sys.inputs.

#let style = sys.inputs.at("style", default: "ieee")

#set document(title: [Six papers that shaped computing])
#set text(lang: "en", size: 10pt)
#set par(justify: true)
#set page(
  paper: "a5",
  margin: (x: 1.5cm, top: 2cm, bottom: 1.8cm),
  header: context {
    set text(8pt, fill: luma(110))
    grid(columns: (1fr, auto), [Six papers that shaped computing], [Citation style: #raw(style)])
    line(length: 100%, stroke: 0.4pt + luma(200))
  },
  footer: context align(center, text(8pt, fill: luma(110))[Page #counter(page).display()]),
)

= Six papers that shaped computing

Some ideas in computing can be traced to a single text. Asking whether machines can think, Turing
replaced the question with a game of imitation @turing1950. Two years earlier, Shannon had given
information a measure and shown how much of it a noisy channel can carry @shannon1948.

Programming as a discipline owes much to the late 1960s. #cite(<knuth1968>, form: "prose") treated
algorithms as objects of exact analysis, and Dijkstra argued that the unrestricted jump obscures the
flow of a program @dijkstra1968[p.~147].

Larger systems raised new questions. Brooks observed that adding people to a late software project makes
it later @brooks1975, and Lamport showed that the events of a distributed system can be ordered without
a common clock @lamport1978. Both remain standard reading @brooks1975 @lamport1978.

#bibliography("refs.bib", title: [References], style: style)
