import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import assert from 'node:assert/strict';
import { verifyDistribution } from './check-distribution.mjs';

const resources = await verifyDistribution(resolve(import.meta.dirname, '../dist'));
console.log(`Production resources verified: ${JSON.stringify(resources)}`);

const source = await readFile(
  resolve(import.meta.dirname, '../dist/assistant/1.0.0/assistant.iife.js'),
  'utf8',
);
const context = createContext({ HTMLElement: class {} });
runInContext(source, context, { timeout: 1000 });
assert.equal(typeof context.AnimeShopAssistant?.init, 'function');
assert.equal(typeof context.AnimeShopAssistant?.validateConfig, 'function');
assert.equal(context.AnimeShopAssistant.default.init, context.AnimeShopAssistant.init);
const instance = await context.AnimeShopAssistant.init({ configUrl: '/invalid', adapter: null });
for (const method of ['open', 'close', 'hide', 'restore', 'destroy'])
  assert.equal(typeof instance[method], 'function');
await instance.destroy();
console.log(
  'IIFE export AnimeShopAssistant.init and safe unsupported-environment fallback verified.',
);
