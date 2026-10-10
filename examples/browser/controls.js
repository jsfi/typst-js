// The controls of the selected example: inputs whose values reach the document as `sys.inputs`.

/**
 * Builds `controls` into `container`, explains in `note` what they set, and calls `onChange` on
 * every change.
 */
export function renderControls(container, note, controls, onChange) {
	container.replaceChildren(...controls.map((control) => controlElement(control, onChange)));
	container.hidden = controls.length === 0;
	const names = controls.map((control) => `sys.inputs.${control.input}`);
	note.hidden = names.length === 0;
	note.textContent =
		`These controls do not change the Typst source. They set ${names.join(' and ')}, which the source reads; ` +
		'every change recompiles the same source with the new values.';
}

/** A slider for `input` from `min` to `max`; its value is shown beside it, with `unit`. */
export function range(input, label, { min, max, step, value, unit }) {
	return { input, label, type: 'range', min, max, step, value, unit };
}

/** A number field for `input` from `min` to `max`, starting at `value`. */
export function number(input, label, { min, max, value }) {
	return { input, label, type: 'number', min, max, step: 1, value };
}

/** A dropdown for `input` with `options`, `[value, text]` pairs. */
export function select(input, label, options) {
	return { input, label, type: 'select', options };
}

/** What the document sees as `sys.inputs`: the values of the controls in `container`. */
export function inputValues(container) {
	return Object.fromEntries(
		[...container.querySelectorAll('[data-input]')].map((element) => [
			element.dataset.input,
			element.value,
		]),
	);
}

/**
 * How each type of control is built: its element, the event a change fires, and whether its value
 * is shown beside it.
 */
const KINDS = {
	select: {
		create: (control) => {
			const element = document.createElement('select');
			for (const [value, text] of control.options) element.add(new Option(text, value));
			return element;
		},
		event: 'change',
	},
	number: { create: inputElement, event: 'input' },
	range: { create: inputElement, event: 'input', showsValue: true },
};

function inputElement({ type, min, max, step, value }) {
	const element = document.createElement('input');
	Object.assign(element, { type, min, max, step });
	element.value = value;
	return element;
}

/** A labeled control; a range shows its value, with its unit, besides it. */
function controlElement(control, onChange) {
	const kind = KINDS[control.type];
	const id = `input-${control.input}`;
	const label = document.createElement('label');
	label.htmlFor = id;
	label.textContent = control.label;
	const element = kind.create(control);
	element.id = id;
	element.dataset.input = control.input;
	const parts = [label, element];
	if (kind.showsValue) {
		const output = document.createElement('output');
		output.htmlFor = id;
		const show = () => {
			output.textContent = `${element.value}${control.unit ?? ''}`;
		};
		show();
		element.addEventListener('input', show);
		parts.push(output);
	}
	element.addEventListener(kind.event, onChange);
	const group = document.createElement('span');
	group.className = 'control';
	group.append(...parts);
	return group;
}
