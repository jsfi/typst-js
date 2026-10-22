# @jsfi/typst-fields

Fillable form fields for the PDFs of
[`@jsfi/typst-wasm`](https://github.com/jsfi/typst-js/tree/main/packages/typst-wasm#readme) and
[`@jsfi/typst-cli`](https://github.com/jsfi/typst-js/tree/main/packages/typst-cli#readme). A Typst
library marks where a field goes, with a box in the document; `addFields` reads the finished PDF and
puts a form field over every marked box, so that a reader can fill it in, tick it, pick from it,
click it or sign it in their PDF viewer: text fields, checkboxes, radio buttons, drop-down lists,
list boxes, push buttons and signature fields.

The fields are accessible: a PDF that passes PDF/UA-1 still passes it with its fields. Each field has
a label a screen reader announces, sits in the structure tree in reading order, right where the box
is in the text, and is reached by tabbing in that order.

## Getting started

```sh
npm install @jsfi/typst-fields
```

This script adds the library to a project, marks three fields, compiles the document with
`@jsfi/typst-wasm` and adds the fields to its PDF. Save it as `application.mjs` and run it in Node
(22.12 or newer):

```js
import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync, inflateSync } from 'node:zlib';
import { Compiler, initSync } from '@jsfi/typst-wasm';
import { defaultFontUrls } from '@jsfi/typst-wasm/fonts';
import { addFields, fieldsLibrary } from '@jsfi/typst-fields';

initSync({
	module: await readFile(new URL(import.meta.resolve('@jsfi/typst-wasm/typst_wasm_bg.wasm'))),
});
const compiler = new Compiler();
for (const url of defaultFontUrls) compiler.addFont(await readFile(url));

compiler.addFile('/fields.typ', new TextEncoder().encode(fieldsLibrary));
compiler.addFile(
	'/main.typ',
	new TextEncoder().encode(`
#import "fields.typ": checkbox, text-field
#set document(title: "Application")
#set text(lang: "en")

Full name: #text-field("name", label: "Full name")

#text-field("notes", label: "Notes", multiline: true, value: "None so far.")

#checkbox("terms", label: "I accept the terms", required: true) I accept the terms.
`),
);
compiler.setMain('/main.typ');

const { pdf, diagnostics } = compiler.compilePdf({ pdfStandards: ['ua-1'] });
if (!pdf) throw new Error(diagnostics.map((d) => d.message).join('\n'));

await writeFile('application.pdf', addFields(pdf, { inflate: inflateSync, deflate: deflateSync }));
```

With `@jsfi/typst-cli`, the compilation is that package's, and `addFields` the same.

## The Typst library

`fieldsLibrary` is the library's source, to add to the project as any file. Each of its functions
draws a box in the text and marks it as a field; import them all with `#import "fields.typ": *`.

Every field has a `name`, its name in the form data (see _Names_ below), and a `label`, what a
screen reader announces for it. Most take `required`, whether the form needs it filled in before it
is submitted, `read-only`, whether the reader cannot change it, `export: false` to leave its value
out when the form is submitted, and `stroke`, the box's border, and pass further arguments to `box`.
The box and its border are part of the page; the field lies on top of it.

What the reader types or picks is drawn by their viewer, in a font of its own: fields name
Helvetica, which every viewer has or replaces with one of its own, and which is not embedded, so the
PDF carries no font for typing. What a field shows from the start, a value, a list's options or a
button's caption, is set by Typst, inside the box, in the font, size and colour of the text around
it: shaped, in any script and direction Typst sets, with its lines broken by Typst. `addFields` then
moves it from the page into the field, where it shows until the viewer draws the field anew. It is
laid out as viewers lay out text, so that it moves as little as it can when they take over: 2pt from
the edges, one line centred and never wrapped, several lines from the top. Boxes with text therefore
take no `inset`.

What Typst sets in a field needs a tagged PDF, which Typst writes unless it is given
`tagged: false` or `pages`: `addFields` finds it by its tags.

### text-field

```typ
#text-field(name, label: none, value: "", multiline: false, required: false, read-only: false,
  export: true, max-length: none, password: false, comb: false, align: left, spellcheck: true,
  scroll: true, width: 1fr, height: auto, stroke: 0.5pt + luma(45%), ..args)
```

| Argument     | Description                                                                   |
| ------------ | ----------------------------------------------------------------------------- |
| `name`       | The field's name in the form data                                             |
| `label`      | Required: what a screen reader announces for the field, such as `"Full name"` |
| `value`      | The text the field starts with, set by Typst in the text's font and colour    |
| `multiline`  | Whether the field takes several lines                                         |
| `required`   | Whether the form needs a value in the field before it is submitted            |
| `max-length` | The most characters the field takes                                           |
| `password`   | Whether the viewer hides what is typed; such a field starts empty             |
| `comb`       | Whether the field has `max-length` cells, one character in each               |
| `align`      | Where the text lines up, as typed and as set: `left`, `center` or `right`     |
| `spellcheck` | Whether the viewer checks the spelling of what is typed                       |
| `scroll`     | Whether the field scrolls when the text outgrows it, or stops taking text     |
| `width`      | The box's width; by default the rest of the line                              |
| `height`     | The box's height; by default one line, or four when `multiline`               |
| `stroke`     | The box's border, and a comb field's cell borders                             |
| `..args`     | Further arguments of `box`, such as `fill` or `radius`, but not `inset`       |

### checkbox

```typ
#checkbox(name, label: none, value: "Yes", group-label: none, checked: false, required: false,
  read-only: false, export: true, size: 0.9em, stroke: 0.5pt + luma(45%), ..args)
```

| Argument      | Description                                                                     |
| ------------- | ------------------------------------------------------------------------------- |
| `name`        | The field's name in the form data                                               |
| `label`       | Required: what a screen reader announces for it, such as `"I accept the terms"` |
| `value`       | The field's value when the checkbox is ticked; `Yes` unless given, never `Off`  |
| `group-label` | For a checkbox group, what a screen reader announces for it, on one checkbox    |
| `checked`     | Whether the checkbox starts ticked                                              |
| `required`    | Whether the form needs it ticked before it is submitted                         |
| `size`        | The side of the square box                                                      |
| `stroke`      | The box's border, which the page draws beneath the field                        |
| `..args`      | Further arguments of `box`, such as `fill` or `radius`                          |

A ticked checkbox has its `value` in the form data, `Yes` unless given, an unticked one `Off`. The
tick is drawn as lines, not as a character, so checkboxes need no font. Checkboxes of one name and
different values are a checkbox group, of which the reader ticks one or none (see _Names_).

### radio

```typ
#radio(group, value, label: none, group-label: none, checked: false, required: false,
  read-only: false, export: true, size: 0.9em, stroke: 0.5pt + luma(45%), ..args)
```

| Argument      | Description                                                                    |
| ------------- | ------------------------------------------------------------------------------ |
| `group`       | The group's name in the form data; its buttons share it                        |
| `value`       | The group's value when this button is picked; not `Off`                        |
| `label`       | Required: what a screen reader announces for this option, such as `"By phone"` |
| `group-label` | What a screen reader announces for the group, given on one of its buttons      |
| `checked`     | Whether this button starts picked; buttons of one value of a group at most     |
| `required`    | Whether the form needs a button of the group picked                            |
| `size`        | The circle's diameter                                                          |

The buttons of a group become one field, of which the reader picks one button, and which keeps one
picked once picked. Its value is the picked button's `value`, or `Off` before any is picked.
Buttons of one value turn on together. The dot is drawn as a path, so radio buttons need no font
either.

```typ
Contact: #radio("contact", "email", label: "By e-mail", group-label: "Contact", checked: true) E-mail
#radio("contact", "phone", label: "By phone") Phone
```

### dropdown and list-box

```typ
#dropdown(name, label: none, options: (), value: none, editable: false, required: false,
  read-only: false, export: true, align: left, spellcheck: true, commit-on-change: false,
  width: 1fr, height: 1.5em, stroke: 0.5pt + luma(45%), ..args)
#list-box(name, label: none, options: (), value: none, multiple: false, required: false,
  read-only: false, export: true, align: left, commit-on-change: false,
  width: 1fr, height: auto, stroke: 0.5pt + luma(45%), ..args)
```

| Argument           | Description                                                                          |
| ------------------ | ------------------------------------------------------------------------------------ |
| `options`          | The options: strings, or `(value, text)` pairs that show the text and give the value |
| `value`            | The value picked from the start: one, or for a list box with `multiple` an array     |
| `editable`         | Whether the reader may type a value of their own into the drop-down list             |
| `multiple`         | Whether the reader may pick several options of the list box                          |
| `align`            | Where the text lines up: `left`, `center` or `right`                                 |
| `spellcheck`       | Whether the viewer checks the spelling of a value typed into the drop-down list      |
| `commit-on-change` | Whether a pick counts at once, rather than when the reader leaves the field          |
| `height`           | The box's height; for a list box by default as many lines as options, four at most   |

A drop-down list shows the picked option, with an arrow the page draws at its right; a list box
shows its options, line by line, the picked ones highlighted.

```typ
Country: #dropdown("country", label: "Country", options: (("de", "Germany"), ("gb", "United Kingdom")))
```

### button

```typ
#button(name, caption, label: none, action: "reset", read-only: false, press: 0.6pt, width: auto,
  height: 1.8em, stroke: 0.5pt + luma(45%), fill: luma(93%), ..args)
```

| Argument  | Description                                                                        |
| --------- | ---------------------------------------------------------------------------------- |
| `caption` | What the button shows: a string, or content such as `[*Help*]`                     |
| `label`   | What a screen reader announces for it; by default the caption, when it is a string |
| `action`  | `"reset"`, `(submit: url)`, `(submit: url, format: "pdf")` or `(link: url)`        |
| `press`   | How far the caption moves, right and down, while pressed; `0pt` for no such look   |

`"reset"` returns the fields to the values they start with: empty, unless they were given a
`value`, `checked` or a picked option, which they return to. `(submit: url)` sends the form's
values to `url` as a web form does, `format: "html"` being the default; `format: "fdf"`, `"xfdf"` or
`"pdf"` sends them in that format instead, `"pdf"` the whole filled-in PDF. `(link: url)` opens
`url`. A reset or a submit takes `fields`, the names of the fields or groups it acts on, or with
`exclude: true` the ones it leaves out; a submit also takes `empty: true` to send empty fields too,
and `method: "get"` to send a web form in the address rather than its body. A read-only button does
nothing.

```typ
#button("reset-address", "Reset the address", action: (reset: true, fields: ("address",)))
#button("send", "Send", action: (submit: "https://example.org/apply", method: "get"))
```

A push button has no value. Pressed, it shows its caption moved by `press`, as a button is pushed
in; with `press: 0pt` it has no pressed look of its own, and the viewer highlights it its own way.
PDF/A forbids actions on fields, so `addFields` refuses push buttons in a PDF/A file.

### signature-field

```typ
#signature-field(name, label: none, required: false, lock: none, width: 6cm, height: 1.6cm,
  stroke: 0.5pt + luma(45%), ..args)
```

A box the reader signs in, in their PDF viewer. `addFields` makes the field; the signing is the
viewer's, which appends the signature to the PDF, as `addFields` appended the fields. `lock` names
the fields signing makes read-only: `"all"`, an array of field or group names, or
`(except: names)` all but those.

### Names

A field's name is its name in the form data. Boxes that share a name are one field:

- **Fields of other kinds in several places.** A text field, a choice field or a button of one name
  in several places is one field, shown in each, such as a name typed once and repeated on every
  page. Its boxes have to agree in everything but their size; a signature field is in one place
  only.
- **Checkbox groups.** Checkboxes of one name and different values are one field, of which the
  reader ticks one or none; its value is the ticked checkbox's. Each checkbox's `label` names it,
  `group-label` the group.
- **Radio groups.** Radio buttons of one name are one field, of which the reader picks one.

Periods group names: `address.street` and `address.city` are the fields `street` and `city` of a
group `address`, which a reset, a submit or a lock can name to act on all of them. A name cannot be
a field's and a group's at once.

```typ
Street: #text-field("address.street", label: "Street")
City: #text-field("address.city", label: "City")
```

### Previews

The ticks of checkboxes, the dots of radio buttons and the highlight of a list box's picked options
are drawn by the fields, so a preview made without `addFields`, such as an SVG, shows the boxes
empty. Set the input `previewInput` names, `"fields-preview"`, to `"true"` for the preview, and the
library draws them on the page instead:

```js
import { previewInput } from '@jsfi/typst-fields';

compiler.setInputs({ ...inputs, [previewInput]: 'true' });
const { svg } = compiler.compileSvg();
```

Never set it for the PDF given to `addFields`: the page would show them beneath the fields, whatever
the reader changes.

### How a box is marked

A box is marked with a link to `typst-field:` and the field's settings as JSON. Typst places a link
on the page and in the structure tree as PDF/UA-1 wants a field placed, so `addFields` turns the
link into the field without moving anything. What Typst sets inside the box is tagged as the link's
content, which is how `addFields` finds it. The buttons of a radio group become the widgets of one
field, each with its own label as the alternative text of its structure element. Without
`addFields`, a box stays a box, what Typst set printed in it, with a link that leads nowhere.

### Not supported

Fields always print. Annotations carry flags that show a field only on screen or only in print, but
PDF/A requires every field to print (ISO 19005-2 §6.3.2), and a form is printed to be filled in by
hand as well; so the package keeps the flag Typst gives the box, which prints.

Calculations, formats and checks of values, fields that show or hide others, file uploads, rich text
and constraints on signing are out of scope: they need JavaScript or features most viewers lack, and
without them the form would look broken rather than plain.

## addFields()

```ts
addFields(pdf: Uint8Array, options?: FieldOptions): Uint8Array
addFieldsAsync(pdf: Uint8Array, options?: FieldOptions): Promise<Uint8Array>
```

`addFields` returns the PDF with its fields, or `pdf` itself when it marks none. The fields are
appended as an incremental update: the PDF's bytes stay as they are, and the new and changed objects
follow them. It throws for what it cannot do: a value, a list's options or a caption in an untagged
PDF, fields of one name that cannot be one field, a group with several values checked, a name that
an action or a lock gives and no field has, a push button in a PDF/A file, a PDF that has a form
already.

| Option    | Type                               | Description                  |
| --------- | ---------------------------------- | ---------------------------- |
| `inflate` | `(data: Uint8Array) => Uint8Array` | Decompresses zlib data       |
| `deflate` | `(data: Uint8Array) => Uint8Array` | Compresses data as zlib data |

### inflate and deflate

The package brings no compression of its own: `inflate` and `deflate` are the caller's, and work on
zlib data (RFC 1950), as PDFs store it. `addFields` calls them only when it needs them:

- `inflate` for the PDFs of `@jsfi/typst-wasm`, which store their objects in compressed object
  streams, and for the pages of fields with values, in the PDFs of either package.
- `deflate` for fields with values, whose pages and appearances `addFields` writes compressed, as
  Typst wrote them.

So a form of empty fields from `@jsfi/typst-cli` needs neither. Any of these fits:

```js
// Node
import { deflateSync, inflateSync } from 'node:zlib';
addFields(pdf, { inflate: inflateSync, deflate: deflateSync });

// Node and browsers, with fflate
import { unzlibSync, zlibSync } from 'fflate';
addFields(pdf, { inflate: unzlibSync, deflate: zlibSync });

// Browsers and Node, without a dependency: the streams are asynchronous
const through = async (data, transform) =>
	new Uint8Array(
		await new Response(new Blob([data]).stream().pipeThrough(transform)).arrayBuffer(),
	);
await addFieldsAsync(pdf, {
	inflate: (data) => through(data, new DecompressionStream('deflate')),
	deflate: (data) => through(data, new CompressionStream('deflate')),
});
```

`addFieldsAsync` is `addFields` for an `inflate` and a `deflate` that return promises.

## Examples

The [browser example](https://github.com/jsfi/typst-js/tree/main/examples/browser#readme) has a form among its examples, `form`, whose
PDF download has fillable fields, prefilled or empty as its control says. Its service worker runs
`addFieldsAsync` with the browser's compression streams.

## License

Apache License 2.0 ([`LICENSE`](https://github.com/jsfi/typst-js/blob/main/packages/typst-fields/LICENSE)).
