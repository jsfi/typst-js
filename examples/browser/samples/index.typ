// A back-of-book index, built by the document. `term` marks a word where the text discusses it; the
// index at the end collects every mark with its page, sorts the terms, merges consecutive pages into
// ranges and links each page number to its place. The page's slider sets the font size through
// sys.inputs, so the text reflows and the index follows.

#let font-size = float(sys.inputs.at("font-size", default: "10")) * 1pt

/// Shows `body` (or the term itself) and marks the term for the index on this page; the index files it
/// in lower case, so that "Latency" at the start of a sentence and "latency" are one entry.
#let term(name, body: none) = [#if body == none { name } else { body }#metadata(lower(name))<index-term>]

/// Pages as "2, 4–6, 9", each linked to the first mark on it.
#let page-list(marks) = {
  let pages = ()
  for mark in marks {
    let page = mark.location().page()
    if pages.len() == 0 or pages.last().page != page { pages.push((page: page, location: mark.location())) }
  }
  let ranges = ()
  for entry in pages {
    if ranges.len() > 0 and ranges.last().last.page + 1 == entry.page {
      ranges.last().last = entry
    } else {
      ranges.push((first: entry, last: entry))
    }
  }
  ranges
    .map(range => {
      let first = link(range.first.location, str(range.first.page))
      if range.first.page == range.last.page { first } else [#first–#link(range.last.location, str(range.last.page))]
    })
    .join([, ])
}

#let index() = context {
  let marks = query(<index-term>)
  let terms = marks.map(mark => mark.value).dedup().sorted(key: name => lower(name))
  let letters = terms.map(name => upper(name.first())).dedup()
  columns(2, gutter: 1.2em, for letter in letters {
    block(above: 0.9em, below: 0.4em, text(weight: "bold", letter))
    for name in terms.filter(name => upper(name.first()) == letter) {
      block(spacing: 0.35em, [#name #h(0.3em) #page-list(marks.filter(mark => mark.value == name))])
    }
  })
}

#set document(title: [A short guide to distributed systems])
#set text(lang: "en", size: font-size)
#set par(justify: true)
#set heading(numbering: "1.")
#set page(
  paper: "a5",
  margin: (x: 1.5cm, top: 2cm, bottom: 1.8cm),
  header: context {
    set text(8pt, fill: luma(110))
    grid(columns: (1fr, auto), [A short guide to distributed systems], [Set in #font-size.pt() pt])
    line(length: 100%, stroke: 0.4pt + luma(200))
  },
  footer: context align(center, text(8pt, fill: luma(110))[Page #counter(page).display()]),
)

#align(center, text(16pt, weight: "bold")[A short guide to distributed systems])

= Time and order

Machines in a #term("distributed system") share no clock. #term("Latency") between them varies, so the
order in which messages arrive says little about the order in which they were sent. A
#term("logical clock") orders events by cause instead of by time: every message carries a counter, and
a receiver advances its own counter past the one it receives.

#lorem(120)

= Replication <replication>

#term("Replication") keeps copies of data on several machines, so that a failed machine does not lose
it. The copies have to agree: a #term("leader") accepts writes and passes them on, or a #term("quorum")
of replicas has to confirm each write before it counts. Replication raises #term("throughput") for reads
but adds #term("latency", body: "latency") to writes.

#lorem(140)

= Consistency <consistency>

#term("Consistency") describes what a reader may see. Strong consistency hides replication completely;
#term("eventual consistency") only promises that replicas converge once writes stop. A #term("quorum")
of reads and writes that overlap gives strong consistency at the price of #term("latency", body:
"latency"), as in @replication.

#lorem(130)

= Failures

A #term("timeout") is the only way to notice that a machine stopped answering, and it cannot tell a
slow machine from a failed one. A #term("retry") after a timeout may repeat an operation that already
succeeded, which is harmless only for an #term("idempotent operation"). A #term("leader") that seems
failed may still be working, which a new #term("leader") has to rule out before it accepts writes.

#lorem(150)

= Load

#term("Load balancing") spreads requests over machines; #term("caching") answers repeated requests
without reaching them at all. Both raise #term("throughput"), and caching lowers
#term("latency", body: "latency") for whatever it holds. A cache, too, is a copy of data, so the
questions of @consistency return.

#lorem(120)

= Summary

A #term("distributed system") trades the certainty of one machine for capacity and resilience. A
#term("logical clock") restores order, #term("replication") and #term("quorum", body: "quorums") keep
data, and #term("timeout", body: "timeouts") and #term("retry", body: "retries") cope with failures.

#pagebreak(weak: true)
#heading(numbering: none)[Index]
#index()
