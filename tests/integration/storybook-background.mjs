import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import { prepareCompiledTree } from '../../scripts/transpile.mjs';

// Actual SVG, actual fetch/parse/mount lifecycle; CSS animation itself requires
// a native browser. This test deliberately owns a separate compilation tree.
const workspace = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(workspace);
const source = await readFile('assets/source/storybook-book-background.svg', 'utf8');
assert.equal(source, await readFile('assets/exported/art/storybook-book-background.svg', 'utf8'));
let mode = 'ok';
let delayedResponse;
let requested;
const server = createServer((request, response) => {
  assert.equal(request.url, '/assets/exported/art/storybook-book-background.svg');
  if (mode === 'delay') {
    delayedResponse = response;
    requested?.();
  } else if (mode === 'http-error') response.writeHead(503).end();
  else
    response
      .writeHead(200, { 'content-type': 'image/svg+xml' })
      .end(mode === 'malformed' ? '<svg broken' : source);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const tree = await prepareCompiledTree('storybooksky', ['demo']);
const moduleFile = resolve(tree, 'demo/storybook-sky.js');
let moduleSource = await readFile(moduleFile, 'utf8');
moduleSource = moduleSource.replace(/^import ['"].*\.css['"];?\s*$/gm, '');
moduleSource = moduleSource.replaceAll(
  'import.meta.url',
  JSON.stringify(`${origin}/demo/storybook-sky.js`),
);
await writeFile(moduleFile, moduleSource, 'utf8');

const dom = new JSDOM(
  '<!doctype html><html><head></head><body><main id="shop">Bookshop<section class="hero"><div class="hero-visual"></div></section></main></body></html>',
  { url: origin },
);
const { window } = dom;
let hidden = false;
Object.defineProperty(window.document, 'hidden', { get: () => hidden });
const reduced = new window.EventTarget();
reduced.matches = false;
const compact = new window.EventTarget();
compact.matches = false;
window.matchMedia = (query) => (query === '(max-width: 760px)' ? compact : reduced);
window.requestAnimationFrame = () => {
  throw new Error('The background must never schedule JS animation frames');
};
const names = ['window', 'document', 'DOMParser', 'AbortController', 'requestAnimationFrame'];
const originals = new Map(
  names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
);
for (const name of names) globalThis[name] = name === 'window' ? window : window[name];
let handle;
try {
  const { mountAnimatedSky } = await import(pathToFileURL(moduleFile).href);
  const css = await readFile('demo/storybook-sky.css', 'utf8');
  const style = window.document.createElement('style');
  style.textContent = css;
  window.document.head.append(style);
  assert.ok(style.sheet.cssRules.length > 10, 'the browser CSS parser accepts the animation sheet');
  assert.match(css, /prefers-reduced-motion:\s*reduce/u);
  assert.match(css, /animation-play-state:\s*paused/u);

  handle = mountAnimatedSky();
  assert.equal(
    mountAnimatedSky(),
    handle,
    'mounting twice does not duplicate a background or fetch',
  );
  assert.equal(await handle.ready, true);
  const layer = window.document.querySelector('.storybook-sky');
  assert.equal(window.document.documentElement.dataset.storybookSky, 'mounted');
  assert.equal(layer.getAttribute('aria-hidden'), 'true');
  assert.equal(layer.hasAttribute('inert'), true);
  assert.equal(layer.dataset.paused, 'false');
  assert.equal(window.document.querySelector('#shop').textContent, 'Bookshop');
  const svg = layer.querySelector('svg');
  assert.equal(svg.getAttribute('viewBox'), '0 0 1600 1000');
  assert.equal(svg.getAttribute('focusable'), 'false');
  assert.equal(
    svg.querySelectorAll('.storybook-cloud').length,
    7,
    'cloud outlines move with their original interior accents',
  );
  assert.equal(
    svg.querySelector('.storybook-lantern').querySelectorAll('path').length,
    4,
    'the lamp moves separately from the book below it',
  );
  assert.equal(svg.querySelectorAll('.storybook-sunrays path').length, 1);
  assert.equal(
    window.document.querySelector('.storybook-sky-accents'),
    null,
    'the landscape has no repositioned decorative clones',
  );
  assert.equal(
    window.document.querySelectorAll('.storybook-sun').length,
    1,
    'there is only the original landscape sun',
  );
  assert.equal(
    window.document.querySelectorAll('.storybook-lantern').length,
    1,
    'there is only the original tree lamp',
  );
  assert.deepEqual(
    [...svg.querySelectorAll('.storybook-sun circle')].map((circle) =>
      ['cx', 'cy', 'r'].map((attribute) => circle.getAttribute(attribute)),
    ),
    [
      ['1320', '173', '65'],
      ['1320', '173', '48'],
    ],
    'sun position and both original radii remain unchanged',
  );
  assert.equal(
    svg.querySelector('.storybook-lantern path').getAttribute('d'),
    'M143 628 Q151 652 146 680',
    'the lamp hangs from the exposed trunk below the crown',
  );
  assert.equal(svg.querySelector('.storybook-lantern').hasAttribute('transform'), false);
  assert.equal(
    svg.querySelector('#book-apple,[href="#book-apple"],[data-part="orchard-apples"]'),
    null,
    'the cancelled apples and their fruiting twigs stay removed',
  );
  assert.equal(
    svg.querySelectorAll('use[href="#book-leaf-spray"]').length,
    6,
    'all original leafy shoots remain restored in the two trees',
  );
  assert.equal(
    svg.querySelectorAll('path[stroke="#7fa364"]').length,
    2,
    'both original foliage-texture contours remain in their crowns',
  );
  compact.matches = true;
  window.dispatchEvent(new window.Event('resize'));
  assert.equal(
    window.document.querySelectorAll('.storybook-sun').length,
    1,
    'mobile resize does not create a smaller sun',
  );
  compact.matches = false;
  window.dispatchEvent(new window.Event('resize'));
  for (const node of svg.querySelectorAll('[fill]')) {
    const id = /^url\(#([^)]+)\)$/u.exec(node.getAttribute('fill'))?.[1];
    if (id) assert.ok(svg.querySelector(`#${id}`), `existing gradient resolves: ${id}`);
  }

  hidden = true;
  window.document.dispatchEvent(new window.Event('visibilitychange'));
  assert.equal(layer.dataset.paused, 'true', 'hidden page freezes the CSS loops');
  hidden = false;
  window.document.dispatchEvent(new window.Event('visibilitychange'));
  assert.equal(layer.dataset.paused, 'false');
  window.document.querySelector('.hero').remove();
  assert.equal(
    window.document.querySelectorAll('.storybook-sun').length,
    1,
    'the original landscape survives a route change',
  );
  window.dispatchEvent(new window.Event('pagehide'));
  assert.equal(layer.dataset.paused, 'true');
  window.dispatchEvent(new window.Event('pageshow'));
  assert.equal(layer.dataset.paused, 'false', 'bfcache return resumes the existing layer');
  reduced.matches = true;
  reduced.dispatchEvent(new window.Event('change'));
  assert.equal(layer.dataset.paused, 'true');
  reduced.matches = false;
  reduced.dispatchEvent(new window.Event('change'));
  assert.equal(layer.dataset.paused, 'false');
  handle.destroy();
  handle.destroy();
  assert.equal(window.document.querySelector('.storybook-sky'), null);
  assert.equal(window.document.querySelector('.storybook-sky-accents'), null);
  assert.equal(
    window.document.documentElement.hasAttribute('data-storybook-sky'),
    false,
    'destroy restores the static CSS background',
  );
  for (const failedMode of ['http-error', 'malformed']) {
    mode = failedMode;
    handle = mountAnimatedSky();
    assert.equal(
      await handle.ready,
      false,
      `${failedMode}: failed inline load retains the static background`,
    );
    assert.equal(window.document.querySelector('.storybook-sky'), null);
    assert.equal(window.document.documentElement.hasAttribute('data-storybook-sky'), false);
    handle.destroy();
  }

  mode = 'delay';
  const requestStarted = new Promise((done) => {
    requested = done;
  });
  handle = mountAnimatedSky();
  await requestStarted;
  handle.destroy();
  delayedResponse.end(source);
  assert.equal(await handle.ready, false, 'destroy during fetch cannot mount a late background');
  assert.equal(window.document.querySelector('.storybook-sky'), null);
  assert.equal(window.document.documentElement.hasAttribute('data-storybook-sky'), false);

  // Rasterize the actual route shapes separately: the paper fade and tree
  // foreground must not conceal a broken river end or disconnected footpath.
  const landscape = new JSDOM(source, { contentType: 'image/svg+xml' });
  try {
    const drawing = landscape.window.document;
    const definitions = drawing.querySelector('defs').outerHTML;
    const mask = async (selector, paint) => {
      const shapes = [...drawing.querySelectorAll(selector)].map((node) => {
        const copy = node.cloneNode(true);
        if (paint === 'fill') {
          copy.setAttribute('fill', '#fff');
          copy.setAttribute('stroke', 'none');
        } else if (paint === 'stroke') {
          copy.setAttribute('fill', 'none');
          copy.setAttribute('stroke', '#fff');
          copy.setAttribute('stroke-width', '1.6');
          copy.setAttribute('stroke-linecap', 'round');
        }
        copy.setAttribute('opacity', '1');
        return copy.outerHTML;
      });
      assert.ok(shapes.length, `the route has rasterizable shapes: ${selector}`);
      return sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">${definitions}${shapes.join('')}</svg>`,
        ),
      )
        .ensureAlpha()
        .extractChannel('alpha')
        .raw()
        .toBuffer();
    };
    const [water, trail, deck, upstreamBank, downstreamBank, reflections] = await Promise.all([
      mask('[data-part="stream-water"]', 'fill'),
      mask(
        '[data-part="stream-far-trail"], [data-part="stream-near-trail"], [data-part="castle-threshold"]',
        'fill',
      ),
      mask('[data-part="stream-bridge"] path[fill="#f0dfb9"]', 'fill'),
      mask('[data-part="stream-banks"] path:first-child', 'stroke'),
      mask('[data-part="stream-banks"] path:last-child', 'stroke'),
      mask('[data-part="river-reflections"]'),
    ]);
    const pixel = (image, x, y) => image[y * 1600 + x];
    assert.ok(pixel(water, 0, 754) > 240, 'the river enters from beyond the left edge');
    assert.ok(pixel(water, 1117, 795) > 240, 'the bridge deck actually spans flowing water');
    for (const x of [1069, 1165]) {
      assert.equal(pixel(water, x, 798), 0, `bridge landing ${x} stands on a dry bank`);
      assert.ok(pixel(deck, x, 798) > 240, `bridge landing ${x} belongs to the deck`);
      assert.ok(pixel(trail, x, 798) > 240, `the footpath meets bridge landing ${x}`);
    }
    for (const [name, bank] of [
      ['outer', upstreamBank],
      ['inner', downstreamBank],
    ])
      assert.ok(
        bank.subarray(999 * 1600).some((alpha) => alpha > 128),
        `the ${name} river bank continues out of the foreground instead of ending inside the scene`,
      );
    const walkable = new Uint8Array(water.length);
    for (let index = 0; index < water.length; index++) {
      walkable[index] = trail[index] > 128 || deck[index] > 128;
      assert.ok(
        !(trail[index] > 128 && water[index] > 128),
        'the footpath stays on land on both approaches to the bridge',
      );
      if (reflections[index] > 8)
        assert.ok(water[index] > 0, 'water reflections cannot float outside the river banks');
    }
    // Flood fill checks connectivity across the complete drawn route, rather
    // than testing only a few disconnected anchor pixels.
    const reachable = (image, start) => {
      const visited = new Uint8Array(image.length);
      const queue = new Int32Array(image.length);
      let head = 0;
      let tail = 0;
      assert.ok(image[start] > 0, 'the route starts on its painted silhouette');
      visited[start] = 1;
      queue[tail++] = start;
      while (head < tail) {
        const index = queue[head++];
        const x = index % 1600;
        for (const next of [
          x ? index - 1 : -1,
          x < 1599 ? index + 1 : -1,
          index - 1600,
          index + 1600,
        ])
          if (next >= 0 && next < image.length && !visited[next] && image[next] > 0) {
            visited[next] = 1;
            queue[tail++] = next;
          }
      }
      return visited;
    };
    const riverPixels = Uint8Array.from(water, (alpha) => Number(alpha > 128));
    const connectedRiver = reachable(riverPixels, 754 * 1600);
    assert.ok(connectedRiver[999 * 1600 + 1320], 'the river flows continuously to the foreground');
    assert.deepEqual(
      connectedRiver,
      riverPixels,
      'the river silhouette contains no detached water',
    );
    const connectedTrail = reachable(walkable, 683 * 1600 + 1266);
    assert.ok(
      connectedTrail[985 * 1600 + 847],
      'the castle threshold, both bridge landings and foreground path form one walking route',
    );
  } finally {
    landscape.window.close();
  }

  // The real image must meet the page colour at either CSS background size,
  // rather than ending in a solid green horizontal edge. This checks raster
  // output, not the presence of a particular gradient or decorative SVG path.
  for (const width of [1600, 1200]) {
    const { data, info } = await sharp(Buffer.from(source))
      .resize(width)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let y = info.height - 3; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * info.channels;
        assert.equal(data[offset + 3], 255, `the ${width}px bottom edge stays opaque`);
        for (const [channel, expected] of [252, 247, 233].entries())
          assert.ok(
            Math.abs(data[offset + channel] - expected) <= 1,
            `the ${width}px landscape meets page paper at pixel ${x},${y}`,
          );
      }
  }

  console.log(
    'PASS storybook background: actual HTTP SVG mount, original groups, visibility/BFCache/reduced pause, static fallback, idempotence, late destroy, connected raster river/bridge/footpath, clipped reflections, paper-edge continuity. Native CSS motion was not run.',
  );
} finally {
  handle?.destroy();
  dom.window.close();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
