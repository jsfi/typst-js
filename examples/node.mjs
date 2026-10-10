// Compiles a small document to PDF and SVG with @jsfi/typst-wasm and writes the PDF to out.pdf beside
// this script. demo.mjs, which has the steps, has to lie beside it as well.
import { readFile, writeFile } from 'node:fs/promises';

import { Compiler, initSync } from '@jsfi/typst-wasm';
import { defaultFontUrls } from '@jsfi/typst-wasm/fonts';

import { runExampleSteps } from './demo.mjs';

initSync({
	module: await readFile(new URL(import.meta.resolve('@jsfi/typst-wasm/typst_wasm_bg.wasm'))),
});

const compiler = new Compiler();
// Typst's default fonts ship beside the module for the host to load.
for (const url of defaultFontUrls) compiler.addFont(await readFile(url));
console.log(`fonts loaded by the host: ${defaultFontUrls.length}`);

await writeFile(new URL('out.pdf', import.meta.url), runExampleSteps(compiler));
