// Typography that follows the language. The page's dropdown sets `lang` through sys.inputs, and
// `set text(lang: ..)` alone switches the quotation marks, the hyphenation and the names of figures,
// tables and the contents. Only the texts and the date format below are written per language.

#let requested = sys.inputs.at("lang", default: "en")
#let lang = if requested in ("en", "de", "fr", "es") { requested } else { "en" }

#let texts = (
  en: (
    title: [Typography that knows its language],
    section: [Quotation marks and hyphenation],
    quotes: [Typst sets quotation marks as the language expects: "double quotes", with 'single quotes'
      inside them. It hyphenates long words such as internationalization, telecommunications and
      incomprehensibilities by the rules of the language.],
    names: [@sketch shows a sketch, and @words counts letters. Both names come from the language
      setting, as does the heading of the contents.],
    sketch: [A page with a heading and two columns],
    words: [Long words of the language],
    long: ("internationalization", "telecommunications", "incomprehensibilities"),
    word: [Word], letters: [Letters], today: [Today],
    months: ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"),
    date: (d, m, y) => [#m #d, #y],
  ),
  de: (
    title: [Typografie, die ihre Sprache kennt],
    section: [Anführungszeichen und Silbentrennung],
    quotes: [Typst setzt Anführungszeichen, wie die Sprache sie erwartet: "doppelte Anführungszeichen"
      und 'einfache' darin. Lange Wörter wie Datenverarbeitungsanlage, Donaudampfschifffahrtsgesellschaft
      und Rechtsschutzversicherungsgesellschaften trennt es nach den Regeln der Sprache.],
    names: [@sketch zeigt eine Skizze, @words zählt Buchstaben. Beide Bezeichnungen stammen aus der
      Spracheinstellung, ebenso die Überschrift des Inhaltsverzeichnisses.],
    sketch: [Eine Seite mit Überschrift und zwei Spalten],
    words: [Lange Wörter der Sprache],
    long: ("Datenverarbeitungsanlage", "Donaudampfschifffahrtsgesellschaft", "Rechtsschutzversicherungsgesellschaften"),
    word: [Wort], letters: [Buchstaben], today: [Heute],
    months: ("Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"),
    date: (d, m, y) => [#d. #m #y],
  ),
  fr: (
    title: [Une typographie qui connaît sa langue],
    section: [Guillemets et césure],
    quotes: [Typst place les guillemets comme la langue le veut~: "des guillemets doubles", avec 'des
      simples' à l'intérieur. Il coupe les mots longs comme anticonstitutionnellement,
      internationalisation et incompréhensibilité selon les règles de la langue.],
    names: [@sketch montre une esquisse, et @words compte des lettres. Les deux noms viennent du réglage
      de la langue, tout comme le titre de la table des matières.],
    sketch: [Une page avec un titre et deux colonnes],
    words: [Mots longs de la langue],
    long: ("anticonstitutionnellement", "internationalisation", "incompréhensibilité"),
    word: [Mot], letters: [Lettres], today: [Aujourd'hui],
    months: ("janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"),
    date: (d, m, y) => [#d #m #y],
  ),
  es: (
    title: [Tipografía que conoce su idioma],
    section: [Comillas y división silábica],
    quotes: [Typst pone las comillas como el idioma espera: "comillas dobles", con 'simples' dentro de
      ellas. Divide palabras largas como internacionalización, electroencefalografista y
      desproporcionadamente según las reglas del idioma.],
    names: [@sketch muestra un boceto, y @words cuenta letras. Ambos nombres provienen del ajuste de
      idioma, al igual que el título del índice.],
    sketch: [Una página con un título y dos columnas],
    words: [Palabras largas del idioma],
    long: ("internacionalización", "electroencefalografista", "desproporcionadamente"),
    word: [Palabra], letters: [Letras], today: [Hoy],
    months: ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"),
    date: (d, m, y) => [#d de #m de #y],
  ),
).at(lang)

#let today = datetime.today()

#set document(title: texts.title)
#set text(lang: lang, size: 10pt)
#set par(justify: true)
#set heading(numbering: "1.")
#set page(
  paper: "a5",
  margin: (x: 1.5cm, top: 2cm, bottom: 1.8cm),
  columns: 2,
  header: context {
    set text(8pt, fill: luma(110))
    grid(columns: (1fr, auto), [Typst · #raw(lang)], [#texts.today: #(texts.date)(today.day(), texts.months.at(today.month() - 1), today.year())])
    line(length: 100%, stroke: 0.4pt + luma(200))
  },
)

#place(top, scope: "parent", float: true, align(center, text(15pt, weight: "bold", texts.title)))

#outline(depth: 1)

= #texts.section

#texts.quotes

#texts.names

#figure(
  box(width: 80%, height: 3.2cm, stroke: 0.6pt + luma(150), inset: 0.3cm, {
    place(top, rect(width: 100%, height: 0.35cm, fill: luma(200)))
    place(top + left, dy: 0.6cm, stack(spacing: 0.18cm, ..range(7).map(_ => rect(width: 45%, height: 0.12cm, fill: luma(225)))))
    place(top + right, dy: 0.6cm, stack(spacing: 0.18cm, ..range(7).map(_ => rect(width: 45%, height: 0.12cm, fill: luma(225)))))
  }),
  caption: texts.sketch,
  alt: "A sketch of a page: a heading bar across the top and two columns of text lines below.",
) <sketch>

= #texts.words

#figure(
  table(
    columns: (1fr, auto),
    align: (left, right),
    table.header(strong(texts.word), strong(texts.letters)),
    ..texts.long.map(word => (word, str(word.clusters().len()))).flatten(),
  ),
  caption: texts.words,
) <words>

#texts.quotes
