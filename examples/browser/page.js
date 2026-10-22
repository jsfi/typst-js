// The page: posts the source to the service worker, shows the preview, the diagnostics and the
// outline, and offers the downloads.

import { inputValues, renderControls } from './controls.js';
import { DiagnosticList } from './diagnostic-list.js';
import { EXAMPLES } from './examples.js';
import { Outline, OUTLINE_QUERY } from './outline.js';
import { COMPILE_PATH, compileRequest, readPdfAnswer } from './protocol.js';
import { serviceWorker } from './registration.js';

const editor = document.querySelector('#source');
const exampleSelect = document.querySelector('#example');
const exampleControls = document.querySelector('#example-controls');
const controlsNote = document.querySelector('#controls-note');
const statusLine = document.querySelector('#status');
const pages = document.querySelector('#pages');
const diagnosticList = new DiagnosticList(document.querySelector('#diagnostics'), editor);
const outline = new Outline(
	document.querySelector('#outline'),
	document.querySelector('#outline-list'),
	pages,
);
const download = document.querySelector('#download');
const downloadSvg = document.querySelector('#download-svg');
const tagged = document.querySelector('#tagged');
const compileUrl = new URL(COMPILE_PATH, location.href);

let pageUrls = [];
let svgPages = [];
let timer;
/** Counts the previews started, so that an answer arriving after a newer one's is dropped. */
let previews = 0;
/** Counts the examples loaded, so that a slower earlier load does not replace a later one. */
let loads = 0;

const selectedExample = () => EXAMPLES.find((example) => example.id === exampleSelect.value);

function schedulePreview() {
	clearTimeout(timer);
	timer = setTimeout(() => reportFailure(preview()), 300);
}

/** Shows on the status line why `work` failed, if it does: the worker may not be reachable. */
async function reportFailure(work) {
	try {
		await work;
	} catch (error) {
		statusLine.textContent = error.message;
	}
}

/** Posts a request for `source` with the controls' inputs to the service worker. */
function post(source, fields) {
	return fetch(compileUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(
			compileRequest({
				source,
				tagged: tagged.checked,
				inputs: inputValues(exampleControls),
				...fields,
			}),
		),
	});
}

/** The JSON answer to a request for `source`. */
async function postForJson(source, fields) {
	return (await post(source, fields)).json();
}

/** The status line when the service worker itself failed. */
function workerFailed(error) {
	statusLine.textContent = `The service worker failed: ${error}`;
}

function svgBlob(page) {
	return new Blob([page], { type: 'image/svg+xml' });
}

function save(blob, name) {
	const link = document.createElement('a');
	link.href = URL.createObjectURL(blob);
	link.download = name;
	link.click();
	setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** Selects the example a link names with `?example=…`, if it is one of them. */
function exampleFromLink() {
	const requested = new URLSearchParams(location.search).get('example');
	if (EXAMPLES.some((example) => example.id === requested)) {
		exampleSelect.value = requested;
	}
}

/** Puts the selected example into the address, so the link opens it. */
function linkToExample() {
	const url = new URL(location.href);
	url.searchParams.set('example', exampleSelect.value);
	history.replaceState(null, '', url);
}

/**
 * Puts the selected example's source into the editor and its controls above it. Returns `false` if
 * another example was selected meanwhile, whose load then takes over.
 */
async function loadExample() {
	const generation = ++loads;
	const example = selectedExample();
	const response = await fetch(`samples/${example.id}.typ`);
	if (!response.ok) throw new Error(`The example ${example.id} could not be loaded.`);
	const source = await response.text();
	if (generation !== loads) return false;
	editor.value = source;
	renderControls(exampleControls, controlsNote, example.controls, schedulePreview);
	return true;
}

/**
 * Compiles the editor's source to SVG and shows the pages, the diagnostics and the outline; an
 * answer that arrives after a newer preview started is dropped.
 */
async function preview() {
	const generation = ++previews;
	const text = editor.value;
	const { svg, diagnostics, milliseconds, error } = await postForJson(text, { format: 'svg' });
	if (generation !== previews) return;
	if (error) {
		workerFailed(error);
		return;
	}
	diagnosticList.show(diagnostics, text);
	if (!svg) {
		statusLine.textContent = 'The source has errors.';
		downloadSvg.disabled = true;
		outline.hide();
		return;
	}
	showPages(svg);
	statusLine.textContent = `${svg.length} page${svg.length === 1 ? '' : 's'}, compiled in ${milliseconds} ms.`;
	await updateOutline(generation, text);
}

/** Shows the SVG pages, releasing the previous ones, and offers them for download. */
function showPages(svg) {
	svgPages = svg;
	downloadSvg.disabled = false;
	for (const url of pageUrls) URL.revokeObjectURL(url);
	pageUrls = svg.map((page) => URL.createObjectURL(svgBlob(page)));
	pages.replaceChildren(
		...pageUrls.map((url, index) => {
			const image = document.createElement('img');
			image.src = url;
			image.alt = `Page ${index + 1}`;
			return image;
		}),
	);
}

/** Shows the outline of an example that publishes one, unless preview `generation` is outdated. */
async function updateOutline(generation, text) {
	if (!selectedExample().outline) {
		outline.hide();
		return;
	}
	const { value } = await postForJson(text, { format: 'query', ...OUTLINE_QUERY });
	if (generation !== previews) return;
	outline.show(value);
}

/**
 * Shows the diagnostics of a download compiled from `text`, unless the source has changed since:
 * then a newer preview's diagnostics stand.
 */
function showCurrentDiagnostics(diagnostics, text) {
	if (editor.value === text) diagnosticList.show(diagnostics, text);
}

async function downloadPdf() {
	download.disabled = true;
	try {
		const text = editor.value;
		const response = await post(text, { format: 'pdf', fields: selectedExample().fields });
		if (!response.ok) {
			const { diagnostics, error } = await response.json();
			if (error) {
				workerFailed(error);
				return;
			}
			showCurrentDiagnostics(diagnostics, text);
			statusLine.textContent = 'The source has errors.';
			return;
		}
		const { pdf, diagnostics, milliseconds } = await readPdfAnswer(response);
		showCurrentDiagnostics(diagnostics, text);
		save(pdf, `${exampleSelect.value}.pdf`);
		statusLine.textContent = `PDF of ${Math.round(pdf.size / 1024)} kB, compiled in ${milliseconds} ms.`;
	} finally {
		download.disabled = false;
	}
}

try {
	for (const example of EXAMPLES) exampleSelect.add(new Option(example.label, example.id));
	exampleFromLink();
	await serviceWorker(statusLine);
	await loadExample();
	// The page answers edits and choices even if the first preview fails.
	exampleSelect.addEventListener('change', () => {
		linkToExample();
		void reportFailure(
			(async () => {
				if (await loadExample()) await preview();
			})(),
		);
	});
	editor.addEventListener('input', schedulePreview);
	download.addEventListener('click', () => reportFailure(downloadPdf()));
	downloadSvg.addEventListener('click', () => {
		svgPages.forEach((page, index) =>
			save(svgBlob(page), `${exampleSelect.value}-${index + 1}.svg`),
		);
	});
	download.disabled = false;
	statusLine.textContent = 'Compiling…';
	await reportFailure(preview());
} catch (error) {
	statusLine.textContent = error.message;
}
