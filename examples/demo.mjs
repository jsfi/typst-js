// The steps the Node example takes with a compiler: a document with an included chapter to PDF and
// SVG, a recompilation after an edit, and the diagnostics of an error.

const encoder = new TextEncoder();

/** Runs `step` and returns its result with how long it took, in whole milliseconds. */
function timed(step) {
	const started = performance.now();
	const result = step();
	return [result, (performance.now() - started).toFixed(0)];
}

/** Compiles to a PDF, `tagged` or not, prints how long it took and how large it is, returns it. */
function compilePdf(compiler, tagged) {
	const [{ pdf }, ms] = timed(() => compiler.compilePdf({ tagged }));
	console.log(`${tagged ? 'tagged' : 'untagged'} PDF: ${ms} ms, ${pdf?.length} bytes`);
	return pdf;
}

/** Runs the steps with `compiler` and returns the first, tagged PDF. */
export function runExampleSteps(compiler) {
	compiler.addFile(
		'/main.typ',
		encoder.encode(`
#set page(paper: "a5")
#set text(lang: "de")
= Hallo aus Node
Heute ist #datetime.today().display().

$ sum_(k=1)^n k = (n(n+1)) / 2 $

#include "chapter.typ"
`),
	);
	compiler.addFile('/chapter.typ', encoder.encode('== Kapitel\n#lorem(40)'));
	compiler.setMain('/main.typ');

	const pdf = compilePdf(compiler, true);
	compilePdf(compiler, false);

	compiler.addFile('/chapter.typ', encoder.encode('== Kapitel\n#lorem(41)'));
	const [{ svg }, ms] = timed(() => compiler.compileSvg());
	console.log(`edited SVG: ${ms} ms, ${svg?.length} page(s)`);

	compiler.addFile('/chapter.typ', encoder.encode('== Kapitel\n#undefined-thing'));
	for (const { severity, message, path, line, column } of compiler.compilePdf().diagnostics) {
		const place = path === undefined ? '' : `${path}:${line}:${column}: `;
		console.log(`${severity}: ${place}${message}`);
	}
	return pdf;
}
