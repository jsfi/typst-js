// A membership form that shows every kind of field and what each can do. The preview shows the
// boxes, and what Typst sets in them; the PDF download passes through @jsfi/typst-fields, which puts
// a field over every box, so that a reader can fill the form in and sign it in their PDF viewer.
// The service worker adds that package's Typst library to the project as fields.typ.
//
// Names with periods group fields: "applicant.name" and "address.town" belong to the groups
// "applicant" and "address", which a button can reset at once. Boxes that share a name are one
// field: the applicant's name shows again above the signature, and the kind of membership again in
// the summary, each changing with the other.

#import "fields.typ": *

// The page's dropdown sets it through sys.inputs: empty fields, or fields that start with a value.
#let prefilled = sys.inputs.at("values", default: "empty") == "prefilled"
#let value(text) = if prefilled { text } else { "" }

#let accent = rgb("#1d4e89")
#let muted = luma(38%)

#set document(title: [Membership application])
#set text(lang: "en", size: 10pt)
#set par(spacing: 0.9em)
#set page(
  paper: "a4",
  margin: (x: 2cm, top: 2.6cm, bottom: 2.2cm),
  header: {
    set text(size: 8pt, fill: muted)
    [The Typesetters' Club #h(1fr) Membership application]
    v(-0.6em)
    line(length: 100%, stroke: 0.4pt + muted)
  },
  footer: context {
    set text(size: 8pt, fill: muted)
    h(1fr)
    counter(page).display("1 of 1", both: true)
  },
)
#show heading.where(level: 1): set text(size: 17pt, fill: accent)
#show heading.where(level: 2): set text(size: 11.5pt, fill: accent)
#show heading.where(level: 2): it => block(
  width: 100%,
  above: 1.5em,
  below: 0.9em,
  inset: (bottom: 0.3em),
  stroke: (bottom: 0.6pt + accent),
  it,
)
#show link: set text(fill: accent)

// A required field's mark, and the note that explains a field below it.
#let required = text(fill: accent)[\*]
#let note(body) = text(size: 8.5pt, fill: muted, body)

// Labels and fields side by side, each field with an optional note below it: rows of
// (label, field) or (label, field, note).
#let fields(..rows) = grid(
  columns: (4.6cm, 1fr),
  column-gutter: 0.8em,
  row-gutter: 0.75em,
  ..rows.pos().map(row => {
    let (label, field, ..rest) = row
    (
      grid.cell(align: right, inset: (top: 0.3em), label),
      if rest.len() == 0 { field } else { stack(spacing: 0.4em, field, note(rest.first())) },
    )
  }).flatten()
)

// The applicant's name, under "About you" and above the signature: one field in two places.
#let applicant-name(width: 1fr) = text-field(
  "applicant.name",
  label: "Full name",
  required: true,
  value: value("Fatima Al-Zahra"),
  width: width,
)

// The kinds of membership, as a radio group; shown twice, its buttons of one value turn on together.
#let membership(compact: false) = {
  let kinds = (
    ("standard", "Standard, 60 € a year"),
    ("student", "Student, 20 € a year"),
    ("supporting", "Supporting, 120 € a year"),
  )
  for (kind, text) in kinds {
    let checked = prefilled and kind == "student"
    radio("membership", kind, label: text, group-label: "Kind of membership", checked: checked)
    [ #text]
    if compact { h(1.2em) } else { linebreak() }
  }
}

= Membership application

#block(fill: accent.lighten(92%), inset: 10pt, radius: 3pt, width: 100%)[
  *How this form works.* Complete it in your PDF viewer, sign it at the end, save it and send it
  back to us. Fields marked #required have to be filled in.

  - *Linked fields.* Your name appears twice, under _About you_ and above your signature, and the
    kind of membership too, under _Membership_ and in the summary. They are one field each, shown in
    two places: change one, and the other changes with it.
  - *Resetting.* _Reset the address_ returns the address to how it started; _Reset the form_ does
    so for every field but your note to yourself.
  - *Signing locks the form.* Once signed, no field but your note can be changed, so sign last.
  - *Sending.* _Send the application_ sends every field but your note, empty ones too; _Send a
    copy as PDF_ sends the whole filled-in PDF instead, your note with it. _Read the terms_ opens a
    web page; as a link, it does not move when pressed, as the other buttons do.
]

#fields(
  ([Application number], text-field(
    "application",
    label: "Application number, given by us",
    value: "A-2026-0042",
    read-only: true,
    width: 3.5cm,
  ), [Given by us; you cannot change it.]),
)

