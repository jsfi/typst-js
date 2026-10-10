// Compiles a small document to PDF and SVG with @jsfi/typst-cli, which runs the `typst` program with
// the fonts it embeds, Typst's defaults, and writes the PDF to out-cli.pdf beside this script.
// demo.mjs, which has the steps, has to lie beside it as well.
//
// The program writes tagged PDFs without the object streams of @jsfi/typst-wasm, so its PDFs are
// larger than the module's, and leaving the tags out saves more than it does there.
import { writeFile } from 'node:fs/promises';

import { Compiler, initSync } from '@jsfi/typst-cli';

import { runExampleSteps } from './demo.mjs';

// Finds `typst` on the PATH, or at `typstPath`, and checks its version.
const { path, version } = initSync();
console.log(`typst ${version} at ${path}`);

await writeFile(new URL('out-cli.pdf', import.meta.url), runExampleSteps(new Compiler()));
