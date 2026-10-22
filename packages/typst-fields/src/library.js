// The Typst library that marks fields, as the source of a project file. It is a string here, rather
// than a file of the package, so that a browser gets it without fetching anything.

import { PADDING } from './appearance.js';
import { HIGHLIGHT } from './kinds/choice.js';
import { MARKER } from './kinds/index.js';
import { formatNumber } from './syntax.js';
import { DOT, TICK, TICK_WIDTH } from './toggle-appearances.js';

const [tickStart, ...tickRest] = TICK;

/**
 * The input that has the Typst library draw on the page what only the fields draw in the PDF, for a
 * preview made without `addFields`: set it to `"true"` with `setInputs`, and never for the PDF.
 */
export const previewInput = 'fields-preview';

/**
 * The Typst library that marks fields. Add it to the project, for example as `/fields.typ`, and
 * import from it `text-field`, `checkbox`, `radio`, `dropdown`, `list-box`, `button` and
 * `signature-field`.
 */
export const fieldsLibrary = `// Fillable form fields for PDFs, marked for @jsfi/typst-fields.
//
// Each function draws a box and wraps it in a link to \`${MARKER}\` and the field's settings as
// JSON. @jsfi/typst-fields turns that link into a form field over the box; without it, the box stays
// a box with a link that leads nowhere. What a field shows from the start, a value, a list's options
// or a button's caption, Typst sets inside the box, so that it is shaped and set in the document's
// font; @jsfi/typst-fields moves it from the page into the field.
//
// Boxes that share a name are one field shown in several places, as radio buttons of one group are;
// a name with periods, such as "address.city", groups fields under "address".

// The box \`body\`, marked as a field of \`kind\` with \`settings\`, once its name and label are checked.
#let _marker(kind, name, label, settings, body) = {
  assert(
    type(name) == str and name.split(".").all(part => part != ""),
    message: "a field's name has to be a string whose parts between periods are not empty, not "
      + repr(name),
  )
  assert(
    type(label) == str and label.trim() != "",
    message: "field " + repr(name) + " needs a label: the name a screen reader announces for it",
  )
  let settings = (type: kind, name: name, label: label, ..settings)
  link("${MARKER}" + json.encode(settings, pretty: false), body)
}

// The settings every kind of field takes, checked.
#let _common(name, required, read-only, export) = {
  for (key, flag) in (("required", required), ("read-only", read-only), ("export", export)) {
    assert(type(flag) == bool, message: key + " of field " + repr(name) + " has to be a boolean")
  }
  (required: required, read-only: read-only, export: export)
}

// Viewers draw a field's text ${PADDING}pt from its edges. What Typst sets in a field keeps to that, so that
// it moves as little as it can when a viewer takes over: one line centred and never wrapped, several
// lines from the top, each as high as the font's ascender and descender.
#let _padding = ${PADDING}pt

// Whether to draw what only the fields draw in the PDF, a checkbox's tick, a radio button's dot and
// the highlight of a list box's picked options, for a preview made without @jsfi/typst-fields, such
// as an SVG: when the input "${previewInput}" is "true". A PDF for @jsfi/typst-fields is compiled
// without it, or the page would show them beneath the fields, whatever the reader changes.
#let _preview = sys.inputs.at("${previewInput}", default: "false") == "true"

// A checkbox's tick, for a preview, as @jsfi/typst-fields draws it in the field.
#let _tick = layout(size => {
  let side = calc.min(size.width, size.height)
  let point(u, v) = ((size.width - side) / 2 + u * side, (size.height - side) / 2 + (1 - v) * side)
  place(curve(
    stroke: (paint: black, thickness: side * ${TICK_WIDTH}, cap: "round", join: "round"),
    curve.move(point(${tickStart.join(', ')})),
${tickRest.map((p) => `    curve.line(point(${p.join(', ')})),\n`).join('')}  ))
})

// A radio button's dot, for a preview, as @jsfi/typst-fields draws it in the field.
#let _dot = layout(size => {
  let radius = calc.min(size.width, size.height) * ${DOT}
  place(dx: size.width / 2 - radius, dy: size.height / 2 - radius, circle(radius: radius, fill: black))
})

// The highlight of a list box's picked option, for a preview, as viewers draw it.
#let _highlight = rgb(${HIGHLIGHT.map((c) => `${formatNumber(c * 100)}%`).join(', ')})

// \`body\` set as a field's text, in \`fill\`, the colour of the text outside the field's link, which a
// document's rules for links do not reach, aligned as \`alignment\`.
#let _field-text(fill, alignment, body) = {
  set text(fill: fill, top-edge: "ascender", bottom-edge: "descender", hyphenate: false)
  set par(leading: 0pt, justify: false, first-line-indent: 0pt)
  set std.align(alignment)
  body
}

// One line, centred vertically, aligned as \`alignment\` and never wrapped; the field's box clips it.
// \`reserve\` keeps room at the right, as for a drop-down list's arrow.
#let _one-line(body, alignment, reserve: 0pt) = context {
  // A box as wide as the line, which a hair more keeps from breaking.
  let width = measure(body).width + 0.01pt
  let shift = if alignment == right { -reserve } else if alignment == center { -reserve / 2 } else { 0pt }
  place(horizon + alignment, dx: shift, box(width: width, body))
}

// The height of one line of a field's text.
#let _line-height() = measure(text(top-edge: "ascender", bottom-edge: "descender", "X")).height

#let _no-inset(name, args) = assert(
  "inset" not in args.named(),
  message: "field " + repr(name) + " keeps its text ${PADDING}pt from its edges, as viewers do; it takes no inset",
)

// An alignment viewers know for a field's text, by its name in the field's settings.
#let _alignment(name, alignment) = {
  assert(
    alignment in (left, center, right),
    message: "field " + repr(name) + " aligns its text left, center or right, not " + repr(alignment),
  )
  if alignment == left { "left" } else if alignment == center { "center" } else { "right" }
}

// A list of field names, as actions and locks take them, checked.
#let _names(owner, names) = {
  assert(
    type(names) == array and names.all(n => type(n) == str and n != ""),
    message: repr(owner) + " names fields as an array of their names",
  )
  names
}

// The options of a choice field as (value, text) pairs: a string is both, a pair names them apart.
#let _options(name, options) = {
  assert(
    type(options) == array and options.len() > 0,
    message: "field " + repr(name) + " needs options: an array of strings or (value, text) pairs",
  )
  let pairs = options.map(option => if type(option) == str { (option, option) } else { option })
  for pair in pairs {
    assert(
      type(pair) == array and pair.len() == 2 and pair.all(part => type(part) == str),
      message: "an option of field " + repr(name) + " has to be a string or a (value, text) pair",
    )
  }
  let values = pairs.map(pair => pair.first())
  assert(values.dedup().len() == values.len(), message: "field " + repr(name) + " has an option twice")
  pairs
}

/// A fillable text field: a box that @jsfi/typst-fields makes a form field.
///
/// - name (str): The field's name in the form data; periods group it, as in "address.city".
/// - label (str): The name a screen reader announces for the field, such as "Full name".
/// - value (str): The text the field starts with, set by Typst in the text's font and colour.
/// - multiline (bool): Whether the field takes several lines.
/// - required (bool): Whether the form needs a value in the field before it is submitted.
/// - read-only (bool): Whether the reader cannot change the field.
/// - export (bool): Whether the field's value is submitted with the form.
/// - max-length (int, none): The most characters the field takes.
/// - password (bool): Whether the viewer hides what is typed; such a field starts empty.
/// - comb (bool): Whether the field shows one character per cell, max-length cells in all.
/// - align (alignment): Where the text lines up: left, center or right.
/// - spellcheck (bool): Whether the viewer checks the spelling of what is typed.
/// - scroll (bool): Whether the field scrolls when the text outgrows it, or stops taking text.
/// - width (relative, fraction): The box's width; by default the rest of the line.
/// - height (length, auto): The box's height; by default one line, or four when multiline.
/// - stroke (stroke): The box's border, and a comb field's cell borders, beneath the field.
/// - ..args: Further arguments of \`box\`, such as \`fill\` or \`radius\`; not \`inset\`.
#let text-field(
  name,
  label: none,
  value: "",
  multiline: false,
  required: false,
  read-only: false,
  export: true,
  max-length: none,
  password: false,
  comb: false,
  align: left,
  spellcheck: true,
  scroll: true,
  width: 1fr,
  height: auto,
  stroke: 0.5pt + luma(45%),
  ..args,
) = context {
  assert(type(value) == str, message: "the value of field " + repr(name) + " has to be a string")
  assert(
    multiline or not value.contains(regex("[\\n\\r]")),
    message: "the value of field " + repr(name) + " has a line break, which needs multiline: true",
  )
  _no-inset(name, args)
  assert(
    max-length == none or (type(max-length) == int and max-length > 0),
    message: "the max-length of field " + repr(name) + " has to be a positive integer",
  )
  assert(
    max-length == none or value.clusters().len() <= max-length,
    message: "the value of field " + repr(name) + " is longer than its max-length",
  )
  assert(
    not password or (value == "" and not multiline and not comb),
    message: "password field " + repr(name) + " starts empty, on one line, and is no comb",
  )
  assert(
    not comb or (max-length != none and not multiline),
    message: "comb field " + repr(name) + " needs a max-length, and takes one line",
  )
  assert(
    type(spellcheck) == bool and type(scroll) == bool,
    message: "spellcheck and scroll of field " + repr(name) + " are booleans",
  )
  let settings = (
    .._common(name, required, read-only, export),
    value: value,
    multiline: multiline,
    max-length: max-length,
    password: password,
    comb: comb,
    align: _alignment(name, align),
    spellcheck: spellcheck,
    scroll: scroll,
    size: text.size.to-absolute().pt(),
  )
  let height = if height != auto { height } else if multiline { 4.6em } else { 1.5em }
  let fill = text.fill
  // A comb field's cells span its whole width, as viewers divide it; the others keep the padding.
  let body = if comb {
    layout(size => {
      let cell = size.width / max-length
      for i in range(1, max-length) {
        place(dx: cell * i, dy: -_padding, line(angle: 90deg, length: size.height + 2 * _padding, stroke: stroke))
      }
      _field-text(fill, left, stack(
        dir: ltr,
        ..value.clusters().map(char => box(width: cell, height: size.height, std.align(center + horizon, char))),
      ))
    })
  } else if value != "" {
    _field-text(fill, align, if multiline { value } else { _one-line(value, align) })
  }
  _marker(
    "text",
    name,
    label,
    settings,
    box(
      width: width,
      height: height,
      stroke: stroke,
      baseline: 0.4em,
      inset: if comb { (x: 0pt, y: _padding) } else { _padding },
      clip: true,
      ..args,
      body,
    ),
  )
}

/// A checkbox: a square box that @jsfi/typst-fields makes a form field, ticked or not. Checkboxes
/// that share a name with different values are one field, of which the reader ticks one or none.
///
/// - name (str): The field's name in the form data; periods group it, as in "consent.mail".
/// - label (str): The name a screen reader announces for the checkbox, such as "I agree".
/// - value (str): The field's value when this checkbox is ticked; "Yes" unless told otherwise.
/// - group-label (str, none): For checkboxes of different values, the name a screen reader
///   announces for them together, given on one of them, or alike on several.
/// - checked (bool): Whether the checkbox starts ticked.
/// - required (bool): Whether the form needs the checkbox ticked before it is submitted.
/// - read-only (bool): Whether the reader cannot change the field.
/// - export (bool): Whether the field's value is submitted with the form.
/// - size (length): The side of the square.
/// - stroke (stroke): The box's border, which the PDF draws beneath the field.
/// - ..args: Further arguments of \`box\`, such as \`fill\` or \`radius\`.
#let checkbox(
  name,
  label: none,
  value: "Yes",
  group-label: none,
  checked: false,
  required: false,
  read-only: false,
  export: true,
  size: 0.9em,
  stroke: 0.5pt + luma(45%),
  ..args,
) = {
  assert(type(checked) == bool, message: "checked of field " + repr(name) + " has to be a boolean")
  assert(
    type(value) == str and value != "" and value != "Off",
    message: "the value of checkbox " + repr(name) + " has to be a non-empty string other than \\"Off\\"",
  )
  assert(
    group-label == none or (type(group-label) == str and group-label.trim() != ""),
    message: "the group-label of field " + repr(name) + " has to be a non-empty string",
  )
  _marker(
    "checkbox",
    name,
    label,
    (.._common(name, required, read-only, export), value: value, group-label: group-label, checked: checked),
    box(width: size, height: size, stroke: stroke, baseline: 0.1em, ..args, if _preview and checked { _tick }),
  )
}

/// A radio button: one option of a group, of which the reader picks one. The buttons of a group
/// share its name and become one field, whose value is the picked button's; buttons of one value
/// turn on together.
///
/// - group (str): The group's name in the form data; periods group it further.
/// - value (str): What the group's value is when this button is picked.
/// - label (str): The name a screen reader announces for this option, such as "By e-mail".
/// - group-label (str, none): The name a screen reader announces for the group, such as "Contact";
///   given on one button of the group, or alike on several.
/// - checked (bool): Whether this button starts picked; buttons of one value at most.
/// - required (bool): Whether the form needs a button of the group picked before it is submitted.
/// - read-only (bool): Whether the reader cannot change the group.
/// - export (bool): Whether the group's value is submitted with the form.
/// - size (length): The circle's diameter.
/// - stroke (stroke): The circle, which the PDF draws beneath the field.
/// - ..args: Further arguments of \`box\`, such as \`fill\`.
#let radio(
  group,
  value,
  label: none,
  group-label: none,
  checked: false,
  required: false,
  read-only: false,
  export: true,
  size: 0.9em,
  stroke: 0.5pt + luma(45%),
  ..args,
) = {
  assert(
    type(value) == str and value != "" and value != "Off",
    message: "a radio button of group " + repr(group) + " needs a value: a non-empty string other than \\"Off\\"",
  )
  assert(type(checked) == bool, message: "checked of radio button " + repr(value) + " has to be a boolean")
  assert(
    group-label == none or (type(group-label) == str and group-label.trim() != ""),
    message: "the group-label of group " + repr(group) + " has to be a non-empty string",
  )
  _marker(
    "radio",
    group,
    label,
    (.._common(group, required, read-only, export), value: value, group-label: group-label, checked: checked),
    box(
      width: size,
      height: size,
      radius: 50%,
      stroke: stroke,
      baseline: 0.1em,
      ..args,
      if _preview and checked { _dot },
    ),
  )
}

/// A drop-down list: a box showing the picked option, from which the reader picks another.
///
/// - name (str): The field's name in the form data; periods group it, as in "address.country".
/// - label (str): The name a screen reader announces for the field, such as "Country".
/// - options (array): The options, each a string or a (value, text) pair, which shows the text and
///   gives the value.
/// - value (str, none): The value of the option picked from the start, or none.
/// - editable (bool): Whether the reader may type a value of their own; then \`value\` may be one too.
/// - required (bool): Whether the form needs a value before it is submitted.
/// - read-only (bool): Whether the reader cannot change the field.
/// - export (bool): Whether the field's value is submitted with the form.
/// - align (alignment): Where the text lines up: left, center or right.
/// - spellcheck (bool): Whether the viewer checks the spelling of a value typed into it.
/// - commit-on-change (bool): Whether a pick counts at once, rather than when the reader leaves.
/// - width (relative, fraction): The box's width; by default the rest of the line.
/// - height (length): The box's height.
/// - stroke (stroke): The box's border, which the PDF draws beneath the field, with its arrow.
/// - ..args: Further arguments of \`box\`, such as \`fill\` or \`radius\`; not \`inset\`.
#let dropdown(
  name,
  label: none,
  options: (),
  value: none,
  editable: false,
  required: false,
  read-only: false,
  export: true,
  align: left,
  spellcheck: true,
  commit-on-change: false,
  width: 1fr,
  height: 1.5em,
  stroke: 0.5pt + luma(45%),
  ..args,
) = context {
  let options = _options(name, options)
  _no-inset(name, args)
  assert(
    value == none or (type(value) == str and (editable or options.any(o => o.first() == value))),
    message: "the value of field " + repr(name) + " has to be one of its options' values, or none",
  )
  assert(
    type(spellcheck) == bool and type(commit-on-change) == bool,
    message: "spellcheck and commit-on-change of field " + repr(name) + " are booleans",
  )
  let picked = options.find(o => o.first() == value)
  let shown = if picked != none { picked.last() } else { value }
  let fill = text.fill
  let arrow-width = 0.6em
  let arrow = polygon(
    fill: if type(stroke) == stroke { stroke.paint } else { luma(45%) },
    (0pt, 0pt),
    (arrow-width, 0pt),
    (arrow-width / 2, 0.35em),
  )
  _marker(
    "choice",
    name,
    label,
    (
      .._common(name, required, read-only, export),
      options: options,
      value: value,
      list: false,
      multiple: false,
      editable: editable,
      align: _alignment(name, align),
      spellcheck: spellcheck,
      commit-on-change: commit-on-change,
      size: text.size.to-absolute().pt(),
    ),
    box(
      width: width,
      height: height,
      stroke: stroke,
      baseline: 0.4em,
      inset: _padding,
      clip: true,
      ..args,
      {
        place(right + horizon, arrow)
        // The text keeps clear of the arrow.
        if shown != none {
          _field-text(fill, align, _one-line(shown, align, reserve: arrow-width + _padding))
        }
      },
    ),
  )
}

/// A list box: a box listing the options, of which the reader picks one, or several.
///
/// - name (str): The field's name in the form data; periods group it, as in "skills.languages".
/// - label (str): The name a screen reader announces for the field, such as "Languages".
/// - options (array): The options, each a string or a (value, text) pair, which shows the text and
///   gives the value.
/// - value (str, array, none): The value of the option picked from the start, an array of values
///   when \`multiple\`, or none.
/// - multiple (bool): Whether the reader may pick several options.
/// - required (bool): Whether the form needs a value before it is submitted.
/// - read-only (bool): Whether the reader cannot change the field.
/// - export (bool): Whether the field's value is submitted with the form.
/// - align (alignment): Where the options line up: left, center or right.
/// - commit-on-change (bool): Whether a pick counts at once, rather than when the reader leaves.
/// - width (relative, fraction): The box's width; by default the rest of the line.
/// - height (length, auto): The box's height; by default as many lines as options, four at most.
/// - stroke (stroke): The box's border, which the PDF draws beneath the field.
/// - ..args: Further arguments of \`box\`, such as \`fill\` or \`radius\`; not \`inset\`.
#let list-box(
  name,
  label: none,
  options: (),
  value: none,
  multiple: false,
  required: false,
  read-only: false,
  export: true,
  align: left,
  commit-on-change: false,
  width: 1fr,
  height: auto,
  stroke: 0.5pt + luma(45%),
  ..args,
) = context {
  let options = _options(name, options)
  _no-inset(name, args)
  let values = if value == none { () } else if type(value) == array { value } else { (value,) }
  assert(
    values.all(v => options.any(o => o.first() == v)),
    message: "the value of field " + repr(name) + " has to be among its options' values",
  )
  assert(
    multiple or values.len() <= 1,
    message: "field " + repr(name) + " has several values, which needs multiple: true",
  )
  assert(
    type(commit-on-change) == bool,
    message: "commit-on-change of field " + repr(name) + " is a boolean",
  )
  let line-height = _line-height()
  let height = if height != auto { height } else {
    calc.min(options.len(), 4) * line-height + 2 * _padding
  }
  let fill = text.fill
  _marker(
    "choice",
    name,
    label,
    (
      .._common(name, required, read-only, export),
      options: options,
      value: values,
      list: true,
      multiple: multiple,
      editable: false,
      align: _alignment(name, align),
      spellcheck: true,
      commit-on-change: commit-on-change,
      size: text.size.to-absolute().pt(),
      line-height: line-height.pt(),
    ),
    box(
      width: width,
      height: height,
      stroke: stroke,
      baseline: 0.4em,
      inset: _padding,
      clip: true,
      ..args,
      _field-text(fill, align, stack(..options.map(o => block(
        width: 100%,
        height: line-height,
        fill: if _preview and o.first() in values { _highlight },
        outset: (x: 1pt),
        _one-line(o.last(), align),
      )))),
    ),
  )
}

/// A push button, which acts when the reader clicks it.
///
/// - name (str): The field's name, unique in the document unless the buttons are alike.
/// - caption (str, content): What the button shows.
/// - label (str, none): The name a screen reader announces for the button; by default the caption,
///   when it is a string.
/// - action (str, dictionary): What the button does: "reset" or (reset: true) returns the fields
///   to the values they start with, empty unless given; (submit: url) sends the form to \`url\` as a web form would, or with \`format: "pdf"\`, "fdf" or "xfdf"
///   as that; (link: url) opens \`url\`. A reset or submit takes \`fields\`, an array of field or group
///   names it is limited to, or with \`exclude: true\` the ones it leaves out; a submit also takes
///   \`empty: true\` to send empty fields, and \`method: "get"\` to send a web form as a query.
/// - read-only (bool): Whether the button does nothing.
/// - press (length): How far the caption moves, right and down, while the button is pressed; 0pt
///   for no pressed look, which leaves the viewer's own.
/// - width (auto, relative): The box's width; by default the caption's, with room around it.
/// - height (length): The box's height.
/// - stroke (stroke): The box's border, which the PDF draws beneath the field.
/// - fill (color): The box's background, which the PDF draws beneath the field.
/// - ..args: Further arguments of \`box\`, such as \`radius\` or \`inset\`.
#let button(
  name,
  caption,
  label: none,
  action: "reset",
  read-only: false,
  press: 0.6pt,
  width: auto,
  height: 1.8em,
  stroke: 0.5pt + luma(45%),
  fill: luma(93%),
  ..args,
) = context {
  let label = if label != none { label } else if type(caption) == str { caption }
  assert(
    type(press) == length and press.to-absolute() >= 0pt,
    message: "the press of button " + repr(name) + " has to be a length of 0pt or more",
  )
  assert(
    caption != none and caption != "" and caption != [],
    message: "button " + repr(name) + " needs a caption",
  )
  let action = if action == "reset" { (reset: true) } else { action }
  let allowed = if type(action) != dictionary { () } else if "reset" in action {
    ("reset", "fields", "exclude")
  } else if "submit" in action {
    ("submit", "format", "fields", "exclude", "empty", "method")
  } else if "link" in action { ("link",) } else { () }
  assert(
    allowed.len() > 0 and action.keys().all(key => key in allowed),
    message: "the action of button " + repr(name) + " has to be \\"reset\\", (submit: url) or (link: url), with the keys each takes",
  )
  assert(
    action.at("format", default: "html") in ("html", "fdf", "xfdf", "pdf"),
    message: "button " + repr(name) + " submits as \\"html\\", \\"fdf\\", \\"xfdf\\" or \\"pdf\\"",
  )
  assert(
    action.at("method", default: "post") in ("post", "get")
      and (action.at("method", default: "post") == "post" or action.at("format", default: "html") == "html"),
    message: "button " + repr(name) + " submits a web form by \\"post\\" or \\"get\\", any other format by post",
  )
  assert(
    type(action.at("exclude", default: false)) == bool and type(action.at("empty", default: false)) == bool,
    message: "exclude and empty of button " + repr(name) + " are booleans",
  )
  if "fields" in action { let _ = _names(name, action.fields) }
  let fill-text = text.fill
  _marker(
    "button",
    name,
    label,
    (.._common(name, false, read-only, true), action: action, press: press.to-absolute().pt()),
    box(
      width: width,
      height: height,
      stroke: stroke,
      fill: fill,
      inset: (x: 0.8em),
      radius: 2pt,
      baseline: 0.5em,
      ..args,
      std.align(center + horizon, _field-text(fill-text, center, caption)),
    ),
  )
}

/// A signature field: a box the reader signs in, in their PDF viewer.
///
/// - name (str): The field's name, unique in the document; periods group it.
/// - label (str): The name a screen reader announces for the field, such as "Signature".
/// - required (bool): Whether the form needs a signature before it is submitted.
/// - lock (none, str, array, dictionary): The fields signing makes read-only: none, "all", an
///   array of field or group names, or (except: names) all but those.
/// - width (relative, fraction): The box's width.
/// - height (length): The box's height.
/// - stroke (stroke): The box's border, which the PDF draws beneath the field.
/// - ..args: Further arguments of \`box\`, such as \`fill\` or \`radius\`.
#let signature-field(
  name,
  label: none,
  required: false,
  lock: none,
  width: 6cm,
  height: 1.6cm,
  stroke: 0.5pt + luma(45%),
  ..args,
) = {
  let lock = if lock == none or lock == "all" { lock } else if type(lock) == array {
    (fields: _names(name, lock))
  } else if type(lock) == dictionary and lock.keys() == ("except",) {
    (except: _names(name, lock.except))
  } else {
    panic("the lock of signature field " + repr(name) + " has to be none, \\"all\\", names, or (except: names)")
  }
  _marker(
    "signature",
    name,
    label,
    (.._common(name, required, false, true), lock: lock),
    box(width: width, height: height, stroke: stroke, ..args),
  )
}
`;
