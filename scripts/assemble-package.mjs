// Completes pkg/ after wasm-bindgen and wasm-opt: Typst's default fonts with their list, the NOTICE
// file and the package.json of @jsfi/typst-wasm, from what `cargo metadata` says the module is built
// from. build.sh runs it:
//
//   node scripts/assemble-package.mjs target/wasm-metadata.json pkg

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

const [metadataPath, out] = process.argv.slice(2);
const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
const crate = (name) => metadata.packages.find((p) => p.name === name);

copyFonts();
writeNotice();
writeManifest();

/**
 * Typst's default fonts from the typst-assets crate, and `fonts/index.json` with their names, so
 * that a host can load every font without knowing them in advance.
 */
function copyFonts() {
	const source = join(dirname(crate('typst-assets').manifest_path), 'files', 'fonts');
	const names = readdirSync(source)
		.filter((name) => /\.(otf|ttf)$/.test(name))
		.toSorted();
	mkdirSync(join(out, 'fonts'), { recursive: true });
	for (const name of names) copyFileSync(join(source, name), join(out, 'fonts', name));
	writeFileSync(join(out, 'fonts', 'index.json'), `${JSON.stringify(names)}\n`);
	// `@jsfi/typst-wasm/fonts`: the fonts' URLs, which Node reads and a browser fetches alike.
	writeFileSync(
		join(out, 'fonts', 'index.js'),
		`/** The URLs of Typst's default fonts, for \`addFont\`. */\nexport const defaultFontUrls = ${JSON.stringify(names)}.map((name) => new URL(name, import.meta.url));\n`,
	);
	writeFileSync(
		join(out, 'fonts', 'index.d.ts'),
		"/** The URLs of Typst's default fonts, for `addFont`. */\nexport declare const defaultFontUrls: URL[];\n",
	);
}

/**
 * NOTICE: ours, then Typst's (its repository's, which the crate does not ship), then that of every
 * compiled-in crate that carries one, as the Apache License 2.0 requires them to be passed on.
 */
function writeNotice() {
	const rule =
		'\n================================================================================\n';
	const parts = [
		readFileSync('NOTICE', 'utf8'),
		`${rule}Typst (https://github.com/typst/typst):\n\n${readFileSync('licenses/typst-NOTICE', 'utf8')}`,
	];
	const used = new Set(metadata.resolve.nodes.map((node) => node.id));
	const crates = metadata.packages
		.filter((p) => used.has(p.id) && p.source)
		.toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	for (const p of crates) {
		const notice = join(dirname(p.manifest_path), 'NOTICE');
		if (existsSync(notice))
			parts.push(`${rule}${p.name} ${p.version}:\n\n${readFileSync(notice, 'utf8')}`);
	}
	writeFileSync(join(out, 'NOTICE'), parts.join(''));
}

/** The package version is the crate's; the Typst version, in the description, the locked crate's. */
function writeManifest() {
	const manifest = {
		name: '@jsfi/typst-wasm',
		version: crate('typst_wasm').version,
		description: `Typst ${crate('typst').version} compiled to WebAssembly: an in-memory compiler to PDF and SVG for Node and browsers`,
		keywords: ['typst', 'pdf', 'svg', 'typesetting', 'webassembly', 'wasm'],
		license: 'Apache-2.0',
		author: 'Martin Göttsche',
		homepage: 'https://github.com/jsfi/typst-js/tree/main/packages/typst-wasm#readme',
		bugs: { url: 'https://github.com/jsfi/typst-js/issues' },
		repository: {
			type: 'git',
			url: 'git+https://github.com/jsfi/typst-js.git',
			directory: 'packages/typst-wasm',
		},
		type: 'module',
		main: './typst_wasm.js',
		types: './typst_wasm.d.ts',
		exports: {
			'.': { types: './typst_wasm.d.ts', default: './typst_wasm.js' },
			'./typst_wasm_bg.wasm': './typst_wasm_bg.wasm',
			'./fonts': { types: './fonts/index.d.ts', default: './fonts/index.js' },
			'./fonts/*': './fonts/*',
			'./package.json': './package.json',
		},
		files: [
			'typst_wasm.js',
			'typst_wasm.d.ts',
			'typst_wasm_bg.wasm',
			'typst_wasm_bg.wasm.d.ts',
			'fonts',
			'NOTICE',
			'THIRD_PARTY_LICENSES.md',
		],
		sideEffects: false,
		engines: { node: '>=22.12' },
		publishConfig: { access: 'public' },
	};
	writeFileSync(join(out, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
