import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { prepareCompiledTree } from '../../scripts/transpile.mjs';

// Test the demo router with mocked WAAPI and companion APIs.
const workspace = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(workspace);
const baseOption = process.argv.indexOf('--base');
const configuredBase = baseOption < 0 ? '/' : process.argv[baseOption + 1];
if (configuredBase === undefined || !/^\/(?:[\w.-]+\/)*[\w.-]*$/.test(configuredBase || '/'))
  throw new Error('Pass a root or project path: --base /lumoli/');
const basePath = configuredBase || '/';
const siteBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
const siteUrl = (path) => `${siteBase.slice(0, -1)}${path}`;
const root = await prepareCompiledTree('pagetransitions', ['src', 'demo']);
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
      await writeFile(file, text);
    }
  }
}
await rewrite(root);
await writeFile(
  resolve(root, 'src/index.js'),
  'export const init = async (options) => { (window.pagePushTestConfigurations ??= []).push(options.configUrl); return window.pagePushTestAssistant; };\n',
);

const dom = new JSDOM(`<!doctype html><meta name="site-base" content="${siteBase}"><div id="app"></div>`, {
  url: `https://lumoli.example${siteBase}`,
  pretendToBeVisual: true,
});
const { window } = dom;
Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
// Scrollbar changes emit visual viewport resize without a window resize.
const nativeViewport = new window.EventTarget();
Object.assign(nativeViewport, { offsetTop: 0, offsetLeft: 0, width: 1280, height: 800, scale: 1 });
Object.defineProperty(window, 'visualViewport', { configurable: true, value: nativeViewport });
let scrollOffset = 0;
Object.defineProperty(window, 'scrollY', { get: () => scrollOffset });
const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
window.HTMLElement.prototype.getBoundingClientRect = function () {
  if (this.id === 'main') return new window.DOMRect(0, 140 - scrollOffset, 1280, 1800);
  // Supply panel boxes because JSDOM has no layout.
  const compact = window.innerWidth <= 760;
  const navHeight = compact ? 68 : 0;
  if (this.matches('.mobile-bottom-nav'))
    return new window.DOMRect(0, window.innerHeight - navHeight, window.innerWidth, navHeight);
  if (this.matches('.sticky-buy') && !this.hidden) {
    const height = compact ? 76 : 84;
    return new window.DOMRect(0, window.innerHeight - navHeight - height, window.innerWidth, height);
  }
  return originalRect.call(this);
};
// Defer companion startup during router tests.
Object.defineProperty(window.document, 'visibilityState', { get: () => 'hidden' });
const media = new Map();
window.matchMedia = (query) => {
  if (!media.has(query)) {
    const target = new window.EventTarget();
    target.matches = false;
    target.media = query;
    target.change = (matches) => {
      target.matches = matches;
      const event = new window.Event('change');
      Object.defineProperty(event, 'matches', { value: matches });
      target.dispatchEvent(event);
    };
    media.set(query, target);
  }
  return media.get(query);
};
const scrolls = [];
const frames = new Map();
let nextFrame = 0;
window.requestAnimationFrame = (callback) => {
  const id = ++nextFrame;
  frames.set(id, callback);
  return id;
};
window.cancelAnimationFrame = (id) => frames.delete(id);
window.scrollTo = (options) => {
  scrolls.push(options);
  scrollOffset = options.top;
};
window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new window.Event('close'));
};

