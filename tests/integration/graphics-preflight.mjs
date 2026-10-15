import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import { prepareCompiledTree } from '../../scripts/transpile.mjs';

// Actual configuration, images, manifest and character code; JSDOM supplies
// the DOM, with decoded WebP dimensions supplied by Sharp instead of a browser.
const root = resolve(import.meta.dirname, '../..');
const configuration = JSON.parse(await readFile(resolve(root, 'demo/assistant.config.json'), 'utf8'));
const resources = new Map([
  ['atlas.json', ['assets/exported/atlas.json', 'application/json']],
  ['atlas.webp', ['assets/exported/atlas.webp', 'image/webp']],
  ['poster.webp', ['assets/exported/poster.webp', 'image/webp']],
]);
const requests = [];
let failure = '';
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  requests.push(path);
  if (path === '/demo/assistant.config.json') {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ...configuration, behavior: 'calm' }));
    return;
  }
  const name = path.split('/').at(-1);
  const resource = resources.get(name);
  if (!resource || name === failure) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', resource[1]);
  response.end(await readFile(resolve(root, resource[0])));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const compiled = await prepareCompiledTree('graphicspreflight', ['src', 'demo']);
async function rewrite(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = resolve(directory, entry.name);
    if (entry.isDirectory()) await rewrite(filename);
    else if (entry.name.endsWith('.js')) {
      let code = (await readFile(filename, 'utf8')).replace(/^import ['"].*\.css['"];?\s*$/gm, '');
      code = code.replace(/(from\s+['"]|import\s*\(\s*['"])(\.{1,2}\/[^'"]+)(['"])/g,
        (_match, start, path, end) => `${start}${extname(path) ? path : `${path}.js`}${end}`);
      if (filename === resolve(compiled, 'src/core/runtime.js'))
        code = 'globalThis.__graphicsRuntimeImports = (globalThis.__graphicsRuntimeImports ?? 0) + 1;\n' + code;
      await writeFile(filename, code);
    }
  }
}
await rewrite(compiled);
const dom = new JSDOM('<!doctype html><main>Shop</main>', { url: origin, pretendToBeVisual: true });
const { window } = dom;
const nativeFetch = globalThis.fetch;
let availableCanvas = true;
let frames = 0;
const imageRequests = [];
const decodedImages = new Set();
const decodes = new Map();
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.HTMLDialogElement.prototype.show = function () { this.open = true; };
window.HTMLDialogElement.prototype.showModal = window.HTMLDialogElement.prototype.show;
window.HTMLDialogElement.prototype.close = function () { this.open = false; };
window.HTMLCanvasElement.prototype.getContext = function () {
  return availableCanvas ? { drawImage(image) { assert.ok(decodedImages.has(image)); }, save() {}, restore() {}, translate() {}, scale() {} } : null;
};
const source = Object.getOwnPropertyDescriptor(window.HTMLImageElement.prototype, 'src');
Object.defineProperty(window.HTMLImageElement.prototype, 'src', {
  configurable: true, get: source.get,
  set(value) {
    source.set.call(this, value);
    if (!value) return;
    const href = this.src;
    imageRequests.push(href);
    void nativeFetch(href).then(async (response) => {
      if (!response.ok) throw new Error('Image unavailable');
      const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
      this._decodedWidth = metadata.width;
      this._decodedHeight = metadata.height;
      if (this.src === href) this.dispatchEvent(new window.Event('load'));
    }).catch(() => { if (this.src === href) this.dispatchEvent(new window.Event('error')); });
  },
});
Object.defineProperty(window.HTMLImageElement.prototype, 'naturalWidth', { get() { return this._decodedWidth ?? 0; } });
Object.defineProperty(window.HTMLImageElement.prototype, 'naturalHeight', { get() { return this._decodedHeight ?? 0; } });
window.HTMLImageElement.prototype.decode = async function () {
  assert.ok(this.naturalWidth && this.naturalHeight);
  decodedImages.add(this);
  decodes.set(this, (decodes.get(this) ?? 0) + 1);
};
const createElement = window.document.createElement.bind(window.document);
window.document.createElement = (...args) => {
  const element = createElement(...args);
  if (args[0] === 'link') queueMicrotask(() => element.dispatchEvent(new window.Event('load')));
  return element;
};
for (const key of ['document', 'customElements', 'HTMLElement', 'HTMLDialogElement', 'HTMLInputElement', 'HTMLImageElement', 'Image', 'Storage', 'DOMException', 'AbortController', 'AbortSignal']) globalThis[key] = window[key];
globalThis.window = window;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.fetch = (url, options) => nativeFetch(new URL(url, origin), options);
globalThis.requestAnimationFrame = () => { frames += 1; return frames; };
globalThis.cancelAnimationFrame = () => {};
let instance;
try {
  const { init } = await import(pathToFileURL(resolve(compiled, 'src/index.js')).href);
  const { createDemoAdapter } = await import(pathToFileURL(resolve(compiled, 'src/adapters/demo.js')).href);
  const adapter = createDemoAdapter({ context: { permissions: { persistentSettings: false } } });
  const originalDom = document.documentElement.innerHTML;
  availableCanvas = false;
  instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
  assert.equal(imageRequests.length, 0);
  await instance.destroy();
  availableCanvas = true;
  for (failure of ['poster.webp', 'atlas.webp', 'atlas.json']) {
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    assert.equal(globalThis.__graphicsRuntimeImports ?? 0, 0);
    assert.equal(document.documentElement.innerHTML, originalDom);
    assert.equal(adapter.subscriberCount, 0);
    assert.equal(frames, 0);
    await instance.restore();
    assert.equal(document.querySelector('anime-shop-assistant'), null);
    await instance.destroy();
  }
  failure = '';
  imageRequests.length = 0;
  requests.length = 0;
  instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
  const host = document.querySelector('anime-shop-assistant');
  assert.ok(host);
  assert.equal(globalThis.__graphicsRuntimeImports, 1);
  assert.equal(adapter.subscriberCount, 1);
  assert.equal(imageRequests.length, 2, 'prepared images are not requested again');
  assert.equal(requests.filter((path) => path.endsWith('atlas.json')).length, 1);
  assert.ok(decodedImages.has(host.poster), 'the decoded poster itself is attached');
  assert.equal(decodes.get(host.poster), 1);
  assert.equal(host.shadowRoot.querySelector('.pika-a-fallback'), null);
  host.poster.dispatchEvent(new window.Event('error'));
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
  assert.equal(document.querySelectorAll('anime-shop-assistant').length, 0);
  assert.equal(document.querySelector('[data-anime-assistant-styles]'), null);
  assert.equal(adapter.subscriberCount, 0);
  adapter.confirmCartAdd('after-graphics-failure');
  assert.equal(adapter.getContext().cartCount, 1, 'the store still operates');
  console.log('PASS graphics preflight: real HTTP/WebP failures leave runtime unloaded; success reuses decoded assets; late failure removes UI and preserves the store.');
} finally {
  await instance?.destroy();
  globalThis.fetch = nativeFetch;
  window.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
