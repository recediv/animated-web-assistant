import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prepareCompiledTree } from '../../scripts/transpile.mjs';

const workspace = resolve(import.meta.dirname, '../..');
const [first, second] = await Promise.all([
  prepareCompiledTree('cachecheck', ['demo']),
  prepareCompiledTree('cachecheck', ['demo']),
]);
assert.notEqual(first, second, 'concurrent runners never share a compilation tree');
const original = await readFile(resolve(second, 'demo/products.js'), 'utf8');
await writeFile(resolve(first, 'demo/products.js'), 'private fixture');
assert.equal(await readFile(resolve(second, 'demo/products.js'), 'utf8'), original);
await assert.rejects(prepareCompiledTree('../unsafe', ['demo']), /Unsafe compilation/);
await assert.rejects(prepareCompiledTree('cachecheckfailure', ['../outside']), /inside workspace/);
assert.equal(
  (await readdir(resolve(workspace, '.local/compilation'))).some((name) => name.startsWith('.tmp-cachecheckfailure-')),
  false,
  'failed setup removes its own partial tree',
);
console.log(
  'PASS compilation caches: isolated concurrent runners, guarded paths, failed-setup cleanup; successful trees cleaned on process exit.',
);