== About you
#fields(
  ([Title], dropdown(
    "applicant.title",
    label: "Title, picked or typed",
    options: ("Dr", "Prof", "Rev"),
    value: if prefilled { "Dr" },
    editable: true,
    commit-on-change: true,
    width: 3cm,
  ), [Pick one, or type your own.]),
  ([Full name #required], applicant-name(), [Linked to the name above your signature.]),
  ([Name in your own script], text-field(
    "applicant.native-name",
    label: "Name in your own script",
    value: value("فاطمة الزهراء"),
    align: right,
  ), [Aligned right, for scripts written right to left.]),
  ([Date of birth], text-field(
    "applicant.birth-date",
    label: "Date of birth, as day, month and year",
    comb: true,
    max-length: 8,
    width: 4.8cm,
    value: value("14031990"),
  ), [Day, month and year, one digit per box: 14 03 1990.]),
  ([E-mail #required], text-field(
    "applicant.email",
    label: "E-mail address",
    required: true,
    max-length: 80,
    spellcheck: false,
    value: value("fatima@example.org"),
  )),
  ([PIN for the member area], text-field(
    "applicant.pin",
    label: "PIN for the member area",
    password: true,
    width: 3cm,
  ), [Hidden as you type it.]),
  ([Languages you speak], list-box(
    "applicant.languages",
    label: "Languages you speak",
    options: ("English", "Deutsch", "Français", "العربية", "Español"),
    value: if prefilled { ("English", "العربية") },
    multiple: true,
    commit-on-change: true,
  ), [Pick several with Ctrl or ⌘.]),
)

== Your address
#fields(
  ([Street], text-field("address.street", label: "Street and number", value: value("12 Harbour Street"))),
  ([Postcode and town], text-field(
    "address.town",
    label: "Postcode and town",
    value: value("Leith, Edinburgh EH6 6QW"),
  )),
  ([Country], dropdown(
    "address.country",
    label: "Country",
    options: (("de", "Germany"), ("fr", "France"), ("gb", "United Kingdom"), ("eg", "Egypt")),
    value: if prefilled { "gb" },
  )),
  ([], button("reset-address", "Reset the address", action: (reset: true, fields: ("address",))),
    [Returns the three address fields to how they started, and no others.]),
  ([], button(
    "check-address",
    "Check the address",
    action: (submit: "https://example.org/address", fields: ("address",), method: "get"),
  ), [Sends the three address fields alone to be checked, in the web address.]),
)

== Membership
#fields(
  ([Kind of membership], [
    #membership()
    #note[Linked to the summary at the end: picking one here picks it there too.]
  ]),
  ([Donation on top], text-field(
    "donation",
    label: "Donation on top, in euros",
    align: right,
    scroll: false,
    max-length: 8,
    width: 3cm,
    value: value("25,00"),
  ), [In euros, aligned right as amounts are.]),
  ([Newsletter], [
    #checkbox("newsletter", label: "Send me the monthly newsletter", value: "monthly", checked: prefilled)
    Send me the monthly newsletter.
  ]),
  ([Contact me by], [
    #checkbox("contact", label: "By post", value: "post", group-label: "How we may contact you") post
    #h(0.8em)
    #checkbox("contact", label: "By phone", value: "phone") phone
    #h(0.8em)
    #checkbox("contact", label: "By e-mail", value: "email", checked: prefilled) e-mail
    #note[\ One of them, or none: ticking another unticks the first.]
  ]),
  ([Terms #required], [
    #checkbox("terms", label: "I accept the terms of membership", required: true) I accept the
    #link("https://example.org/terms")[terms of membership].
  ]),
)

== Anything else?
#fields(
  ([Notes], text-field(
    "notes",
    label: "Anything else we should know",
    multiline: true,
    value: value("Happy to help at events. Ich spreche auch Deutsch, и немного по-русски."),
  )),
  ([A note to yourself], text-field(
    "reminder",
    label: "A note to yourself, not sent",
    export: false,
  ), [Left out of the application sent and of the form's reset; a copy as PDF holds it.]),
)

// The summary and the signature stay on one page.
#block(breakable: false)[
  == Summary and signature
  #fields(
    ([Kind of membership], [
      #membership(compact: true)
      #note[\ The same choice as under _Membership_.]
    ]),
    ([Full name #required], applicant-name(), [The same field as under _About you_.]),
    ([Place and date], text-field("signed-at", label: "Place and date of signing", width: 7cm)),
    ([Your signature], signature-field(
      "signature",
      label: "Your signature, which locks the form",
      lock: (except: ("reminder",)),
      width: 7cm,
    ), [Signing locks every field but your note to yourself.]),
  )
]

#v(1em)
#align(right)[
  // A link has no pressed look.
  #button("terms-link", "Read the terms", action: (link: "https://example.org/terms"), press: 0pt)
  #button("reset", "Reset the form", action: (reset: true, fields: ("reminder",), exclude: true))
  #button("send-pdf", "Send a copy as PDF", action: (submit: "https://example.org/apply", format: "pdf"))
  #button("send", "Send the application", action: (submit: "https://example.org/apply", empty: true))
]
