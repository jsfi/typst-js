// A year's calendar, computed by the document itself: weekdays, ISO week numbers and month lengths
// come from Typst's dates, the names from the language table below. The page's year field and
// language dropdown set `year` and `lang` through sys.inputs.

#let requested-year = sys.inputs.at("year", default: "")
#let year = if requested-year.match(regex("^\d{1,4}$")) != none {
  calc.clamp(int(requested-year), 1600, 2400)
} else {
  datetime.today().year()
}

#let tables = (
  en: (title: "Calendar", week: "Wk", days: ("Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"),
    months: ("January", "February", "March", "April", "May", "June", "July", "August", "September",
      "October", "November", "December")),
  de: (title: "Kalender", week: "KW", days: ("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"),
    months: ("Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September",
      "Oktober", "November", "Dezember")),
  fr: (title: "Calendrier", week: "Sem.", days: ("lu", "ma", "me", "je", "ve", "sa", "di"),
    months: ("janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre",
      "octobre", "novembre", "décembre")),
  es: (title: "Calendario", week: "Sem.", days: ("lu", "ma", "mi", "ju", "vi", "sá", "do"),
    months: ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
      "octubre", "noviembre", "diciembre")),
  it: (title: "Calendario", week: "Sett.", days: ("lu", "ma", "me", "gi", "ve", "sa", "do"),
    months: ("gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto",
      "settembre", "ottobre", "novembre", "dicembre")),
  nl: (title: "Kalender", week: "Wk", days: ("ma", "di", "wo", "do", "vr", "za", "zo"),
    months: ("januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september",
      "oktober", "november", "december")),
)
#let requested-lang = sys.inputs.at("lang", default: "en")
#let lang = if requested-lang in tables { requested-lang } else { "en" }
#let names = tables.at(lang)

// ISO 8601 weeks: a week belongs to the year that holds its Thursday.
#let weekday-of-new-year(y) = calc.rem(y + calc.quo(y, 4) - calc.quo(y, 100) + calc.quo(y, 400), 7)
#let weeks-in(y) = if weekday-of-new-year(y) == 4 or weekday-of-new-year(y - 1) == 3 { 53 } else { 52 }
#let iso-week(date) = {
  let week = calc.quo(date.ordinal() - date.weekday() + 10, 7)
  if week < 1 { weeks-in(date.year() - 1) } else if week > weeks-in(date.year()) { 1 } else { week }
}

#let days-in(y, m) = {
  let first = datetime(year: y, month: m, day: 1)
  let next = if m == 12 { datetime(year: y + 1, month: 1, day: 1) } else { datetime(year: y, month: m + 1, day: 1) }
  int((next - first).days())
}

#let today = datetime.today()
#let shade = luma(235)
#let accent = rgb("#0f766e")

#let month(m) = {
  let first = datetime(year: year, month: m, day: 1)
  let offset = first.weekday() - 1
  let length = days-in(year, m)
  let weeks = calc.ceil((offset + length) / 7)
  let cells = ()
  for w in range(weeks) {
    let days = range(7).map(d => w * 7 + d - offset + 1)
    let present = days.filter(day => day >= 1 and day <= length)
    cells.push(text(fill: luma(120), str(iso-week(datetime(year: year, month: m, day: present.first())))))
    for (d, day) in days.enumerate() {
      let content = if day >= 1 and day <= length { str(day) } else { [] }
      let is-today = today.year() == year and today.month() == m and today.day() == day
      cells.push(if is-today { box(fill: accent, inset: (x: 0.2em, y: 0.1em), radius: 0.2em, text(fill: white, weight: "bold", content)) } else { content })
    }
  }
  block(breakable: false, {
    text(weight: "bold", size: 11pt, names.months.at(m - 1))
    v(-0.4em)
    table(
      columns: (1.2fr,) + (1fr,) * 7,
      align: center,
      stroke: none,
      inset: (x: 0pt, y: 0.42em),
      fill: (x, y) => if y > 0 and x >= 6 { shade },
      table.header(text(fill: luma(120), names.week), ..names.days.map(day => text(weight: "bold", day))),
      ..cells,
    )
  })
}

#set document(title: [#names.title #year])
#set text(lang: lang, size: 9pt)
#set page(paper: "a4", flipped: true, margin: 1.4cm)

#grid(
  columns: (1fr, auto),
  align: (left + bottom, right + bottom),
  text(22pt, weight: "bold")[#names.title #year],
  text(fill: luma(120))[ISO 8601 · #lang],
)
#v(0.4em)
#grid(
  columns: (1fr,) * 4,
  column-gutter: 1.2cm,
  row-gutter: 0.8cm,
  ..range(1, 13).map(month),
)
