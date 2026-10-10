// A price list over several pages. The header carries forward the sum of all previous pages, the
// footer adds this page's entries to it. Every row leaves its price as metadata, and the header and
// footer sum the prices placed on the pages before (and including) their own.

#let seed = 2026
#let count = 150
// The page's slider sets it through sys.inputs; compiled without inputs, the list is set in 10 pt.
#let font-size = float(sys.inputs.at("font-size", default: "10")) * 1pt

#let names = (
  "USB-C cable, 2 m", "Mechanical keyboard", "27-inch monitor", "Laptop stand", "Webcam, 1080p",
  "Noise-cancelling headset", "Docking station", "Wireless mouse", "Portable SSD, 1 TB",
  "Ethernet switch, 8 ports", "HDMI adapter", "Desk lamp, LED", "Microphone arm", "Power strip, 6 sockets",
  "Laptop sleeve", "Cable organizer", "Ergonomic chair mat", "Graphics tablet", "Server rack shelf",
  "UPS, 1500 VA",
)

// A linear congruential generator: the same seed always gives the same list.
#let entries = {
  let state = seed
  let result = ()
  for number in range(1, count + 1) {
    state = calc.rem(state * 1103515245 + 12345, 2147483648)
    let name = names.at(calc.rem(calc.quo(state, 65536), names.len()))
    state = calc.rem(state * 1103515245 + 12345, 2147483648)
    let cents = 199 + calc.rem(calc.quo(state, 16), 59800)
    result.push((number: number, name: name, cents: cents))
  }
  result
}

/// Cents as "1,234.56".
#let money(cents) = {
  let units = str(calc.quo(cents, 100))
  let groups = ()
  while units.len() > 3 {
    groups.insert(0, units.slice(units.len() - 3))
    units = units.slice(0, units.len() - 3)
  }
  groups.insert(0, units)
  let rest = calc.rem(cents, 100)
  groups.join(",") + "." + (if rest < 10 { "0" } else { "" }) + str(rest)
}

/// The sum of the prices placed on pages up to `last`.
#let sum-through(last) = (
  query(<price>)
    .filter(price => price.location().page() <= last)
    .map(price => price.value)
    .sum(default: 0)
)

#set document(title: [Price list])
#set text(lang: "en", size: font-size)
#set page(
  paper: "a5",
  margin: (x: 1.5cm, top: 2.4cm, bottom: 2.2cm),
  header: context {
    set text(9pt)
    let current = here().page()
    grid(
      columns: (1fr, auto),
      text(fill: luma(110))[Price list · seed #seed],
      if current > 1 [Carried forward: *#money(sum-through(current - 1))*],
    )
    line(length: 100%, stroke: 0.4pt + luma(200))
  },
  footer: context {
    set text(9pt)
    let current = here().page()
    let last = counter(page).final().first()
    line(length: 100%, stroke: 0.4pt + luma(200))
    grid(
      columns: (1fr, auto),
      text(fill: luma(110))[Page #current of #last],
      [#if current == last [Total] else [Subtotal]: *#money(sum-through(current))*],
    )
  },
)

= Price list

#count entries with prices from a seeded generator; change `seed` above for another list.

#table(
  columns: (auto, 1fr, auto),
  align: (right, left, right),
  // In em, so that the rows shrink and grow with the font size.
  inset: (x: 0.5em, y: 0.4em),
  stroke: (x, y) => if y == 0 { (bottom: 0.6pt) } else { (bottom: 0.3pt + luma(220)) },
  table.header[*No.*][*Item*][*Price*],
  ..entries
    .map(entry => (
      str(entry.number),
      entry.name,
      [#money(entry.cents)#metadata(entry.cents)<price>],
    ))
    .flatten(),
)
