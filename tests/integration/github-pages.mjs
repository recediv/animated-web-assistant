import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { JSDOM } from 'jsdom';
import {
  distributionBaseFromHtml,
  normalizeDistributionBase,
  verifyDistribution,
} from '../../scripts/check-distribution.mjs';

// Exercise the existing production output: never rebuild or remove dist here.
// HTTP has directory indexes and a custom 404, without an SPA success fallback.
// JSDOM below runs the actual bundled storefront; it does not measure native layout.
const workspace = resolve(import.meta.dirname, '../..');
const directory = resolve(workspace, 'dist');
const index = await readFile(resolve(directory, 'index.html'), 'utf8');
const base = distributionBaseFromHtml(index);
const baseIndex = process.argv.indexOf('--base');
if (baseIndex >= 0) {
  assert.ok(process.argv[baseIndex + 1], '--base requires the expected published path');
  assert.equal(base, normalizeDistributionBase(process.argv[baseIndex + 1]));
}
const resources = await verifyDistribution(directory, base);
const books = [
  'electric-sun',
  'moon-guardian',
  'crimson-fox',
  'sky-dragon',
  'forest-spirit',
  'star-witch',
];
const routes = [
  '/',
  '/catalog',
  '/new',
  '/cart',
  '/checkout',
  '/delivery',
  '/contacts',
  '/payment',
  '/account',
  ...books.map((id) => `/product/${id}`),
];
const sitePath = (path) => `${base}${path.replace(/^\//u, '')}`;
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (base !== '/' && url.pathname === base.slice(0, -1)) {
      response.writeHead(301, { location: `${base}${url.search}` }).end();
      return;
    }
    if (!url.pathname.startsWith(base)) {
      response.writeHead(404).end();
      return;
    }
    let file = resolve(directory, decodeURIComponent(url.pathname.slice(base.length)));
    assert.ok(file === directory || file.startsWith(`${directory}${sep}`));
    let exists = await stat(file).catch(() => null);
    if (exists?.isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        response.writeHead(301, { location: `${url.pathname}/${url.search}` }).end();
        return;
      }
      file = resolve(file, 'index.html');
      exists = await stat(file).catch(() => null);
    }
    if (!exists?.isFile()) {
      response.writeHead(404, { 'content-type': contentTypes['.html'] });
      response.end(await readFile(resolve(directory, '404.html')));
      return;
    }
    response.writeHead(200, {
      'content-type': contentTypes[extname(file)] ?? 'application/octet-stream',
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(500).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const nativeFetch = globalThis.fetch;
let fileChecks = 0;
let routeChecks = 0;
let linkChecks = 0;

async function filesIn(path) {
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = resolve(path, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(file)));
    else files.push(file);
  }
  return files;
}