const globalNames = ['window', 'document', 'location', 'history', 'Storage', 'Node', 'HTMLElement'];
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
const animations = [];
let pageFrameTime = 0;
window.performance.now = () => pageFrameTime;
let finishedReads = 0;
window.Element.prototype.animate = function (keyframes, options) {
  const preparedCards = this.matches('#main .product-grid .product-card')
    ? [...window.document.querySelectorAll('#main .product-grid .product-card')].map((card) => ({
        opacity: window.getComputedStyle(card).opacity,
        transform: card.style.transform,
        willChange: card.style.willChange,
      }))
    : [];
  const animation = {
    element: this,
    routeContent:
      !!this.closest('.page-push') ||
      (this.matches('.product-card') && !!this.closest('#main .product-grid')),
    keyframes,
    options,
    preparedCards,
    playState: 'running',
    onfinish: null,
    oncancel: null,
    cancelCount: 0,
    currentTime: 0,
    startedAt: pageFrameTime,
    effect: { getComputedTiming: () => ({ progress: animation.progress ?? null }) },
    pause() { this.playState = 'paused'; },
    get finished() {
      finishedReads += 1;
      throw new Error('Do not create an unhandled finished rejection');
    },
    cancel() {
      this.cancelCount += 1;
      this.playState = 'idle';
      this.oncancel?.(new window.Event('cancel'));
    },
    finish() {
      if (this.playState === 'finished' || this.playState === 'idle') return;
      this.playState = 'finished';
      this.onfinish?.(new window.Event('finish'));
    },
  };
  animations.push(animation);
  return animation;
};
const groupSince = (index) => animations.slice(index);
const finishGroup = (group) => {
  for (const animation of group) if (animation.playState === 'running' || animation.playState === 'paused') animation.finish();
};
const assertClean = (main, group, checkOverlay = true) => {
  if (checkOverlay) {
    assert.equal(main.closest('[inert]'), null, 'the live page regains its controls');
    assert.equal(
      window.document.querySelector('.page-push'),
      null,
      'the temporary cover is removed',
    );
    assert.equal(
      frames.size,
      0,
      'the temporary progress loop is stopped',
    );
  }
  assert.equal(main.style.clipPath, '', 'cancellation cannot leave the new page clipped');
  assert.equal(main.style.opacity, '');
  assert.equal(main.style.transform, '');
  for (const animation of group) {
    assert.equal(animation.playState, 'idle');
    assert.equal(animation.onfinish, null);
    assert.equal(animation.oncancel, null);
    if (animation.element.matches('.product-card')) {
      assert.equal(animation.element.style.opacity, '');
      assert.equal(animation.element.style.transform, '');
      assert.equal(animation.element.style.willChange, '');
    }
  }
};
const assertCards = (group) => {
  assert.ok(group.length > 0 && group.length <= 6);
  assert.equal(window.document.querySelector('.page-push'), null, 'filters have no cover');
  for (const [index, animation] of group.entries()) {
    assert.ok(animation.element.matches('#main .product-grid .product-card'));
    assert.ok(
      animation.options.duration >= 450 && animation.options.duration <= 500,
      'cards have time to settle without a prolonged reveal',
    );
    assert.equal(animation.options.delay, index * 24);
    assert.ok(
      animation.options.delay + animation.options.duration <= 600,
      'even the last card finishes within a short reveal window',
    );
    assert.equal(animation.options.fill, 'both', 'delayed cards begin in their entry frame');
    assert.ok(
      animation.preparedCards.length > 0 &&
        animation.preparedCards.every(
          (card) =>
            card.opacity === '0' &&
            card.transform === 'translateY(10px)' &&
            card.willChange === 'opacity, transform',
        ),
      'all new cards are already hidden when the first animation is created, before delays',
    );
    const [start, end] = animation.keyframes;
    assert.equal(start.opacity, 0);
    assert.equal(end.opacity, 1);
    assert.ok(
      Number.parseFloat(start.transform.match(/translateY\(([^)]+)\)/u)[1]) <= 10,
      'the entry travels only a small distance',
    );
    assert.equal(end.transform, 'translateY(0)');
    assert.ok(
      animation.keyframes.every((frame) => !frame.transform.includes('scale(')),
      'book proportions remain constant while they appear',
    );
    const [x1, y1, x2, y2] = animation.options.easing
      .match(/cubic-bezier\(([^)]+)\)/u)[1]
      .split(',')
      .map(Number);
    assert.ok(x1 > 0 && y1 === 0, 'entry starts at zero speed instead of snapping forward');
    assert.ok(x2 < 1 && y2 === 1, 'entry settles with zero final speed');
  }
};
const assertVisibleCards = () => {
  for (const card of window.document.querySelectorAll('#main .product-grid .product-card')) {
    assert.equal(card.style.opacity, '', 'no card is left hidden');
    assert.equal(card.style.transform, '', 'no card is left shifted');
    assert.equal(card.style.willChange, '', 'temporary layer hints are removed');
  }
};
const contentSnapshot = (main) => {
  const copy = main.cloneNode(true);
  for (const card of copy.querySelectorAll('.product-card')) {
    for (const property of ['opacity', 'transform', 'will-change'])
      card.style.removeProperty(property);
    if (!card.getAttribute('style')?.trim()) card.removeAttribute('style');
  }
  return copy.innerHTML;
};
const pop = async (direction) => {
  const event = new Promise((resolve) =>
    window.addEventListener('popstate', resolve, { once: true }),
  );
  window.history[direction]();
  await event;
};

