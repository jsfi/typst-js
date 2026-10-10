// Both packages export the same API: the same exports, and the same members on every object.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { cli, hasCli, wasm } from './helpers.mjs';

describe('both packages export one API', () => {
	/** The names of a module's exports and of each class's members an instance offers. */
	function surface(module, instances) {
		const members = (object) => {
			const names = new Set();
			for (let o = object; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
				for (const key of Reflect.ownKeys(o)) {
					if (key !== 'constructor' && !(typeof key === 'string' && key.startsWith('__'))) {
						names.add(String(key));
					}
				}
			}
			return [...names].toSorted((a, b) => a.localeCompare(b));
		};
		return {
			exports: Object.keys(module).toSorted((a, b) => a.localeCompare(b)),
			members: Object.fromEntries(
				Object.entries(instances).map(([name, value]) => [name, members(value)]),
			),
		};
	}

	test(
		'the same exports, and the same members on every object',
		{ skip: !hasCli && 'no typst CLI on the PATH' },
		() => {
			const objects = (module) => {
				const compiler = new module.Compiler();
				compiler.setMain('/missing.typ');
				const failed = compiler.compilePdf();
				return surface(module, {
					Compiler: compiler,
					CompileResult: failed,
					QueryResult: compiler.query('heading'),
					Diagnostic: failed.diagnostics[0],
				});
			};
			const module = objects(wasm);
			const ofCli = objects(cli);
			assert.deepEqual(ofCli, module);
		},
	);
});