async function runStorefront(path, initialCheck, exerciseNavigation = false, expectedStatus = 200) {
  const response = await nativeFetch(`${origin}${sitePath(path)}`);
  assert.equal(response.status, expectedStatus);
  const html = await response.text();
  const dom = new JSDOM(html, { url: response.url, pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' });
  Object.defineProperty(document, 'hidden', { get: () => true });
  window.matchMedia = (query) =>
    Object.assign(new window.EventTarget(), {
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
    });
  window.scrollTo = () => {};
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new window.Event('close'));
  };
  const names = [
    'window',
    'document',
    'location',
    'history',
    'Storage',
    'Node',
    'HTMLElement',
    'MutationObserver',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ];
  const originals = new Map(
    names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  for (const name of names) {
    const value = name === 'window' ? window : window[name];
    globalThis[name] = name.endsWith('AnimationFrame') ? value.bind(window) : value;
  }
  const originalTimeout = globalThis.setTimeout;
  const timers = new Set();
  globalThis.setTimeout = (callback, delay, ...args) => {
    const timer = originalTimeout(() => {
      timers.delete(timer);
      callback(...args);
    }, delay);
    timers.add(timer);
    return timer;
  };
  const pending = new Set();
  globalThis.fetch = (input, options) => {
    const url = new URL(
      typeof input === 'string' ? input : (input.url ?? input.href),
      window.location.href,
    );
    assert.equal(url.origin, origin, 'the storefront only requests its published origin');
    assert.ok(url.pathname.startsWith(base), `fetch must keep the published base: ${url.pathname}`);
    const operation = nativeFetch(url, options);
    pending.add(operation);
    void operation.then(
      () => pending.delete(operation),
      () => pending.delete(operation),
    );
    return operation;
  };
  function checkLinks() {
    for (const link of document.querySelectorAll('#app a[href]')) {
      const url = new URL(link.href);
      if (url.origin !== origin) continue;
      assert.ok(url.pathname.startsWith(base), `internal link escaped ${base}: ${link.outerHTML}`);
      linkChecks += 1;
    }
    for (const image of document.querySelectorAll('#app img[src]')) {
      const url = new URL(image.src);
      assert.equal(url.origin, origin);
      assert.ok(
        url.pathname.startsWith(`${base}assets/`),
        `book image escaped ${base}: ${image.src}`,
      );
    }
  }
  try {
    const script = document.querySelector('script[type="module"][src]');
    assert.ok(script, 'production HTML loads its module entry');
    const entry = await nativeFetch(script.src);
    assert.equal(entry.status, 200);
    // Node imports use file/data URLs. Match the browser's import.meta origin
    // without changing the application statements or asset/reference strings.
    const source = (await entry.text()).replaceAll('import.meta.url', JSON.stringify(script.src));
    await import(
      `data:text/javascript;base64,${Buffer.from(`${source}\n// integration entry ${path}`).toString('base64')}`
    );
    const store = window.pikaDemo;
    assert.ok(store, 'the actual bundled storefront initialized');
    initialCheck(document, window);
    checkLinks();
    await Promise.allSettled([...pending]);
    if (exerciseNavigation) {
      for (const route of routes) {
        await store.navigate(route);
        assert.equal(window.location.pathname, sitePath(route));
        assert.ok(document.querySelector('#main h1,h2'), `route rendered: ${route}`);
        assert.equal(
          document
            .querySelector('.desktop-nav a[href="' + sitePath('/catalog') + '"]')
            ?.getAttribute('aria-current'),
          route === '/catalog' ? 'page' : null,
        );
        if (route.startsWith('/product/')) {
          assert.equal(document.querySelector('.detail-add')?.dataset.add, route.split('/')[2]);
          assert.equal(document.querySelector('.sticky-buy').hidden, false);
        }
        checkLinks();
        routeChecks += 1;
      }
      await store.navigate('/catalog?category=lunara');
      assert.equal(window.location.search, '?category=lunara');
      assert.deepEqual(
        [...document.querySelectorAll('#main .product-card [data-add]')].map(
          (button) => button.dataset.add,
        ),
        ['moon-guardian', 'star-witch'],
      );
      checkLinks();
      await store.adapter.navigate(sitePath('/catalog'));
      assert.equal(
        window.location.pathname,
        sitePath('/catalog'),
        'assistant adapter accepts an already published config route',
      );
      await store.navigate(`${origin}${sitePath('/new')}`);
      assert.equal(
        window.location.pathname,
        sitePath('/new'),
        'absolute published navigation does not duplicate the base',
      );
      store.openDialog('cart');
      const cartCatalog = document.querySelector(
        '#cart-dialog a[href="' + sitePath('/catalog') + '"]',
      );
      assert.ok(cartCatalog, 'empty side cart links to the published catalog');
      cartCatalog.dispatchEvent(
        new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
      await new Promise((done) => originalTimeout(done, 0));
      assert.equal(
        window.location.pathname,
        sitePath('/catalog'),
        'empty side-cart click uses the published catalog route',
      );
      assert.equal(document.querySelector('#cart-dialog').open, false);
      store.openDialog('search');
      assert.equal(document.querySelectorAll('.search-result').length, books.length);
      checkLinks();
      store.closeDialog('search');
      routeChecks += 3;
      await store.navigate('/product/forest-spirit');
      await store.addProduct('forest-spirit', { delay: 0 });
      await store.navigate('/cart');
      const checkout = document.querySelector('#main a[href="' + sitePath('/checkout') + '"]');
      assert.ok(checkout, 'filled cart links to checkout below the site base');
      checkout.dispatchEvent(
        new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
      await new Promise((done) => originalTimeout(done, 0));
      assert.equal(window.location.pathname, sitePath('/checkout'));
      const form = document.querySelector('#checkout-form');
      assert.ok(form);
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((done) => originalTimeout(done, 0));
      assert.equal(
        window.location.pathname,
        sitePath('/payment'),
        'form navigation keeps the site base',
      );
      checkLinks();
      assert.equal(
        store.assistant,
        undefined,
        'hidden-page checks do not initialize the unrelated mascot',
      );
    }
  } finally {
    await window.pikaDemo?.destroy();
    await Promise.allSettled([...pending]);
    globalThis.fetch = nativeFetch;
    for (const timer of timers) clearTimeout(timer);
    globalThis.setTimeout = originalTimeout;
    window.dispatchEvent(new window.Event('pagehide'));
    dom.window.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

try {
  assert.equal(
    await readFile(resolve(directory, '.nojekyll'), 'utf8'),
    '',
    'Pages output disables Jekyll transformation',
  );
  for (const route of routes) {
    for (const suffix of ['', '/', '?category=lunara', '/?category=lunara']) {
      if (route === '/' && suffix.startsWith('/')) continue;
      const url = `${origin}${sitePath(route)}${suffix}`;
      const response = await nativeFetch(url);
      assert.equal(response.status, 200, `direct static request must succeed: ${url}`);
      const html = await response.text();
      assert.equal(distributionBaseFromHtml(html), base);
      assert.equal(html, index, 'each direct route contains the generated production entry');
      routeChecks += 1;
    }
  }
  const notFound = await nativeFetch(`${origin}${sitePath('/not-a-story?source=direct')}`);
  assert.equal(notFound.status, 404, 'unknown paths are not hidden by a successful SPA fallback');
  assert.equal(
    await notFound.text(),
    index,
    'custom 404 still loads the normal app and displays its not-found route',
  );
  if (base !== '/') {
    const outside = await nativeFetch(`${origin}/`);
    assert.equal(outside.status, 404, 'repository site never serves app routes outside its base');
    await outside.arrayBuffer();
    const redirect = await nativeFetch(`${origin}${base.slice(0, -1)}?category=lunara`, {
      redirect: 'manual',
    });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get('location'), `${base}?category=lunara`);
    await redirect.arrayBuffer();
  }
  for (const file of await filesIn(directory)) {
    const pathname = relative(directory, file).split(sep).map(encodeURIComponent).join('/');
    const response = await nativeFetch(`${origin}${base}${pathname}`);
    assert.equal(
      response.status,
      200,
      `production file is served at its published path: ${pathname}`,
    );
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(file));
    fileChecks += 1;
  }
  const configUrl = `${origin}${base}demo/assistant.config.json`;
  const config = await nativeFetch(configUrl).then((response) => response.json());
  for (const [key, path] of Object.entries({
    catalog: '/catalog',
    newArrivals: '/new',
    cart: '/cart',
    delivery: '/delivery',
    contacts: '/contacts',
  })) {
    assert.equal(
      config.routes[key],
      sitePath(path),
      `assistant route ${key} keeps the published base`,
    );
  }
  for (const category of config.categories) {
    const url = new URL(category.href, origin);
    assert.equal(url.pathname, sitePath('/catalog'));
    assert.equal(url.searchParams.get('category'), category.id);
  }
  for (const path of Object.values(config.assets)) {
    const url = new URL(path, configUrl);
    assert.ok(url.pathname.startsWith(`${base}assistant/1.0.0/`));
    const response = await nativeFetch(url);
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
  const manifestUrl = new URL(config.assets.manifest, configUrl);
  const manifest = await nativeFetch(manifestUrl).then((response) => response.json());
  for (const atlas of Object.values(manifest.atlases)) {
    const url = new URL(atlas.file, manifestUrl);
    assert.ok(url.pathname.startsWith(`${base}assistant/1.0.0/`));
    const response = await nativeFetch(url);
    assert.equal(response.status, 200, 'lazy atlas files resolve beside the manifest');
    await response.arrayBuffer();
  }
  await runStorefront(
    '/catalog/?category=lunara',
    (document) => {
      assert.deepEqual(
        [...document.querySelectorAll('#main .product-card [data-add]')].map(
          (button) => button.dataset.add,
        ),
        ['moon-guardian', 'star-witch'],
        'direct reload preserves catalog query filtering',
      );
    },
    true,
  );
  await runStorefront('/product/forest-spirit/', (document) => {
    assert.equal(
      document.querySelector('.detail-add')?.dataset.add,
      'forest-spirit',
      'direct trailing-slash book URL renders the book',
    );
  });
  await runStorefront('/new/', (document) => {
    assert.deepEqual(
      [...document.querySelectorAll('#main .product-card [data-add]')].map(
        (button) => button.dataset.add,
      ),
      ['moon-guardian', 'sky-dragon', 'star-witch'],
      'direct trailing-slash arrivals URL renders arrivals',
    );
  });
  await runStorefront(
    '/missing-story',
    (document) => {
      assert.equal(
        document.querySelector('#main h1')?.textContent,
        'Сказка потерялась',
        'custom 404 initializes the not-found route at the original missing URL',
      );
      assert.equal(document.querySelector('#main a')?.pathname, sitePath('/catalog'));
    },
    false,
    404,
  );
  console.log(
    `PASS GitHub Pages ${base}: ${routeChecks} static/router routes, ${fileChecks} byte-verified HTTP files, ${linkChecks} rendered internal links, config/lazy atlases, catalog query, direct book/arrivals reloads and cart/checkout form navigation. Resource graph: ${JSON.stringify(resources)}. JSDOM does not validate native layout.`,
  );
} finally {
  await new Promise((done) => {
    server.close(done);
    // This server belongs solely to this test. Release any fetch keep-alive
    // sockets even when an assertion failed before its body was consumed.
    server.closeAllConnections();
  });
}