try {
  const style = window.document.createElement('style');
  style.textContent = (await Promise.all([
    'demo/styles.css', 'demo/typography.css', 'demo/storybook.css',
    'demo/cart-companion.css', 'demo/page-push-transition.css',
  ].map((file) => readFile(resolve(workspace, file), 'utf8')))).join('\n');
  window.document.head.append(style);
  let nativeCaptures = 0;
  window.document.startViewTransition = () => {
    nativeCaptures += 1;
    throw new Error('Page pushes use a DOM layer, never browser snapshots');
  };
  await import(pathToFileURL(resolve(root, 'demo/main.js')).href);
  const demo = window.pikaDemo;
  const realApp = window.document.querySelector('#app');
  const main = realApp.querySelector('#main');
  const assertScopedLinks = () => {
    for (const link of realApp.querySelectorAll('a[href^="/"]'))
      assert.ok(link.getAttribute('href').startsWith(siteBase),
        'all generated internal links stay under the configured project path');
  };
  assertScopedLinks();
  const shell = ['#app', '.announcement', '.site-header', '.site-footer',
    '.mobile-bottom-nav', '.sticky-buy'].map((selector) => realApp.matches(selector)
    ? realApp : realApp.querySelector(selector));
  const mascot = window.document.createElement('anime-shop-assistant');
  const mascotLayer = window.document.createElement('div');
  mascotLayer.className = 'pika-a-root';
  mascot.attachShadow({ mode: 'open' }).append(mascotLayer);
  const actor = window.document.createElement('button');
  actor.className = 'pika-a-launcher';
  let actorRect = new window.DOMRect(1000, 712, 96, 96);
  actor.getBoundingClientRect = () => actorRect;
  mascotLayer.append(actor);
  window.document.body.append(mascot);
  // A tiny background fixture proves SVG references survive namespacing.
  const sky = window.document.createElement('div');
  sky.className = 'storybook-sky';
  sky.innerHTML = '<svg viewBox="0 0 1600 1000"><defs><linearGradient id="sky-fixture"><stop stop-color="#e8f3ff"/></linearGradient></defs><rect fill="url(#sky-fixture)" width="1600" height="1000"/><g class="storybook-cloud" style="transform:translateX(3px);opacity:.8"><path d="M0 0h10v10H0z"/></g></svg>';
  window.document.body.prepend(sky);
  const preparations = [];
  const progress = [];
  let finishes = 0;
  const companion = {
    close: async () => {}, restore: async () => {}, destroy: async () => {},
    getState: () => 'closed', setInteractionHold: () => {}, lookAt: () => {},
    preparePagePush(side) {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      preparations.push({ side, resolve, settled: false });
      return promise;
    },
    setPagePushProgress(value) { progress.push(value); },
    finishPagePush() { finishes += 1; },
  };
  window.pagePushTestAssistant = companion;
  const tick = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
  const settlePreparation = async (preparation, result = true) => {
    preparation.settled = true;
    preparation.resolve(result);
    await tick();
  };
  const request = async (href, origin, activate) => {
    const html = contentSnapshot(main);
    const previousNodes = [...main.childNodes];
    const pageKey = demo.adapter.getContext().pageKey;
    const title = window.document.title;
    const before = animations.length, beforePrepare = preparations.length;
    // Delegated clicks must prepare the transition before committing content.
    const promise = activate ? (activate(), Promise.resolve()) : demo.navigate(href, origin);
    await tick();
    const overlay = window.document.querySelector('.page-push');
    assert.ok(overlay, 'the old viewport is covered by a connected snapshot');
    assert.equal(overlay.parentElement, window.document.body);
    assert.equal(overlay.getAttribute('aria-hidden'), 'true');
    assert.equal(overlay.hasAttribute('inert'), true);
    assert.equal(window.getComputedStyle(overlay).zIndex, '95');
    assert.equal(window.getComputedStyle(overlay).position, 'fixed');
    assert.equal(window.getComputedStyle(overlay).pointerEvents, 'none');
    assert.equal(realApp.hasAttribute('inert'), true, 'the covered live shop cannot receive input');
    const snapshot = overlay.querySelector('[data-page-push-snapshot]');
    assert.ok(snapshot.querySelector('.site-header') && snapshot.querySelector('.site-footer'),
      'the old layer contains the actual old header and footer');
    assert.equal(snapshot.id, 'app', 'only the theme root retains its ID');
    assert.equal(snapshot.querySelectorAll('[id]').length, 0);
    assert.equal(window.document.querySelectorAll('#main').length, 1);
    assert.equal(snapshot.querySelector('anime-shop-assistant'), null);
    assert.equal(snapshot.querySelector('dialog'), null);
    assert.ok([...snapshot.querySelectorAll('a,button,input,select,textarea')]
      .every((element) => element.tabIndex === -1), 'copied controls are inert and unfocusable');
    assert.equal(snapshot.querySelector('[data-cart-count],[data-add],[data-restore]'), null);
    const panel = overlay.querySelector('.page-push-panel');
    assert.equal(window.getComputedStyle(panel).backgroundColor, 'rgb(252, 247, 233)',
      'a solid old layer hides new content before the first animated frame');
    const skyCopy = overlay.querySelector('.storybook-sky');
    const gradient = skyCopy.querySelector('linearGradient');
    assert.notEqual(gradient.id, 'sky-fixture');
    assert.equal(skyCopy.querySelector('rect').getAttribute('fill'), `url(#${gradient.id})`);
    assert.equal(skyCopy.dataset.paused, 'true');
    assert.equal(skyCopy.querySelector('.storybook-cloud').style.animation, 'none');
    const preparation = preparations.length > beforePrepare ? preparations.at(-1) : null;
    if (preparation) {
      assert.equal(overlay.dataset.stage, 'prepare');
      assert.equal(contentSnapshot(main), html, 'content waits for the finite edge walk');
      assert.deepEqual([...main.childNodes], previousNodes);
      assert.equal(demo.adapter.getContext().pageKey, pageKey);
      assert.equal(window.document.title, title);
      assert.equal(groupSince(before).length, 0, 'preparation cannot move the old layer early');
    }
    return { promise, before, overlay, snapshot, panel, preparation, html, pageKey, finishes };
  };
  const beginSlide = async (route, result = true) => {
    const oldSnapshot = route.snapshot.innerHTML;
    if (route.preparation) await settlePreparation(route.preparation, result);
    const slide = groupSince(route.before).find((animation) => animation.element === route.panel);
    assert.ok(slide, 'one old viewport layer slides after covered route commit');
    const withCompanion = !!route.preparation && result;
    assert.equal(slide.options.duration, withCompanion ? 3000 : 900);
    assert.equal(slide.options.fill, 'both');
    assert.equal(slide.options.easing, withCompanion ? 'linear' : 'cubic-bezier(.42,0,.58,1)');
    const width = parseFloat(route.overlay.style.width);
    const distance = route.overlay.dataset.side === 'left' ? width : -width;
    assert.deepEqual(slide.keyframes, withCompanion
      ? [0, .5, 1].map((value, index) => ({
          offset: index / 2,
          transform: `translateX(${distance * value}px)`,
          easing: 'cubic-bezier(.6,0,.35,1)',
        }))
      : [{ transform: 'translateX(0)' }, { transform: `translateX(${distance}px)` }]);
    assert.equal(route.overlay.dataset.stage, 'slide');
    assert.equal(route.overlay.dataset.companion, String(!!route.preparation && result));
    assert.equal(route.snapshot.innerHTML, oldSnapshot, 'covered commit cannot mutate the old snapshot');
    assert.equal(scrollOffset, 0, 'the new page is reset under the old layer');
    assert.equal(realApp.hasAttribute('inert'), true, 'new controls remain blocked throughout the slide');
    assert.equal(frames.size, route.preparation && result ? 1 : 0,
      'only a prepared character needs one progress frame loop');
    route.slide = slide;
    return slide;
  };
  const advance = (route, time, effectProgress = null) => {
    pageFrameTime = route.slide.startedAt + time;
    route.slide.currentTime = time;
    route.slide.progress = effectProgress;
    const pending = [...frames.entries()];
    frames.clear();
    for (const [, callback] of pending) callback(pageFrameTime);
    assert.ok(frames.size <= 1, 'there is at most one page push progress callback');
  };
  const finishRoute = async (route, result = true) => {
    if (!route.slide) await beginSlide(route, result);
    route.slide.finish();
    await route.promise;
    await tick();
    assertClean(main, groupSince(route.before));
    assert.equal(window.document.activeElement, main, 'focus moves to the new page after its controls are restored');
    if (route.preparation) assert.equal(finishes, route.finishes + 1,
      'every preparation releases its character hold exactly once');
  };
  const navigateDone = async (href, result = true) => finishRoute(await request(href), result);

  assert.equal(animations.length, 0, 'initial content does not move');
  assert.equal(demo.assistant, undefined, 'page effects cannot force mascot initialization');
  const first = await request('/catalog');
  assert.equal(first.overlay.dataset.side, 'right', 'the actual actor chooses the nearest edge');
  assert.equal(first.preparation, null, 'missing optional API gives an ordinary slide');
  await finishRoute(first, false);
  assert.equal(demo.adapter.getContext().pageType, 'catalog');
  assert.equal(window.location.pathname, siteUrl('/catalog'));
  assert.equal(realApp.querySelector(`.desktop-nav a[href="${siteUrl('/catalog')}"]`)
    .getAttribute('aria-current'), 'page');
  await demo.runScenario('summon');
  assert.equal(demo.assistant, companion);
  assert.deepEqual(window.pagePushTestConfigurations, [siteUrl('/demo/assistant.config.json')]);
  await demo.adapter.navigate(siteUrl('/catalog'));
  assert.equal(window.location.pathname, siteUrl('/catalog'),
    'already-published assistant config routes do not get prefixed again');

  const coveredCommits = [];
  const unsubscribe = demo.adapter.subscribe(() => {
    const overlay = window.document.querySelector('.page-push');
    if (overlay?.dataset.stage === 'slide') coveredCommits.push(overlay.isConnected);
  });
  actorRect = new window.DOMRect(28, 712, 96, 96);
  scrollOffset = 420;
  const left = await request('/contacts');
  assert.equal(left.preparation.side, 'left');
  assert.equal(left.overlay.querySelector('.page-push-world').style.top, '-420px');
  const oldMenu = [...left.snapshot.querySelectorAll('.desktop-nav a')]
    .map((link) => link.getAttribute('aria-current'));
  await beginSlide(left);
  assert.deepEqual([...left.snapshot.querySelectorAll('.desktop-nav a')]
    .map((link) => link.getAttribute('aria-current')), oldMenu);
  assert.ok(coveredCommits.length && coveredCommits.every(Boolean),
    'real context changes only while the opaque old layer is already connected');
  const beforeProgress = progress.length;
  advance(left, 750, .25);
  assert.ok(progress.at(-1) > .25 && progress.at(-1) < .29,
    'the actor follows the first eased effort, rather than overall linear time');
  advance(left, 1490);
  const beforeSecondAttempt = progress.at(-1);
  advance(left, 1500);
  assert.ok(Math.abs(progress.at(-1) - .5) < .001, 'the first effort settles halfway before the second attempt');
  advance(left, 1510);
  assert.ok(progress.at(-1) > beforeSecondAttempt && progress.at(-1) - beforeSecondAttempt < .001,
    'the halfway join briefly gathers strength without a positional jump');
  advance(left, 2250);
  assert.ok(progress.at(-1) > .75 && progress.at(-1) < .79, 'the second effort follows the same smooth cycle');
  advance(left, 3000, 1);
  assert.ok(Math.abs(progress.at(-1) - 1) < .001);
  assert.equal(frames.size, 0, 'the progress loop is bounded even before WAAPI finish');
  assert.equal(progress.length, beforeProgress + 6);
  await finishRoute(left);
  unsubscribe();
  actorRect = new window.DOMRect(1152, 712, 96, 96);
  const right = await request('/delivery');
  assert.equal(right.preparation.side, 'right');
  await finishRoute(right);

  const clickedRoutes = [];
  const clickRoute = async (link, source) => {
    assert.ok(link, `the actual ${source} link exists`);
    const href = link.getAttribute('href');
    const click = new window.MouseEvent('click', {
      bubbles: true, composed: true, cancelable: true, button: 0, detail: 1,
      clientX: 800, clientY: 400,
    });
    const route = await request(href, undefined, () => {
      assert.equal(link.dispatchEvent(click), false,
        'the actual document click handler consumes the internal link');
    });
    assert.ok(route.preparation, `${source} must call preparePagePush through the click handler`);
    assert.equal(route.preparation.settled, false, 'the clicked route waits for the companion');
    await beginSlide(route);
    assert.equal(route.slide.options.duration, 3000, 'a prepared click uses the full companion slide');
    assert.equal(window.location.pathname, new URL(href, window.location.href).pathname);
    await finishRoute(route);
    clickedRoutes.push({ source, href });
  };
  // Exercise delegated navigation directly from each source page.
  for (const href of ['/product/moon-guardian', '/product/sky-dragon', '/product/star-witch']) {
    await navigateDone('/new');
    await clickRoute(main.querySelector(`.product-art-link[href="${siteUrl(href)}"]`), '/new book');
    assert.ok(main.querySelector('.book-product-page'), 'the clicked new book becomes the product page');
  }
  await navigateDone('/delivery');
  await clickRoute(main.querySelector(`.button[href="${siteUrl('/catalog')}"]`), '/delivery catalog link');
  await navigateDone('/contacts');
  await clickRoute(realApp.querySelector(`.desktop-nav a[href="${siteUrl('/catalog')}"]`), '/contacts catalogue link');
  for (const source of ['/new', '/delivery', '/contacts']) {
    await navigateDone(source);
    realApp.querySelector('[data-dialog="cart"]').click();
    const drawer = realApp.querySelector('#cart-dialog');
    assert.equal(drawer.open, true);
    assert.equal(demo.cartCount, 0, 'this route starts with the actual empty cart');
    assert.equal(mascot.parentElement, drawer, 'the live companion enters the cart surface');
    await clickRoute(drawer.querySelector(`a[href="${siteUrl('/catalog')}"]`), `${source} empty cart catalog link`);
    assert.equal(drawer.open, false, 'the delegated cart link closes its modal');
    assert.equal(mascot.parentElement, window.document.body, 'the same companion leaves the cart surface');
    assert.equal(demo.adapter.getContext().pageType, 'catalog');
  }
  assert.equal(clickedRoutes.length, 8);
  demo.openDialog('search');
  const searchDialog = realApp.querySelector('#search-dialog');
  const searchInput = searchDialog.querySelector('#shop-search');
  searchInput.value = 'Луна';
  searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  assertScopedLinks();
  await clickRoute(searchDialog.querySelector('.search-result'), 'search result');
  assert.equal(searchDialog.open, false);
  assert.equal(demo.adapter.getContext().pageType, 'product');
  demo.openDialog('menu');
  const menuDialog = realApp.querySelector('#menu-dialog');
  await clickRoute(menuDialog.querySelector(`a[href="${siteUrl('/new')}"]`), 'mobile menu new');
  assert.equal(menuDialog.open, false);
  await navigateDone('/delivery');

  const scrollbarCommit = await request('/catalog');
  await beginSlide(scrollbarCommit);
  const releasesBeforeScrollbar = finishes;
  // Simulate a scrollbar change between route commit and the first frame.
  nativeViewport.width = 1265;
  nativeViewport.dispatchEvent(new window.Event('resize'));
  await tick();
  assert.equal(window.innerWidth, 1280, 'scrollbar resize does not resize the browser window');
  assert.equal(window.innerHeight, 800);
  assert.equal(scrollbarCommit.overlay.isConnected, true,
    'a route commit scrollbar resize cannot remove the old screen before the first push frame');
  assert.equal(scrollbarCommit.slide.playState, 'paused',
    'the native-shaped visual viewport event cannot cancel the prepared slide');
  assert.equal(finishes, releasesBeforeScrollbar,
    'the viewport event cannot prematurely release the companion at the screen edge');
  advance(scrollbarCommit, 750);
  assert.ok(progress.at(-1) > .25, 'the companion still follows the first visible push effort');
  nativeViewport.width = 1280;
  nativeViewport.dispatchEvent(new window.Event('resize'));
  await tick();
  assert.equal(scrollbarCommit.overlay.isConnected, true,
    'a scrollbar disappearing during the slide also preserves its old screen');
  await finishRoute(scrollbarCommit);
  for (const [metric, value] of [['height', 740], ['offsetLeft', 10], ['offsetTop', 10], ['scale', 1.25]]) {
    const changedViewport = await request(window.location.pathname === siteUrl('/catalog') ? '/new' : '/catalog');
    await beginSlide(changedViewport);
    const original = nativeViewport[metric];
    nativeViewport[metric] = value;
    nativeViewport.dispatchEvent(new window.Event('resize'));
    await changedViewport.promise;
    assertClean(main, [changedViewport.slide]);
    nativeViewport[metric] = original;
  }
  await navigateDone('/delivery');

  const pending = await request('/new');
  const current = await request('/catalog');
  await pending.promise;
  assert.equal(pending.overlay.isConnected, false);
  assert.equal(frames.size, 0);
  const finishAfterReplacement = finishes;
  await settlePreparation(pending.preparation);
  assert.equal(finishes, finishAfterReplacement, 'an obsolete async walk cannot finish a newer push');
  assert.equal(current.overlay.isConnected, true);
  assert.equal(groupSince(current.before).length, 0);
  await finishRoute(current);
  const oldSlide = await request('/new');
  await beginSlide(oldSlide);
  const staleFinish = oldSlide.slide.onfinish;
  const newSlide = await request('/delivery');
  await oldSlide.promise;
  assertClean(main, [oldSlide.slide], false);
  const finishBeforeStale = finishes;
  staleFinish();
  assert.equal(finishes, finishBeforeStale);
  assert.equal(newSlide.overlay.isConnected, true);
  await finishRoute(newSlide);
  const pendingBack = await request('/catalog');
  await pop('back');
  await pendingBack.promise;
  assert.equal(window.location.pathname, siteUrl('/delivery'));
  assert.equal(contentSnapshot(main), pendingBack.html,
    'Back to the still-rendered page cancels an uncommitted route');
  await settlePreparation(pendingBack.preparation);
  assertClean(main, []);

  realApp.setAttribute('inert', 'existing');
  const alreadyBlocked = await request('/new');
  await beginSlide(alreadyBlocked);
  alreadyBlocked.slide.finish();
  await alreadyBlocked.promise;
  assert.equal(realApp.getAttribute('inert'), 'existing',
    'a transition preserves a pre-existing input blocker');
  realApp.removeAttribute('inert');
  assertClean(main, groupSince(alreadyBlocked.before));

  const reduced = media.get('(prefers-reduced-motion: reduce)');
  const interrupted = await request('/contacts');
  reduced.change(true);
  await interrupted.promise;
  assert.ok(main.querySelector('#contact-form'));
  assertClean(main, []);
  await settlePreparation(interrupted.preparation);
  const beforeReduced = animations.length;
  await demo.navigate('/catalog?category=lunara');
  await demo.navigate('/catalog?category=iskrovel');
  assert.equal(animations.length, beforeReduced);
  assertVisibleCards();
  reduced.change(false);
  assert.equal(animations.length, beforeReduced, 'motion enabling cannot replay a route');
  const product = await request('/product/electric-sun');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1260 });
  window.dispatchEvent(new window.Event('resize'));
  await product.promise;
  assert.equal(demo.adapter.getContext().ui.bottomReservedPx, 84);
  assertClean(main, []);
  await settlePreparation(product.preparation);
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  await demo.addProduct('electric-sun', { delay: 0 });
  await navigateDone('/cart');
  const beforeQuantity = animations.length;
  main.querySelector('.cart-page [data-delta="1"]').click();
  assert.equal(demo.cartCount, 2);
  assert.equal(animations.length, beforeQuantity, 'quantity edits do not replay a page transition');

  const mobileNav = realApp.querySelector('.mobile-bottom-nav');
  mobileNav.getBoundingClientRect = () => new window.DOMRect(12, 602, 320, 68);
  Object.defineProperty(window, 'visualViewport', {
    configurable: true, value: { offsetTop: 50, offsetLeft: 12, width: 320, height: 620 },
  });
  actorRect = new window.DOMRect(18, 600, 64, 64);
  scrollOffset = 280;
  const compact = await request('/checkout');
  assert.equal(compact.preparation.side, 'left');
  assert.equal(compact.overlay.style.left, '12px');
  assert.equal(compact.overlay.style.top, '50px');
  assert.equal(compact.overlay.style.width, '320px');
  assert.equal(compact.overlay.style.height, '620px');
  const world = compact.overlay.querySelector('.page-push-world');
  assert.equal(world.style.left, '-12px');
  assert.equal(world.style.top, '-330px');
  const frozenNav = compact.snapshot.querySelector('.mobile-bottom-nav');
  assert.equal(frozenNav.style.position, 'absolute');
  assert.equal(parseFloat(frozenNav.style.top) + parseFloat(world.style.top), 552,
    'copied fixed navigation stays at its old visual viewport coordinate');
  await beginSlide(compact);
  assert.equal(compact.slide.keyframes.at(-1).transform, 'translateX(320px)');
  window.dispatchEvent(new window.Event('pagehide'));
  await compact.promise;
  assert.ok(main.querySelector('#checkout-form'));
  assert.equal(demo.cartCount, 2);
  assertClean(main, [compact.slide]);
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
  const checkoutForm = main.querySelector('#checkout-form');
  const payment = await request('/payment', undefined, () => {
    assert.equal(checkoutForm.dispatchEvent(new window.Event('submit', {
      bubbles: true, cancelable: true,
    })), false);
  });
  await finishRoute(payment);
  assert.equal(window.location.pathname, siteUrl('/payment'));
  assert.equal(demo.adapter.getContext().pageType, 'payment');

  const rejected = await request('/contacts');
  await finishRoute(rejected, false);
  assert.equal(frames.size, 0, 'busy/off/drag rejection slides without moving or forcing the actor');
  const cancelled = await request('/catalog');
  await beginSlide(cancelled);
  cancelled.slide.cancel();
  await cancelled.promise;
  assertClean(main, [cancelled.slide]);

  const beforeFilter = animations.length;
  await demo.navigate('/catalog?category=listolesye');
  const filter = groupSince(beforeFilter);
  assertCards(filter);
  const staleCardFinish = filter[0].onfinish;
  const beforeNextFilter = animations.length;
  await demo.navigate('/catalog?category=aerolin');
  const nextFilter = groupSince(beforeNextFilter);
  assertCards(nextFilter);
  assertClean(main, filter);
  staleCardFinish();
  assert.ok(nextFilter.every((animation) => animation.playState === 'running'));
  const beforeBack = animations.length;
  await pop('back');
  assert.equal(window.location.search, '?category=listolesye');
  assertCards(groupSince(beforeBack));
  const beforeForward = animations.length;
  await pop('forward');
  assert.equal(window.location.search, '?category=aerolin');
  assertCards(groupSince(beforeForward));
  const beforeAll = animations.length;
  await demo.navigate('/catalog');
  const allCards = groupSince(beforeAll);
  assertCards(allCards);
  assert.equal(allCards.length, 6);
  const beforeIdentical = animations.length, historyLength = window.history.length;
  await demo.navigate('/catalog');
  assert.equal(animations.length, beforeIdentical);
  assert.equal(window.history.length, historyLength);
  finishGroup(allCards);
  assertClean(main, allCards);
  const beforeSort = animations.length, keyBeforeSort = demo.adapter.getContext().pageKey;
  const sort = realApp.querySelector('#sort-order');
  sort.value = 'price-asc';
  sort.dispatchEvent(new window.Event('change', { bubbles: true }));
  const sorted = groupSince(beforeSort);
  assertCards(sorted);
  assert.equal(demo.adapter.getContext().pageKey, keyBeforeSort);
  const beforeSameSort = animations.length;
  realApp.querySelector('#sort-order').dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(animations.length, beforeSameSort);
  window.dispatchEvent(new window.Event('pagehide'));
  assertClean(main, sorted);
  assertVisibleCards();
  const beforeFailedCards = animations.length, cardPrimitive = window.Element.prototype.animate;
  let cardCalls = 0;
  window.Element.prototype.animate = function (...args) {
    if (this.matches('#main .product-grid .product-card') && ++cardCalls === 2)
      throw new Error('Card animation unavailable');
    return cardPrimitive.apply(this, args);
  };
  await demo.navigate('/catalog?category=lunara');
  assert.equal(cardCalls, 2);
  assertClean(main, groupSince(beforeFailedCards));
  assertVisibleCards();
  window.Element.prototype.animate = cardPrimitive;

  const beforeMissingApi = animations.length, animate = window.Element.prototype.animate;
  delete window.Element.prototype.animate;
  await demo.navigate('/catalog?category=aerolin');
  await demo.navigate('/checkout');
  assert.ok(main.querySelector('#checkout-form'));
  assert.equal(animations.length, beforeMissingApi);
  assertClean(main, []);
  window.Element.prototype.animate = () => { throw new Error('WAAPI failed'); };
  const failed = await request('/contacts');
  await settlePreparation(failed.preparation);
  await failed.promise;
  assert.ok(main.querySelector('#contact-form'));
  assertClean(main, []);
  window.Element.prototype.animate = animate;
  assert.equal(nativeCaptures, 0);
  assert.equal(finishedReads, 0);
  assert.ok(animations.every((animation) => animation.routeContent));
  for (const element of [...shell, mascot, mascotLayer]) {
    assert.ok(element.isConnected);
    assert.equal(element.style.transform, '');
    assert.equal(element.style.opacity, '');
    assert.equal(element.style.willChange, '');
    assert.equal(element.style.viewTransitionName, '');
  }
  assert.equal(frames.size, 0);
  assertScopedLinks();
  if (siteBase !== '/') {
    const outside = window.document.createElement('a');
    outside.href = '/another-site/catalog';
    realApp.append(outside);
    const previousPath = window.location.pathname;
    const previousPreparations = preparations.length;
    let wasIntercepted;
    window.document.addEventListener('click', (event) => {
      wasIntercepted = event.defaultPrevented;
      event.preventDefault(); // Avoid JSDOM's unsupported native navigation after observing the router.
    }, { once: true });
    outside.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    assert.equal(wasIntercepted, false, 'the router leaves neighboring same-origin sites to the browser');
    assert.equal(window.location.pathname, previousPath);
    assert.equal(preparations.length, previousPreparations);
    outside.remove();
  }
  console.log(JSON.stringify({ status: 'PASS', siteBase, transition: 'old viewport DOM slide',
    duration: '3000ms with companion / 900ms fallback', preparations: preparations.length, releases: finishes,
    progressCallbacks: progress.length, animations: animations.length,
    clickedRoutes,
    pendingFrames: frames.size, nativeVisual: 'unverified',
    checks: 'left/right, actual new book/delivery/contacts/empty cart link clicks, covered commit, scrollbar visual viewport resize before first push frame, frozen old scroll/background/shell, inert namespaced snapshot, actual eased progress, stale prep/finish, rapid/Back, real window resize/pagehide/reduced/API failure, filter/sort first-frame cleanup, cart/checkout' }));
} finally {
  await window.pikaDemo?.destroy();
  globalThis.setTimeout = originalTimeout;
  for (const timer of timers) clearTimeout(timer);
  dom.window.close();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}
