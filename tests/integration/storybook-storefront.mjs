import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import * as cssTree from 'css-tree';
import { prepareCompiledTree } from '../../scripts/transpile.mjs';
import { createCssComparison } from './css-cascade.mjs';

// Run the real storefront, router and cart. Only browser animation/layout and
// the unrelated mascot startup are excluded; book URLs use a real HTTP server.
const workspace = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(workspace);
const expectedBooks = [
  ['electric-sun', 'Фонарь первого рассвета', 'listolesye', 690],
  ['moon-guardian', 'Найра и лунные письма', 'lunara', 790],
  ['crimson-fox', 'Рэйна и секрет лисьей маски', 'iskrovel', 890],
  ['sky-dragon', 'Аэрви и облачные острова', 'aerolin', 790],
  ['forest-spirit', 'Мохлик и тропа чудес', 'listolesye', 590],
  ['star-witch', 'Лиора и атлас звёзд', 'lunara', 890],
];
const assetPaths = new Map(
  expectedBooks.map(([id]) => [
    `/assets/exported/art/book-${id}.svg`,
    resolve(workspace, `assets/exported/art/book-${id}.svg`),
  ]),
);
assetPaths.set(
  '/assets/exported/art/storybook-book-background.svg',
  resolve(workspace, 'assets/exported/art/storybook-book-background.svg'),
);
const assetRequests = [];
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  assetRequests.push(pathname);
  const asset = assetPaths.get(pathname);
  if (!asset) {
    response.writeHead(404).end();
    return;
  }
  try {
    response.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8' });
    response.end(await readFile(asset));
  } catch {
    response.writeHead(500).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const root = await prepareCompiledTree(process.env.PIKA_STOREFRONT_CACHE ?? 'storybookstorefront', [
  'src',
  'demo',
]);
async function rewrite(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) await rewrite(file);
    else if (entry.name.endsWith('.js')) {
      let text = await readFile(file, 'utf8');
      text = text.replace(/^import ['"].*\.css['"];?\s*$/gm, '');
      text = text.replace(
        /(from\s+['"]|import\s*['"]|import\s*\(\s*['"])(\.{1,2}\/[^'"]+)(['"])/g,
        (match, prefix, name, suffix) => `${prefix}${extname(name) ? name : `${name}.js`}${suffix}`,
      );
      if (file === resolve(root, 'demo/products.js'))
        text = text.replaceAll('import.meta.url', JSON.stringify(`${origin}/demo/products.js`));
      if (file === resolve(root, 'demo/storybook-sky.js'))
        text = text.replaceAll(
          'import.meta.url',
          JSON.stringify(`${origin}/demo/storybook-sky.js`),
        );
      await writeFile(file, text, 'utf8');
    }
  }
}
await rewrite(root);

const dom = new JSDOM(await readFile(resolve(workspace, 'index.html'), 'utf8'), {
  url: `${origin}/`,
  pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;
const mainSource = await readFile(resolve(workspace, 'demo/main.ts'), 'utf8');
const importedCss = await Promise.all(
  [...mainSource.matchAll(/^import ['"](.+\.css)['"];$/gm)].map(([, path]) =>
    readFile(resolve(workspace, 'demo', path), 'utf8'),
  ),
);
// JSDOM has a CSS cascade but no viewport media evaluation or native layout.
// Apply the real imported styles in order, with width conditions evaluated here.
const linkStyles = new Map(
  [320, 390, 760, 768, 1440].map((width) => [
    width,
    importedCss
      .map((source) => {
        const ast = cssTree.parse(source);
        cssTree.walk(ast, {
          visit: 'Atrule',
          enter(node, item, list) {
            if (node.name !== 'media') return;
            const query = cssTree.generate(node.prelude);
            const max = query.match(/max-width:\s*(\d+)px/u);
            const min = query.match(/min-width:\s*(\d+)px/u);
            const active =
              (!max || width <= Number(max[1])) &&
              (!min || width >= Number(min[1])) &&
              !query.includes('prefers-reduced-motion:no-preference');
            if (active) list.replace(item, node.block.children);
            else list.remove(item);
            return this.skip;
          },
        });
        return cssTree.generate(ast).replaceAll(':hover', '[data-link-hover]');
      })
      .join('\n'),
  ]),
);
const linkStyle = document.createElement('style');
document.head.append(linkStyle);
const arrowStyleCases = new Set();
const bookTiltCases = new Set();
let arrowDomChecks = 0;
let arrowCssChecks = 0;
const svgArrowPath = 'M4 12h15M12 5l7 7-7 7';

function checkArrowStyle(link, label) {
  const signature = [link, link.parentElement]
    .map((node) => `${node.tagName}.${node.className}`)
    .join('/');
  if (arrowStyleCases.has(signature)) return;
  arrowStyleCases.add(signature);
  for (const [width, css] of linkStyles) {
    linkStyle.textContent = css;
    const style = window.getComputedStyle(link);
    const context = `${label}: ${width}px ${compact(link.textContent)}`;
    const labelNode = link.querySelector(':scope > .link-label');
    const arrowNode = link.querySelector(':scope > .link-arrow');
    if (labelNode && arrowNode) {
      assert.equal(
        style.display,
        link.classList.contains('announcement-note') && width <= 760 ? 'none' : 'inline-flex',
        `${context}: compact announcement stays hidden; other links remain inline`,
      );
      assert.equal(style.alignItems, 'center', `${context}: arrow aligns with the label`);
      assert.equal(
        style.justifyContent,
        'flex-start',
        `${context}: no spread between text and arrow`,
      );
      assert.ok(Number.parseFloat(style.gap) >= 4 && Number.parseFloat(style.gap) <= 8);
      // JSDOM leaves button `font: inherit` unresolved even when a later ID rule
      // sets font-size. Check that authored winning rule in this one case.
      const fontSize =
        style.fontSize === 'inherit'
          ? [...linkStyle.sheet.cssRules]
              .filter(
                (rule) =>
                  rule.style?.fontSize &&
                  rule.selectorText
                    .split(',')
                    .some(
                      (selector) => selector.trim().startsWith('#app ') && link.matches(selector),
                    ),
              )
              .at(-1)?.style.fontSize
          : style.fontSize;
      assert.ok(Number.parseFloat(fontSize) >= 12, `${context}: readable link text (${fontSize})`);
      const textStyle = window.getComputedStyle(labelNode);
      const arrowStyle = window.getComputedStyle(arrowNode);
      assert.equal(textStyle.flexShrink, '1', `${context}: narrow labels are allowed to shrink`);
      assert.equal(textStyle.minWidth, '0', `${context}: label has no intrinsic width lock`);
      assert.equal(arrowStyle.flexShrink, '0', `${context}: arrow never gets squeezed`);
      assert.ok(
        Number.parseFloat(arrowStyle.fontSize) >= 14 &&
          Number.parseFloat(arrowStyle.fontSize) <= 20,
        `${context}: arrow has a restrained readable size`,
      );
      if (!link.classList.contains('announcement-note'))
        assert.ok(Number.parseFloat(style.minHeight) >= 44, `${context}: accessible target height`);
      assert.equal(style.textDecoration, 'none', `${context}: no underline across the gap`);
      link.dataset.linkHover = 'true';
      assert.equal(
        window.getComputedStyle(labelNode).textDecoration,
        'underline',
        `${context}: hover underlines only the label`,
      );
      assert.equal(window.getComputedStyle(arrowNode).textDecoration, 'none');
      assert.equal(window.getComputedStyle(link).textDecoration, 'none');
      delete link.dataset.linkHover;
      const previousFocus = document.activeElement;
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      link.focus();
      assert.equal(
        window.getComputedStyle(labelNode).textDecoration,
        'underline',
        `${context}: keyboard focus also underlines the label`,
      );
      assert.equal(window.getComputedStyle(arrowNode).textDecoration, 'none');
      link.blur();
      if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus();
    } else {
      const svg = link.querySelector(`:scope > svg:has(path[d="${svgArrowPath}"])`);
      const iconStyle = window.getComputedStyle(svg);
      assert.equal(style.alignItems, 'center', `${context}: SVG arrow aligns vertically`);
      assert.equal(iconStyle.flexShrink, '0', `${context}: SVG arrow preserves its width`);
      assert.ok(
        Number.parseFloat(iconStyle.width) >= 17 && Number.parseFloat(iconStyle.width) <= 24,
      );
      assert.ok(
        Number.parseFloat(iconStyle.height) >= 17 && Number.parseFloat(iconStyle.height) <= 24,
      );
      assert.doesNotMatch(
        style.textDecoration,
        /underline/u,
        `${context}: arrow buttons have no underline`,
      );
    }
    arrowCssChecks += 1;
  }
  linkStyle.textContent = linkStyles.get(1440);
}

function checkBookTilts(label) {
  for (const grid of document.querySelectorAll('#main .product-grid')) {
    const books = [...grid.children].filter((card) => card.matches('.product-card.book-card'));
    if (!books.length) continue;
    const context = `${grid.parentElement.className}/${books.length}`;
    if (bookTiltCases.has(context)) continue;
    bookTiltCases.add(context);
    for (const [width, css] of linkStyles) {
      linkStyle.textContent = css;
      books.forEach((card) => {
        const volume = card.querySelector('.book-volume');
        const position = [...grid.children].indexOf(card) + 1;
        assert.equal(
          window.getComputedStyle(volume).transform,
          `rotate(${position % 2 ? -4 : 4}deg)`,
          `${label}: ${width}px alternating book ${position}`,
        );
        const coverLink = card.querySelector('.product-art-link');
        coverLink.dataset.linkHover = 'true';
        assert.equal(
          window.getComputedStyle(volume).transform,
          'rotate(0deg) translateY(-4px)',
          `${label}: ${width}px both book directions straighten on hover`,
        );
        assert.equal(window.getComputedStyle(card.querySelector('.product-art')).transform, 'none');
        delete coverLink.dataset.linkHover;
      });
    }
  }
  linkStyle.textContent = linkStyles.get(1440);
}
Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' });
Object.defineProperty(document, 'hidden', { get: () => true });
window.matchMedia = (query) => {
  const media = new window.EventTarget();
  media.matches = query === '(prefers-reduced-motion: reduce)';
  media.media = query;
  return media;
};
window.scrollTo = () => {};
window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new window.Event('close'));
};
const globalNames = [
  'window',
  'document',
  'location',
  'history',
  'Storage',
  'Node',
  'HTMLElement',
  'MutationObserver',
  'AbortController',
];
const originals = new Map(
  globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
);
for (const name of globalNames) globalThis[name] = name === 'window' ? window : window[name];
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

const compact = (text) => text.replace(/\s+/gu, ' ').trim();
const price = (amount) => `${new Intl.NumberFormat('ru-RU').format(amount)} ₽`;
const forbiddenCopy = /демо|демонстрац|карточ/iu;
const routeChecks = [];
const cssComparison = await createCssComparison(process.env.PIKA_CSS_BASELINE, importedCss);
const addedBooks = new Set();
function checkCartActionCopy(label) {
  for (const button of document.querySelectorAll('[data-add]')) {
    const [, name] = expectedBooks.find(([id]) => id === button.dataset.add);
    const action = addedBooks.has(button.dataset.add) ? 'В корзине' : 'В корзину';
    assert.equal(
      button.getAttribute('aria-label'),
      `${action} — «${name}»`,
      `${label}: accessible purchase action`,
    );
    assert.equal(button.title, action, `${label}: purchase tooltip`);
    const text = button.querySelector('[data-add-label]');
    if (text) assert.equal(compact(text.textContent), action, `${label}: visible purchase action`);
    else {
      assert.ok(button.classList.contains('product-add'), `${label}: icon-only book action`);
      assert.equal(
        compact(button.textContent),
        '',
        `${label}: round book action keeps its icon layout`,
      );
      assert.ok(button.querySelector('svg'), `${label}: book action icon remains present`);
    }
  }
}
const visibleCopy = (element) => {
  for (let current = element; current; current = current.parentElement) {
    if (current.matches('script,style,template,noscript,[hidden],[aria-hidden="true"]'))
      return false;
    if (current.matches('dialog:not([open])')) return false;
    if (current.matches('details:not([open])')) {
      const summary = current.querySelector(':scope > summary');
      if (!summary?.contains(element)) return false;
    }
  }
  return true;
};
function checkStoreCopy(label) {
  const main = document.querySelector('#main');
  assert.ok(main && compact(main.textContent).length > 20, `${label}: actual page is populated`);
  assert.ok(main.querySelector('h1'), `${label}: actual page heading is present`);
  assert.match(document.title, /ЛУМОЛИ|Лумоли/u, `${label}: storefront title is set`);
  assert.doesNotMatch(document.title, forbiddenCopy, `${label}: page title`);
  for (const meta of document.querySelectorAll('meta[content]'))
    assert.doesNotMatch(meta.content, forbiddenCopy, `${label}: metadata ${meta.name}`);
  const walker = document.createTreeWalker(document.body, window.NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (visibleCopy(node.parentElement))
      assert.doesNotMatch(compact(node.textContent), forbiddenCopy, `${label}: visible text`);
  }
  for (const element of document.body.querySelectorAll(
    '[aria-label],[alt],[placeholder],[title]',
  )) {
    if (!visibleCopy(element)) continue;
    for (const attribute of ['aria-label', 'alt', 'placeholder', 'title'])
      assert.doesNotMatch(
        element.getAttribute(attribute) ?? '',
        forbiddenCopy,
        `${label}: ${attribute}`,
      );
  }
  for (const link of document.querySelectorAll('a,button')) {
    if (!visibleCopy(link)) continue;
    const labelNode = link.querySelector(':scope > .link-label');
    const arrowNode = link.querySelector(':scope > .link-arrow');
    if (/[↗←]/u.test(link.textContent)) {
      assert.ok(labelNode && compact(labelNode.textContent), `${label}: arrow link has a label`);
      const glyph = compact(arrowNode?.textContent ?? '');
      assert.ok(['↗', '←'].includes(glyph), `${label}: separate directional arrow glyph`);
      assert.equal(arrowNode.getAttribute('aria-hidden'), 'true', `${label}: decorative arrow`);
      assert.equal(link.children.length, 2, `${label}: no extra spacer between text and arrow`);
      assert.equal(
        glyph === '←' ? arrowNode.nextElementSibling : labelNode.nextElementSibling,
        glyph === '←' ? labelNode : arrowNode,
        `${label}: arrow stays beside text in the correct direction`,
      );
      assert.doesNotMatch(labelNode.textContent, /[↗←]/u, `${label}: label excludes the arrow`);
      checkArrowStyle(link, label);
      arrowDomChecks += 1;
    } else if (link.querySelector(`:scope > svg path[d="${svgArrowPath}"]`)) {
      assert.ok(compact(link.textContent), `${label}: SVG arrow control has a text label`);
      assert.equal(link.querySelector(':scope > svg').getAttribute('aria-hidden'), 'true');
      checkArrowStyle(link, label);
      arrowDomChecks += 1;
    }
  }
  checkCartActionCopy(label);
  checkBookTilts(label);
  cssComparison?.check(document, label);
  routeChecks.push(label);
}
const gridIds = () =>
  [...document.querySelectorAll('#main .collection-section .product-card [data-add]')].map(
    (button) => button.dataset.add,
  );
const click = (selector) => {
  const element = document.querySelector(selector);
  assert.ok(element, `actual control exists: ${selector}`);
  element.click();
};
const flush = async () => {
  // The router is deliberately reduced-motion, so only its promise chain remains.
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
};
let sky;

try {
  const { products, artUrl } = await import(pathToFileURL(resolve(root, 'demo/products.js')).href);
  assert.deepEqual(
    products.map(({ id, name, category, price: amount }) => [id, name, category, amount]),
    expectedBooks,
    'the book redesign preserves product IDs, categories and prices while changing names',
  );
  await import(pathToFileURL(resolve(root, 'demo/main.js')).href);
  const { mountAnimatedSky } = await import(
    pathToFileURL(resolve(root, 'demo/storybook-sky.js')).href
  );
  sky = mountAnimatedSky();
  assert.equal(await sky.ready, true, 'the actual background SVG URL mounts behind the store');
  assert.equal(
    document.querySelector('.storybook-sky').dataset.paused,
    'true',
    'hidden/reduced storefront keeps the background still',
  );
  const store = window.pikaDemo;
  assert.ok(store, 'actual storefront API initialized');
  assert.equal(store.assistant, undefined, 'mascot remains deferred throughout this test');
  const visit = async (path) => {
    await store.navigate(path);
    assert.equal(`${window.location.pathname}${window.location.search}`, path);
    checkStoreCopy(path);
  };
  checkStoreCopy('/');
  for (const name of ['menu', 'cookie', 'cart']) {
    click(`[data-dialog="${name}"]`);
    checkStoreCopy(`/ [${name} open]`);
    click(`#${name}-dialog [data-close="${name}"]`);
  }
  assert.deepEqual(
    gridIds(),
    expectedBooks.map(([id]) => id),
  );
  const imageUrls = new Set();
  const coverHashes = new Set();
  for (const [id, name] of expectedBooks) {
    const image = document
      .querySelector(`#main .product-card [data-add="${id}"]`)
      .closest('.product-card')
      .querySelector('img');
    assert.equal(image.src, artUrl(id), `${id}: rendered book URL`);
    assert.equal(new URL(image.src).pathname, `/assets/exported/art/book-${id}.svg`);
    imageUrls.add(image.src);
    const response = await fetch(image.src);
    assert.equal(response.status, 200, `${id}: real image URL resolves`);
    assert.match(response.headers.get('content-type'), /image\/svg\+xml/);
    const source = await response.text();
    assert.equal(
      source,
      await readFile(resolve(workspace, `assets/source/book-${id}.svg`), 'utf8'),
      `${id}: served cover matches editable source`,
    );
    const svg = new JSDOM(source, { contentType: 'image/svg+xml' });
    try {
      const cover = svg.window.document.documentElement;
      assert.equal(cover.getAttribute('viewBox'), '0 0 440 600');
      assert.ok(cover.querySelectorAll('path').length > 8, `${id}: real vector illustration`);
      assert.equal(cover.querySelector('image'), null, `${id}: no missing nested image URL`);
      assert.ok(
        compact(
          [...cover.querySelectorAll('text')].map((node) => node.textContent).join(' '),
        ).includes(name),
        `${id}: printed title belongs to the book`,
      );
    } finally {
      svg.window.close();
    }
    const { data, info } = await sharp(Buffer.from(source))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 440);
    assert.equal(info.height, 600);
    let opaquePixels = 0;
    for (let pixel = 3; pixel < data.length; pixel += 4) if (data[pixel] > 0) opaquePixels += 1;
    assert.ok(opaquePixels > 440 * 600 * 0.9, `${id}: rendered cover is populated`);
    coverHashes.add(createHash('sha256').update(data).digest('hex'));
  }
  assert.equal(imageUrls.size, 6, 'six different book URL assets');
  assert.equal(coverHashes.size, 6, 'six different rendered book illustrations');
  assert.equal(
    assetRequests.filter((path) => path.includes('/book-')).length,
    6,
    'all six book URLs were actually requested',
  );
  assert.equal(
    assetRequests.filter((path) => path.endsWith('/storybook-book-background.svg')).length,
    1,
    'the shared background was loaded once',
  );

  await visit('/catalog');
  for (const [category, expectedIds] of [
    ['listolesye', ['electric-sun', 'forest-spirit']],
    ['lunara', ['moon-guardian', 'star-witch']],
    ['iskrovel', ['crimson-fox']],
    ['aerolin', ['sky-dragon']],
  ]) {
    click(`.category-filters a[href="/catalog?category=${category}"]`);
    await flush();
    assert.equal(window.location.search, `?category=${category}`);
    assert.deepEqual(gridIds(), expectedIds, `${category}: filter shows only this world's books`);
    assert.equal(document.querySelector('.section-description'), null);
    assert.equal(document.querySelector('.collection-count'), null);
    checkStoreCopy(`/catalog?category=${category}`);
  }
  click('.category-filters a[href="/catalog"]');
  await flush();
  for (const [order, expectedIds] of [
    [
      'price-asc',
      ['forest-spirit', 'electric-sun', 'moon-guardian', 'sky-dragon', 'crimson-fox', 'star-witch'],
    ],
    [
      'price-desc',
      ['crimson-fox', 'star-witch', 'moon-guardian', 'sky-dragon', 'electric-sun', 'forest-spirit'],
    ],
    ['featured', expectedBooks.map(([id]) => id)],
  ]) {
    const select = document.querySelector('#sort-order');
    select.value = order;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.deepEqual(gridIds(), expectedIds, `${order}: real select sorts the shelf`);
    checkStoreCopy(`/catalog [${order}]`);
  }
  for (const [order, label, expectedIds] of [
    [
      'price-asc',
      'Сначала дешевле',
      ['forest-spirit', 'electric-sun', 'moon-guardian', 'sky-dragon', 'crimson-fox', 'star-witch'],
    ],
    [
      'price-desc',
      'Сначала дороже',
      ['crimson-fox', 'star-witch', 'moon-guardian', 'sky-dragon', 'electric-sun', 'forest-spirit'],
    ],
    ['featured', 'Наш выбор', expectedBooks.map(([id]) => id)],
  ]) {
    click('.sort-picker-trigger');
    assert.equal(document.querySelector('.sort-picker').open, true);
    click(`[data-sort="${order}"]`);
    assert.deepEqual(gridIds(), expectedIds, `${order}: visible sort picker sorts the shelf`);
    assert.equal(document.querySelector('#sort-order').value, order);
    assert.equal(document.querySelector('#sort-order').hidden, true);
    assert.equal(document.querySelector('.sort-picker').open, false);
    assert.equal(document.querySelector('[data-sort][aria-pressed="true"]').dataset.sort, order);
    assert.equal(compact(document.querySelector('.sort-picker-trigger > span').textContent), label);
    assert.equal(document.activeElement, document.querySelector('.sort-picker-trigger'));
  }
  click('.sort-picker-trigger');
  document.body.click();
  assert.equal(document.querySelector('.sort-picker').open, false, 'outside click closes sort');
  click('.sort-picker-trigger');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(document.querySelector('.sort-picker').open, false, 'Escape closes sort');
  assert.equal(document.activeElement, document.querySelector('.sort-picker-trigger'));
  await visit('/new');
  assert.deepEqual(gridIds(), ['moon-guardian', 'sky-dragon', 'star-witch']);

  // Search through the actual dialog/input rather than recomputing a product filter.
  click('[data-dialog="search"]');
  const search = document.querySelector('#shop-search');
  assert.equal(document.querySelectorAll('.search-result').length, 6);
  checkStoreCopy('/new [search all]');
  search.value = 'Мохлик';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.deepEqual(
    [...document.querySelectorAll('.search-result')].map((link) => link.pathname),
    ['/product/forest-spirit'],
  );
  checkStoreCopy('/new [search]');
  search.value = 'Missing book';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(document.querySelectorAll('.search-result').length, 0);
  checkStoreCopy('/new [search empty]');
  click('#search-dialog [data-close="search"]');

  for (const [id, name, , amount] of expectedBooks) {
    await visit(`/product/${id}`);
    assert.equal(document.querySelector('#main h1').textContent, name);
    assert.equal(document.querySelector('.detail-price').textContent, price(amount));
    assert.equal(document.querySelector('.detail-add').dataset.add, id);
    assert.equal(document.querySelector('.product-detail-art img').src, artUrl(id));
    assert.match(
      document.querySelector('.product-details-list').textContent,
      /Страниц.*Переплёт.*Для мечтателей/u,
    );
  }

  await visit('/product/forest-spirit');
  await store.addProduct('forest-spirit', { fail: true, delay: 0 });
  assert.equal(store.cartCount, 0, 'failed purchase keeps the book outside the cart');
  assert.match(document.querySelector('.shop-toast').textContent, /книгу в корзину/u);
  checkCartActionCopy('failed purchase');
  click('.detail-add');
  await new Promise((done) => originalTimeout(done, 450));
  addedBooks.add('forest-spirit');
  assert.equal(store.cartCount, 1, 'real product-page purchase confirms one book');
  assert.equal(document.querySelector('.detail-add').disabled, false);
  checkCartActionCopy('confirmed product and sticky purchase');
  assert.equal(compact(document.querySelector('.detail-add').textContent), 'В корзине');
  assert.equal(compact(document.querySelector('.sticky-buy [data-add]').textContent), 'В корзине');
  assert.match(document.querySelector('.shop-toast').textContent, /теперь в корзине/u);
  await store.addProduct('electric-sun', { delay: 0 });
  addedBooks.add('electric-sun');
  click('[data-dialog="cart"]');
  checkStoreCopy('/product/forest-spirit [filled cart dialog]');
  const drawerPlus = '#cart-dialog [data-quantity="forest-spirit"][data-delta="1"]';
  document.querySelector(drawerPlus).focus();
  click(drawerPlus);
  assert.equal(document.activeElement, document.querySelector(drawerPlus), 'drawer quantity keeps focus');
  const drawerMinus = '#cart-dialog [data-quantity="forest-spirit"][data-delta="-1"]';
  document.querySelector(drawerMinus).focus();
  click(drawerMinus);
  assert.equal(document.activeElement, document.querySelector(drawerMinus), 'drawer decrement keeps focus');
  click('#cart-dialog [data-close="cart"]');
  for (const path of ['/', '/catalog', '/new']) await visit(path);
  await visit('/cart');
  const row = (id) => document.querySelector(`#main [data-remove="${id}"]`)?.closest('.cart-item');
  assert.equal(row('forest-spirit').querySelector('h3').textContent, 'Мохлик и тропа чудес');
  assert.equal(row('electric-sun').querySelector('h3').textContent, 'Фонарь первого рассвета');
  assert.equal(document.querySelector('#main .cart-summary strong').textContent, price(1280));
  const pagePlus = '#main [data-quantity="forest-spirit"][data-delta="1"]';
  document.querySelector(pagePlus).focus();
  click(pagePlus);
  assert.equal(document.activeElement, document.querySelector(pagePlus), 'cart page quantity keeps focus');
  assert.equal(row('forest-spirit').querySelector('[aria-label="Количество"]').textContent, '2');
  assert.equal(store.cartCount, 3);
  assert.equal(document.querySelector('#main .cart-summary strong').textContent, price(1870));
  checkStoreCopy('/cart [quantity]');
  click('#main a[href="/checkout"]');
  await flush();
  checkStoreCopy('/checkout');
  assert.equal(window.location.pathname, '/checkout');
  assert.equal(document.querySelector('.checkout-summary h2').textContent, '3 книги');
  assert.deepEqual(
    [...document.querySelectorAll('.summary-line')].map((line) => [
      compact(line.querySelector('span').textContent),
      compact(line.querySelector('strong').textContent),
    ]),
    [
      ['Мохлик и тропа чудес × 2', '1 180 ₽'],
      ['Фонарь первого рассвета × 1', '690 ₽'],
    ],
    'checkout keeps the same named books, quantities and line prices',
  );
  assert.equal(document.querySelector('.summary-total strong').textContent, price(1870));
  const checkout = document.querySelector('#checkout-form');
  checkout.elements.name.value = 'Test User';
  checkout.elements.email.value = 'reader@example.com';
  checkout.elements.city.value = 'Test City';
  checkout.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(window.location.pathname, '/payment');
  checkStoreCopy('/payment [submitted]');
  assert.match(document.querySelector('#main').textContent, /Заказ не создан, деньги не списаны/u);
  assert.equal(store.cartCount, 3, 'unavailable payment never silently empties the cart');

  for (const path of ['/delivery', '/contacts', '/account', '/payment', '/not-found'])
    await visit(path);
  await visit('/cart');
  const pageMinus = '#main [data-quantity="forest-spirit"][data-delta="-1"]';
  document.querySelector(pageMinus).focus();
  click(pageMinus);
  assert.equal(document.activeElement, document.querySelector(pageMinus), 'cart page decrement keeps focus');
  assert.equal(row('forest-spirit').querySelector('[aria-label="Количество"]').textContent, '1');
  assert.equal(document.querySelector('#main .cart-summary strong').textContent, price(1280));
  document.querySelector('#main [data-remove="electric-sun"]').focus();
  click('#main [data-remove="electric-sun"]');
  assert.equal(document.activeElement, document.querySelector('#main [data-remove="forest-spirit"]'), 'removing the last row focuses the previous row control');
  addedBooks.delete('electric-sun');
  assert.equal(row('electric-sun'), undefined);
  assert.equal(store.cartCount, 1);
  assert.equal(document.querySelector('#main .cart-summary strong').textContent, price(590));
  document.querySelector(pageMinus).focus();
  click(pageMinus);
  assert.equal(document.activeElement, document.querySelector('#main .empty-state a'), 'empty cart retains a useful focus target');
  addedBooks.delete('forest-spirit');
  assert.equal(store.cartCount, 0);
  assert.match(document.querySelector('#main .empty-state').textContent, /В корзине пока пусто/u);
  checkStoreCopy('/cart [empty]');
  await visit('/');
  await visit('/product/forest-spirit');
  assert.equal(compact(document.querySelector('.detail-add').textContent), 'В корзину');
  assert.equal(compact(document.querySelector('.sticky-buy [data-add]').textContent), 'В корзину');
  await visit('/checkout');
  assert.equal(document.querySelector('.checkout-summary h2').textContent, '0 книг');
  assert.equal(document.querySelector('.summary-total strong').textContent, price(0));
  assert.equal(store.assistant, undefined, 'store checks never initialized the unrelated mascot');
  assert.equal(document.querySelector('anime-shop-assistant'), null);
  console.log(
    `PASS storybook storefront: ${routeChecks.length} route/state copy checks, ${arrowDomChecks} actual arrow controls, ${arrowCssChecks} imported-CSS checks at 320/390/760/768/1440px, six HTTP/raster covers, filters/search/sort/cart/checkout. JSDOM does not validate native layout.`,
  );
  if (cssComparison)
    console.log(`PASS CSS cleanup comparison: ${JSON.stringify(cssComparison.report())}`);
} finally {
  await window.pikaDemo?.destroy();
  sky?.destroy();
  for (const timer of timers) clearTimeout(timer);
  globalThis.setTimeout = originalTimeout;
  dom.window.close();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  await new Promise((done) => server.close(done));
}
