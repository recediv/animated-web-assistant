import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { prepareCompiledTree } from '../../scripts/transpile.mjs';

// Compare real DOM writes, not frame rates or native browser layout.
const workspace = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(workspace);
const root = await prepareCompiledTree('rendermutations', ['src']);
async function rewrite(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await rewrite(path);
    else if (entry.name.endsWith('.js')) {
      const source = await readFile(path, 'utf8');
      await writeFile(path, source.replace(/(from\s+['"]|import\s*\(\s*['"])(\.{1,2}\/[^'"]+)(['"])/g,
        (_match, prefix, name, suffix) => `${prefix}${extname(name) ? name : name + '.js'}${suffix}`));
    }
  }
}
await rewrite(root);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shop.example/' });
const window = dom.window;
for (const key of ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'customElements', 'AbortController'])
  globalThis[key] = key === 'window' ? window : window[key];
let view;
try {
  const { createAssistantElement } = await import(pathToFileURL(resolve(root, 'src/ui/element.js')).href);
  const { validateConfig } = await import(pathToFileURL(resolve(root, 'src/config/validate.js')).href);
  const { createDemoAdapter } = await import(pathToFileURL(resolve(root, 'src/adapters/demo.js')).href);
  const fixture = JSON.parse(await readFile('demo/assistant.config.json', 'utf8'));
  const config = validateConfig({ ...fixture, behavior: 'calm' }, window.location.href).config;
  assert.ok(config);
  view = createAssistantElement();
  window.document.body.append(view);
  const nothing = () => {};
  const ready = view.setup(config, {
    toggle: nothing, close: nothing, screen: nothing, navigate: nothing, cart: nothing,
    motion: nothing, hide: nothing, holdGreeting: nothing,
  });
  view.shadow.querySelector('link').dispatchEvent(new window.Event('load'));
  assert.equal(await ready, true);
  const context = createDemoAdapter().getContext();
  const snapshot = {
    state: 'closed', screen: 'home', animation: 'static', sleeping: false,
    greetingVisible: true, greetingText: 'Hello!', pose: null, context,
  };
  const preferences = { schemaVersion: 1, hidden: false, motion: 'system', lastGreetingAt: null };
  view.render(snapshot, preferences, false);
  const greeting = view.shadow.querySelector('.pika-a-greeting');
  const announcedText = greeting.firstChild;
  const observer = new window.MutationObserver(() => {});
  observer.observe(view, { attributes: true });
  observer.observe(view.shadow, { attributes: true, childList: true, characterData: true, subtree: true });
  const repetitions = 100;
  for (let index = 0; index < repetitions; index++) view.render(snapshot, preferences, false);
  const identical = observer.takeRecords();
  const attributes = {};
  for (const record of identical) {
    if (record.type === 'attributes') attributes[record.attributeName] = (attributes[record.attributeName] ?? 0) + 1;
  }
  const preservedTextNode = greeting.firstChild === announcedText;
  view.render({ ...snapshot, state: 'open', animation: 'wave', greetingText: 'New greeting.',
    context: { ...context, revision: context.revision + 1, cartCount: 2 } },
  { ...preferences, motion: 'off' }, false);
  const changed = observer.takeRecords();
  assert.equal(view.dataset.state, 'open');
  assert.equal(view.dataset.animation, 'wave');
  assert.equal(view.launcher.getAttribute('aria-expanded'), 'true');
  assert.equal(greeting.textContent, 'New greeting.');
  assert.equal(view.dialog.classList.contains('motion-off'), true);
  assert.ok([...view.shadow.querySelectorAll('.pika-a-row-text')].some((label) => label.textContent === `${config.texts.cart} · 2`));
  assert.ok([...view.shadow.querySelectorAll('button')].some((button) => button.getAttribute('aria-label') === `${config.texts.cart} · 2`));
  assert.ok(changed.length > 0, 'a changed snapshot still updates the real view');
  observer.disconnect();
  if (process.argv.includes('--expect-stable')) {
    assert.equal(identical.length, 0, 'identical render must not replace announced text or emit mutations');
    assert.equal(preservedTextNode, true);
  }
  const sha256 = (data) => createHash('sha256').update(data).digest('hex');
  const result = {
    result: 'PASS', fixtureVersion: 1, repetitions,
    sourceSha256: sha256(await readFile('src/ui/element.ts')),
    fixtureSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
    identicalRender: { mutationRecords: identical.length, attributes,
      childListRecords: identical.filter((record) => record.type === 'childList').length, preservedTextNode },
    changedRender: { mutationRecords: changed.length, actualTextAriaCartAndMotionUpdated: true },
    limitations: 'JSDOM DOM mutations; excludes native layout, paint, FPS and performance scores.',
  };
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex !== -1) {
    const output = resolve(workspace, process.argv[outputIndex + 1] ?? '');
    if (!output.startsWith(resolve(workspace, '.local/reports') + sep)) throw new Error('Report must stay in .local/reports');
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  }
  console.log(JSON.stringify(result));
} finally {
  view?.destroy();
  dom.window.close();
}
