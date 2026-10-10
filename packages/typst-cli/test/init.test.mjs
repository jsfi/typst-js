// init() and initSync(), the one part of @jsfi/typst-cli's API that differs from the module's.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { describe, test } from 'node:test';

import { cli, hasCli } from './helpers.mjs';

describe('init', () => {
	function run(code, env = process.env) {
		return spawnSync(
			process.execPath,
			['--input-type=module', '--eval', `const m = await import("@jsfi/typst-cli"); ${code}`],
			{ cwd: new URL('..', import.meta.url), env, encoding: 'utf8' },
		);
	}

	test(
		'selects the CLI on the PATH and reports its version',
		{ skip: !hasCli && 'no typst CLI on the PATH' },
		async () => {
			const { path, version } = await cli.default();
			assert.ok(isAbsolute(path), path);
			assert.match(spawnSync(path, ['--version'], { encoding: 'utf8' }).stdout, /^typst /);
			assert.match(version, /^\d+\.\d+\.\d+$/);
		},
	);

	test('throws without a CLI on the PATH', () => {
		assert.match(
			run('await m.default();', { ...process.env, PATH: '/nonexistent' }).stderr,
			/The typst CLI is not on the PATH/,
		);
	});

	test('throws for a CLI that cannot be run', () => {
		assert.match(
			run('m.initSync({ typstPath: "/nonexistent/typst" });').stderr,
			/The typst CLI at \/nonexistent\/typst could not be run/,
		);
	});

	test(
		"by default, Typst's embedded fonts render text without any font added",
		{ skip: !hasCli && 'no typst CLI on the PATH' },
		() => {
			const output = run(`
				m.initSync();
				const compiler = new m.Compiler();
				compiler.addFile('/main.typ', new TextEncoder().encode('Hallo'));
				compiler.setMain('/main.typ');
				const { pdf, diagnostics } = compiler.compilePdf();
				console.log(JSON.stringify({ pdf: pdf !== undefined, diagnostics }));
			`).stdout;
			const { pdf, diagnostics } = JSON.parse(output);
			assert.equal(pdf, true);
			assert.deepEqual(diagnostics, []);
		},
	);

	test('throws for an invalid typstPath', () => {
		assert.match(
			run('m.initSync({ typstPath: 5 });').stderr,
			/InitOptions\.typstPath must be a string/,
		);
	});

	test('throws for an invalid ignoreEmbeddedFonts', () => {
		assert.match(
			run('m.initSync({ ignoreEmbeddedFonts: "yes" });').stderr,
			/InitOptions\.ignoreEmbeddedFonts must be a boolean/,
		);
	});

	test('a compiler needs init() first', () => {
		assert.match(run('new m.Compiler();').stderr, /call init\(\) or initSync\(\) first/);
	});
});
