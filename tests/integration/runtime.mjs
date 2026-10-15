import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { prepareCompiledTree } from '../../scripts/transpile.mjs';

// Run the demo against local HTTP assets; mock browser APIs missing from JSDOM.
const workspace = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(workspace);
const originalRandom = Math.random;
// Seed randomness to select the parachute entrance.
if (
  process.argv.includes('--canopy') ||
  process.argv.includes('--speech') ||
  process.argv.includes('--transitions') ||
  process.argv.includes('--autonomous') ||
  process.argv.includes('--quiet') || process.argv.includes('--skills-companion') || process.argv.includes('--page-push') || process.argv.includes('--cart-route')
)
  Math.random = () => 0.5;
const routes = new Map([
  ['/demo/assistant.config.json', ['demo/assistant.config.json', 'application/json']],
  ['/assistant/1.0.0/atlas.json', ['assets/exported/atlas.json', 'application/json']],
  ['/assistant/1.0.0/atlas.webp', ['assets/exported/atlas.webp', 'image/webp']],
  ['/assistant/1.0.0/poster.webp', ['assets/exported/poster.webp', 'image/webp']],
  ['/assistant/1.0.0/assistant.css', ['src/ui/assistant.css', 'text/css']],
]);
const exportedManifest = JSON.parse(await readFile('assets/exported/atlas.json', 'utf8'));
for (const geometry of Object.values(exportedManifest.atlases ?? {})) {
  routes.set(`/assistant/1.0.0/${geometry.file}`, [
    `assets/exported/${geometry.file}`,
    'image/webp',
  ]);
}
const server = createServer(async (request, response) => {
  const route = routes.get(new URL(request.url, 'http://localhost').pathname);
  if (!route) {
    response.writeHead(404);
    response.end();
    return;
  }
  try {
    response.setHeader('Content-Type', route[1]);
    if (process.argv.includes('--graphics-failure') && route[0] === 'demo/assistant.config.json') {
      const config = JSON.parse(await readFile(resolve(workspace, route[0]), 'utf8'));
      config.assets.manifest = '/assistant/1.0.0/missing-atlas.json';
      response.end(JSON.stringify(config));
      return;
    }
    response.end(await readFile(resolve(workspace, route[0])));
  } catch (error) {
    response.writeHead(500);
    response.end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  await run(`http://127.0.0.1:${server.address().port}`);
} finally {
  Math.random = originalRandom;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

async function run(origin) {
  const root = await prepareCompiledTree(process.env.PIKA_INTEGRATION_CACHE ?? 'fullintegration', [
    'src',
    'demo',
  ]);
  async function rewrite(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await rewrite(path);
      else if (entry.name.endsWith('.js')) {
        let content = await readFile(path, 'utf8');
        content = content.replace(/^import ['"].*\.css['"];?\s*$/gm, '');
        content = content.replace(
          /(from\s+['"]|import\s*['"]|import\s*\(\s*['"])(\.{1,2}\/[^'"]+)(['"])/g,
          (match, prefix, name, suffix) =>
            `${prefix}${extname(name) ? name : `${name}.js`}${suffix}`,
        );
        if (path.endsWith('src\\index.js') || path.endsWith('src/index.js')) {
          content = content.replaceAll(
            'catch {',
            'catch (error) { console.error("INIT DIAGNOSTIC", error);',
          );
          if (process.argv.includes('--startup'))
            content =
              'globalThis.__pikaIntegrationModuleLoads = (globalThis.__pikaIntegrationModuleLoads ?? 0) + 1;\n' +
              content;
        }
        if (process.argv.includes('--graphics-failure') && (path.endsWith('core\\runtime.js') || path.endsWith('core/runtime.js')))
          content = 'globalThis.__graphicsRuntimeImports = (globalThis.__graphicsRuntimeImports ?? 0) + 1;\n' + content;
        if (process.argv.includes('--graphics-failure') && (path.endsWith('demo\\companion-skills.js') || path.endsWith('demo/companion-skills.js')))
          content = 'globalThis.__graphicsPaletteImports = (globalThis.__graphicsPaletteImports ?? 0) + 1;\n' + content;
        await writeFile(path, content);
      }
    }
  }
  await rewrite(root);

  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><div id="app"></div></body></html>',
    { url: `${origin}/`, pretendToBeVisual: true },
  );
  const window = dom.window;
  const mobile = process.argv.includes('--mobile') || process.argv.includes('--compact');
  const calm = process.argv.includes('--calm');
  const reduced = process.argv.includes('--reduced');
  const arrivalOnly = process.argv.includes('--arrival');
  const speechOnly = process.argv.includes('--speech');
  const transitionsOnly = process.argv.includes('--transitions');
  const autonomousOnly = process.argv.includes('--autonomous');
  const motionOff = process.argv.includes('--off');
  const checkoutOnly = process.argv.includes('--checkout');
  const cartCompanionOnly = process.argv.includes('--cart-companion');
  const isolationOnly = process.argv.includes('--isolation');
  const startupOnly = process.argv.includes('--startup');
  const startupEarly = process.argv.includes('--early');
  const startupHidden = process.argv.includes('--hidden');
  const quietOnly = process.argv.includes('--quiet');
  const skillsOnly = process.argv.includes('--skills-companion');
  const pagePushOnly = process.argv.includes('--page-push');
  const cartRouteOnly = process.argv.includes('--cart-route');
  const viewportCommitOnly = cartRouteOnly && process.argv.includes('--viewport-commit');
  const controlledQuiet = quietOnly || skillsOnly || pagePushOnly || cartRouteOnly;
  const scenes = !calm && !process.argv.includes('--no-scenes');
  const earlyClick =
    !arrivalOnly &&
    !transitionsOnly &&
    !autonomousOnly &&
    !checkoutOnly &&
    !cartCompanionOnly &&
    !isolationOnly &&
    !startupOnly &&
    !quietOnly &&
    !skillsOnly &&
    !pagePushOnly &&
    !cartRouteOnly &&
    !process.argv.includes('--no-early-click');
  const atlasManifest = JSON.parse(await readFile('assets/exported/atlas.json', 'utf8'));
  Object.defineProperty(window, 'innerWidth', { value: mobile ? (speechOnly ? 320 : 390) : 1366 });
  Object.defineProperty(window, 'innerHeight', { value: mobile ? (speechOnly ? 568 : 844) : 900 });
  const quietViewport = controlledQuiet
    ? Object.assign(new window.EventTarget(), {
        offsetLeft: 0,
        offsetTop: 0,
        width: window.innerWidth,
        height: window.innerHeight,
        scale: 1,
      })
    : null;
  if (quietViewport)
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: quietViewport });
  const errors = [];
  let startupState = 'loading';
  let startupVisibility = startupHidden ? 'hidden' : 'visible';
  const startupIdle = new Map();
  let startupIdleId = 0;
  if (startupOnly) {
    Object.defineProperty(window.document, 'readyState', { get: () => startupState });
    Object.defineProperty(window.document, 'visibilityState', { get: () => startupVisibility });
    window.requestIdleCallback = (callback, options) => {
      assert.equal(options.timeout, 1200, 'idle fallback has a finite deadline');
      startupIdle.set(++startupIdleId, callback);
      return startupIdleId;
    };
    window.cancelIdleCallback = (id) => startupIdle.delete(id);
  }
  window.addEventListener('error', (event) => {
    errors.push(event.error?.stack ?? event.message);
  });
  window.matchMedia = (query) => ({
    media: query,
    matches:
      (mobile && query.includes('max-width')) ||
      (reduced && query.includes('prefers-reduced-motion')),
    addEventListener() {},
    removeEventListener() {},
  });
  let scrollPosition = 0;
  // Supply fixed panel boxes; Playwright checks native layout and safe areas.
  const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    const navHeight = mobile ? 68 : 0;
    if (this.matches('.mobile-bottom-nav'))
      return new window.DOMRect(0, window.innerHeight - navHeight, window.innerWidth, navHeight);
    if (this.matches('.sticky-buy') && !this.hidden) {
      const height = mobile ? 76 : 84;
      return new window.DOMRect(0, window.innerHeight - navHeight - height, window.innerWidth, height);
    }
    return originalRect.call(this);
  };
  if (transitionsOnly || cartRouteOnly) {
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollPosition });
    Object.defineProperty(window, 'pageYOffset', { configurable: true, get: () => scrollPosition });
    window.scrollTo = (options) => {
      const next = options.top ?? scrollPosition;
      if (next === scrollPosition) return;
      scrollPosition = next;
      // Native scroll from navigate() is delivered after route/context/focus work.
      setTimeout(
        () => window.document.dispatchEvent(new window.Event('scroll', { bubbles: true })),
        0,
      );
    };
  } else window.scrollTo = () => {};
  window.HTMLDialogElement.prototype.show = function () {
    this._restoreElement =
      window.document.activeElement?.shadowRoot?.activeElement ?? window.document.activeElement;
    this.open = true;
  };
  window.HTMLDialogElement.prototype.showModal = window.HTMLDialogElement.prototype.show;
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this._restoreElement?.focus();
    if (cartRouteOnly) setTimeout(() => this.dispatchEvent(new window.Event('close')), 0);
    else this.dispatchEvent(new window.Event('close'));
  };
  const pointerCaptures = new Map();
  window.HTMLElement.prototype.setPointerCapture = function (id) {
    pointerCaptures.set(id, this);
  };
  window.HTMLElement.prototype.hasPointerCapture = function (id) {
    return pointerCaptures.get(id) === this;
  };
  window.HTMLElement.prototype.releasePointerCapture = function (id) {
    if (pointerCaptures.get(id) === this) pointerCaptures.delete(id);
  };
  const drawCalls = [];
  const namedAtlases = new Map([
    ['atlas.webp', ['main', atlasManifest.atlas]],
    ...Object.entries(atlasManifest.atlases ?? {}).map(([name, geometry]) => [
      geometry.file,
      [name, geometry],
    ]),
  ]);
  const imageBase = window.document.baseURI;
  const imageSheet = (source) =>
    namedAtlases.get(new URL(source, imageBase).pathname.split('/').at(-1));
  window.HTMLCanvasElement.prototype.getContext = function () {
    return {
      clearRect() {},
      save() {},
      restore() {},
      translate() {},
      scale() {},
      drawImage: (...args) =>
        drawCalls.push({
          at: performance.now(),
          sx: args[1],
          sy: args[2],
          sheet: imageSheet(args[0].src)?.[0] ?? 'main',
        }),
    };
  };
  const sourceProperty = Object.getOwnPropertyDescriptor(window.HTMLImageElement.prototype, 'src');
  const imageRequests = [];
  const imageLoadTimers = new Map();
  const rejectedSheets = new Set();
  let holdPushImage = false;
  const pendingPushLoads = [];
  Object.defineProperty(window.HTMLImageElement.prototype, 'src', {
    configurable: true,
    get: sourceProperty.get,
    set(value) {
      const previous = imageLoadTimers.get(this);
      if (previous !== undefined) clearTimeout(previous);
      imageLoadTimers.delete(this);
      sourceProperty.set.call(this, value);
      if (value) imageRequests.push(value);
      const sheet = imageSheet(value)?.[1];
      this._fakeWidth = value ? (sheet?.width ?? 192) : 0;
      this._fakeHeight = value ? (sheet?.height ?? 192) : 0;
      if (value)
        imageLoadTimers.set(
          this,
          setTimeout(() => {
            imageLoadTimers.delete(this);
            if (!window.document) return;
            const load = () => this.dispatchEvent(
              new window.Event(rejectedSheets.has(imageSheet(value)?.[0]) ? 'error' : 'load'),
            );
            if (holdPushImage && imageSheet(value)?.[0] === 'push') pendingPushLoads.push(load);
            else load();
          }, 4),
        );
    },
  });
  Object.defineProperty(window.HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get() {
      return this._fakeWidth ?? 0;
    },
  });
  Object.defineProperty(window.HTMLImageElement.prototype, 'naturalHeight', {
    configurable: true,
    get() {
      return this._fakeHeight ?? 0;
    },
  });
  window.HTMLImageElement.prototype.decode = () => Promise.resolve();
  const createElement = window.document.createElement.bind(window.document);
  let attachScrollInjected = false;
  window.document.createElement = (...args) => {
    const element = createElement(...args);
    if (args[0] === 'link') {
      if (transitionsOnly && !attachScrollInjected) {
        attachScrollInjected = true;
        setTimeout(() => {
          scrollPosition = 120;
          window.document.dispatchEvent(new window.Event('scroll', { bubbles: true }));
        }, 3);
      }
      setTimeout(() => {
        element.dispatchEvent(new window.Event('load'));
      }, 8);
    }
    return element;
  };

  for (const key of [
    'window',
    'document',
    'location',
    'history',
    'customElements',
    'Node',
    'HTMLElement',
    'HTMLDialogElement',
    'HTMLInputElement',
    'HTMLCanvasElement',
    'HTMLImageElement',
    'Image',
    'Storage',
    'DOMException',
    'AbortController',
    'AbortSignal',
  ])
    globalThis[key] = key === 'window' ? window : window[key];
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  const rafs = new Set();
  globalThis.requestAnimationFrame = (callback) => {
    const id = setTimeout(() => {
      rafs.delete(id);
      callback(performance.now());
    }, 16);
    rafs.add(id);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    clearTimeout(id);
    rafs.delete(id);
  };
  const originalFetch = globalThis.fetch;
  let restoreChance = () => {};
  const requests = [];
  globalThis.fetch = async (input, options) => {
    const url = new URL(input, window.location.href);
    requests.push(url.href);
    const response = await originalFetch(url, options);
    if (calm && url.pathname.endsWith('assistant.config.json')) {
      const config = await response.json();
      config.behavior = 'calm';
      config.timings.idleDesktopMs = 16000;
      config.timings.idleCompactMs = 24000;
      return new Response(JSON.stringify(config), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return response;
  };
  // Advance browser callbacks in 16ms steps while HTTP uses real time.
  const quietClock = controlledQuiet ? installVirtualClock() : null;
  const routeAnimations = [];
  let onRouteSlideCreated;
  if (cartRouteOnly) {
    // Use one clock for WAAPI and RAF; preserve router finish/cancel handlers.
    window.requestAnimationFrame = globalThis.requestAnimationFrame;
    window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
    window.performance.now = performance.now.bind(performance);
    window.Element.prototype.animate = function (keyframes, options) {
      const started = performance.now();
      const duration = Number(options.duration ?? 0);
      let timer;
      let heldTime;
      const animation = {
        element: this, keyframes, options, playState: 'running', onfinish: null, oncancel: null,
        get currentTime() { return heldTime ?? Math.min(duration, Math.max(0, performance.now() - started)); },
        set currentTime(value) { heldTime = value; },
        effect: { getComputedTiming: () => ({ progress: animation.currentTime / duration }) },
        pause() { heldTime = this.currentTime; clearTimeout(timer); this.playState = 'paused'; },
        cancel() {
          if (this.playState === 'idle') return;
          clearTimeout(timer); this.playState = 'idle';
          this.oncancel?.(new window.Event('cancel'));
        },
        finish() {
          if (this.playState !== 'running' && this.playState !== 'paused') return;
          clearTimeout(timer); this.playState = 'finished';
          this.onfinish?.(new window.Event('finish'));
        },
      };
      timer = setTimeout(() => animation.finish(), duration + Number(options.delay ?? 0));
      routeAnimations.push(animation);
      if (this.matches('.page-push-panel') && onRouteSlideCreated) {
        const notify = onRouteSlideCreated;
        onRouteSlideCreated = undefined;
        // Resize may arrive after commit but before the first animation frame.
        queueMicrotask(() => notify(animation));
      }
      return animation;
    };
  }
  const quietDebug = (stage) => {
    if (process.argv.includes('--quiet-debug')) console.log(JSON.stringify({ quietStage: stage }));
  };
  let quietReduced = reduced;
  const quietMedia = new Map();
  if (controlledQuiet) {
    window.matchMedia = (query) => {
      if (!quietMedia.has(query)) {
        const listeners = new Set();
        quietMedia.set(query, {
          media: query,
          get matches() {
            return (
              (mobile && query.includes('max-width')) ||
              (quietReduced && query.includes('prefers-reduced-motion'))
            );
          },
          addEventListener: (_type, callback) => listeners.add(callback),
          removeEventListener: (_type, callback) => listeners.delete(callback),
          notify: () => {
            for (const callback of listeners) callback();
          },
        });
      }
      return quietMedia.get(query);
    };
  }

  try {
    const { REPLIES, PERSONALITY_SESSION_KEY, PersonalityVariation } = await import(
      pathToFileURL(resolve(root, 'src/core/variation.js')).href
    );
    // Override only the selected branch of the captured random source.
    const selectChance = (probability, result, action) => {
      const actual = PersonalityVariation.prototype.chance;
      PersonalityVariation.prototype.chance = function (value) {
        return value === probability ? result : actual.call(this, value);
      };
      try {
        return action();
      } finally {
        PersonalityVariation.prototype.chance = actual;
      }
    };
    const transitionTrace = [];
    const playbackTrace = [];
    const quietControllers = [];
    const quietReactions = [];
    if (controlledQuiet) {
      const { ScenarioController } = await import(
        pathToFileURL(resolve(root, 'src/core/scenarios.js')).href
      );
      const actual = ScenarioController.prototype.performQuiet;
      ScenarioController.prototype.performQuiet = function (...args) {
        quietControllers.push(this);
        return actual.apply(this, args);
      };
      const actualReact = ScenarioController.prototype.react;
      ScenarioController.prototype.react = function (...args) {
        quietReactions.push(args[0]);
        return actualReact.apply(this, args);
      };
    }
    if (autonomousOnly && !reduced && !motionOff) {
      const actualChance = PersonalityVariation.prototype.chance;
      PersonalityVariation.prototype.chance = function (probability) {
        // Exercise the selected 30% branch; the real cooldown and all other choices remain active.
        return probability === 0.3 ? true : actualChance.call(this, probability);
      };
      restoreChance = () => {
        PersonalityVariation.prototype.chance = actualChance;
      };
    }
    if (autonomousOnly || transitionsOnly || controlledQuiet) {
      const { SpritePlayer } = await import(
        pathToFileURL(resolve(root, 'src/animation/player.js')).href
      );
      const actualPlay = SpritePlayer.prototype.play;
      SpritePlayer.prototype.play = function (clip, repetitions) {
        playbackTrace.push({
          clip,
          repetitions,
          at: performance.now(),
          drawStart: drawCalls.length,
        });
        return actualPlay.call(this, clip, repetitions);
      };
    }
    if (autonomousOnly || controlledQuiet) {
      const { PersonalityMotion } = await import(
        pathToFileURL(resolve(root, 'src/positioning/personality.js')).href
      );
      for (const name of ['enter', 'run']) {
        const actual = PersonalityMotion.prototype[name];
        PersonalityMotion.prototype[name] = function (...args) {
          transitionTrace.push({ name, scene: args[0], at: performance.now() });
          return actual.apply(this, args);
        };
      }
      if (motionOff) {
        const { PREFERENCES_KEY } = await import(
          pathToFileURL(resolve(root, 'src/storage/preferences.js')).href
        );
        window.localStorage.setItem(
          PREFERENCES_KEY,
          JSON.stringify({
            schemaVersion: 1,
            hidden: false,
            motion: 'off',
            lastGreetingAt: null,
          }),
        );
      }
    }
    if (transitionsOnly) {
      // Select the bottom entrance; spies still run the motion driver.
      window.sessionStorage.setItem(
        PERSONALITY_SESSION_KEY,
        JSON.stringify({
          schema: 1,
          decks: { arrival: { remaining: ['bottom', 'left', 'right', 'top'], last: null } },
        }),
      );
      const { PersonalityMotion } = await import(
        pathToFileURL(resolve(root, 'src/positioning/personality.js')).href
      );
      for (const name of ['enter', 'recover']) {
        const actual = PersonalityMotion.prototype[name];
        PersonalityMotion.prototype[name] = function (...args) {
          transitionTrace.push({
            name,
            at: performance.now(),
            offset: this.offset,
            needsRecovery: this.needsRecovery,
          });
          return actual.apply(this, args);
        };
      }
    }
    await import(pathToFileURL(resolve(root, 'demo/main.js')).href);
    quietDebug('demo imported');
    if (process.argv.includes('--graphics-failure')) {
      const demo = window.pikaDemo;
      await demo.runScenario('summon');
      assert.equal(globalThis.__graphicsRuntimeImports ?? 0, 0, 'failed graphics cannot load the character runtime');
      assert.equal(globalThis.__graphicsPaletteImports ?? 0, 0, 'failed graphics cannot load scene controls');
      assert.equal(document.querySelector('anime-shop-assistant'), null);
      assert.equal(document.querySelector('.companion-skills'), null);
      assert.equal(document.querySelector('[data-anime-assistant-styles]'), null);
      assert.equal(demo.adapter.subscriberCount, 0);
      assert.equal(rafs.size, 0);
      await demo.addProduct(document.querySelector('[data-add]').dataset.add);
      assert.equal(demo.cartCount, 1, 'cart works while the character is disabled');
      assert.equal(errors.length, 0);
      console.log(JSON.stringify({ result: 'PASS', mode: 'graphics-failure', checked: ['cold failure before runtime or palette imports', 'no character, icons or text fallback', 'no subscription or character RAF', 'cart remains usable'] }));
      return;
    }
    if (controlledQuiet) window.pikaDemo.adapter.update({ permissions: { persistentSettings: false } });
    if (startupOnly) {
      const demo = window.pikaDemo;
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const configurationRequests = () =>
        requests.filter((url) => url.endsWith('/demo/assistant.config.json')).length;
      const expectDeferred = (message) => {
        assert.equal(
          globalThis.__pikaIntegrationModuleLoads ?? 0,
          0,
          message + ': runtime module deferred',
        );
        assert.equal(configurationRequests(), 0, message + ': configuration deferred');
        assert.equal(
          document.querySelector('anime-shop-assistant'),
          null,
          message + ': host deferred',
        );
        assert.equal(demo.adapter.subscriberCount, 0, message + ': no runtime subscription');
      };
      assert.ok(
        document.querySelector('#main h1'),
        'shop content exists before optional runtime starts',
      );
      assert.equal(
        document.querySelector('.companion-settings'),
        null,
        'shop does not display removed companion settings',
      );
      assert.match(
        document.querySelector('.site-header .brand').textContent,
        /ЛУМОЛИ/,
        'header uses the fictional shop brand',
      );
      assert.match(
        document.querySelector('.footer-brand').textContent,
        /ЛУМОЛИ/,
        'footer uses the same shop brand',
      );
      assert.match(document.title, /^ЛУМОЛИ —/, 'page title uses the fictional shop brand');
      const worlds = [
        ['listolesye', 'Листолесье', ['Фонарь первого рассвета', 'Мохлик и тропа чудес']],
        ['iskrovel', 'Искровель', ['Рэйна и секрет лисьей маски']],
        ['aerolin', 'Аэролин', ['Аэрви и облачные острова']],
        ['lunara', 'Лунара', ['Найра и лунные письма', 'Лиора и атлас звёзд']],
      ];
      const oldNames =
        /PIKA\s*\/\s*PIKA|Pok[eé]mon|Покемон|Naruto|Наруто|One\s+Piece|Demon\s+Slayer|Пикачу|Пика-пика/i;
      const accessibleShopCopy = () =>
        [
          document.querySelector('#app').textContent,
          ...[...document.querySelectorAll('#app [alt],#app [aria-label],#app [placeholder]')].map(
            (node) =>
              ['alt', 'aria-label', 'placeholder']
                .map((attribute) => node.getAttribute(attribute) ?? '')
                .join(' '),
          ),
        ].join(' ');
      assert.doesNotMatch(
        accessibleShopCopy(),
        oldNames,
        'shop text and accessible names contain no old brands or real franchises',
      );
      assert.deepEqual(
        [...document.querySelectorAll('.hero-card img')].map((image) => image.alt),
        ['Найра и лунные письма', 'Рэйна и секрет лисьей маски', 'Фонарь первого рассвета'],
        'hero accessible names identify the three fairy tale books',
      );
      const assistantConfig = JSON.parse(await readFile('demo/assistant.config.json', 'utf8'));
      assert.equal(
        assistantConfig.title,
        'Мохлик Тропник',
        'companion configuration uses the new identity',
      );
      assert.match(
        assistantConfig.texts.greeting,
        /Мохлик Тропник/,
        'configured greeting introduces the forest companion',
      );
      assert.match(
        document.querySelector('[data-restore]').textContent,
        /Позвать Мохлика/,
        'summon control uses the declined forest companion name',
      );
      assert.deepEqual(
        Object.fromEntries(
          Object.entries(REPLIES).map(([kind, replies]) => [kind, replies.length]),
        ),
        {
          welcome: 6,
          pet: 8,
          wake: 5,
          interest: 8,
          success: 7,
          error: 6,
          peek: 5,
          drag: 6,
          land: 6,
          tail: 5,
          flip: 5,
        },
        'identity replacement preserves reply decks and their sizes',
      );
      assert.doesNotMatch(
        Object.values(REPLIES).flat().join(' '),
        /Пика|Мох-мох/i,
        'forest companion replies use natural language without the old identity or a repeated catchphrase',
      );
      assert.deepEqual(
        assistantConfig.categories.map((category) => [category.id, category.label, category.href]),
        worlds.map(([id, label]) => [id, label, `/catalog?category=${id}`]),
        'assistant configuration shares the new world routes',
      );
      for (const [id, label, names] of worlds) {
        const filter = document.querySelector(
          `.category-filters a[href="/catalog?category=${id}"]`,
        );
        assert.ok(filter?.textContent.includes(label), `${label} is available in world filters`);
        await demo.navigate(`/catalog?category=${id}`);
        assert.deepEqual(
          [...document.querySelectorAll('.product-card h3 a')].map((node) => node.textContent),
          names,
          `${label} URL filters the actual product catalogue`,
        );
        assert.equal(
          document.querySelector('.category-filters [aria-current="page"]').getAttribute('href'),
          `/catalog?category=${id}`,
          'active world filter matches the route',
        );
        assert.doesNotMatch(
          accessibleShopCopy(),
          oldNames,
          'filtered cards retain fictional names and series',
        );
      }
      expectDeferred('before window load');
      await demo.navigate('/catalog');
      await demo.addProduct('electric-sun', { delay: 0 });
      demo.openDialog('cart');
      assert.equal(
        document.querySelector('#cart-dialog').open,
        true,
        'shop cart works before runtime',
      );
      demo.closeDialog('cart');
      await demo.navigate('/checkout');
      assert.ok(document.querySelector('#checkout-form'), 'checkout route works before runtime');
      assert.equal(demo.cartCount, 1, 'confirmed cart works before runtime');
      expectDeferred('generic shop actions');
      if (startupEarly) {
        document.querySelector('[data-restore]').click();
        document.querySelector('[data-restore]').click();
        void demo.runScenario('summon');
      } else {
        startupState = 'complete';
        window.dispatchEvent(new window.Event('load'));
        if (startupHidden) {
          await wait(30);
          assert.equal(
            startupIdle.size,
            0,
            'hidden automatic startup does not even schedule idle work',
          );
          expectDeferred('hidden after window load');
          startupVisibility = 'visible';
          document.dispatchEvent(new window.Event('visibilitychange'));
        }
        assert.equal(
          startupIdle.size,
          1,
          'one idle opportunity is scheduled after visible window load',
        );
        await wait(30);
        expectDeferred('loaded but idle opportunity has not run');
        const callback = startupIdle.values().next().value;
        startupIdle.clear();
        callback({ didTimeout: false, timeRemaining: () => 40 });
      }
      const deadline = performance.now() + 2000;
      while (!demo.assistant && performance.now() < deadline) await wait(10);
      assert.ok(demo.assistant, 'real init completes from idle or explicit early action');
      assert.equal(
        globalThis.__pikaIntegrationModuleLoads,
        1,
        'runtime module evaluated exactly once',
      );
      assert.equal(
        configurationRequests(),
        1,
        'one shared initialization fetches configuration once',
      );
      assert.equal(document.querySelectorAll('anime-shop-assistant').length, 1);
      assert.equal(demo.adapter.subscriberCount, 1);
      const companionShadow = document.querySelector('anime-shop-assistant').shadowRoot;
      assert.match(
        companionShadow.querySelector('.pika-a-launcher').getAttribute('aria-label'),
        /Мохлика/,
        'the real companion launcher exposes the forest identity accessibly',
      );
      const companionCopy = [
        companionShadow.textContent,
        ...[...companionShadow.querySelectorAll('[aria-label], [alt]')].map((node) =>
          ['aria-label', 'alt'].map((name) => node.getAttribute(name) ?? '').join(' '),
        ),
      ].join(' ');
      assert.doesNotMatch(
        companionCopy,
        /Пикачу|Пика-пика/i,
        'the initialized companion contains no visible or accessible old identity',
      );
      const initialGreeting = companionShadow.querySelector('.pika-a-greeting').textContent;
      assert.ok(
        initialGreeting === assistantConfig.texts.greeting ||
          Object.values(REPLIES).flat().includes(initialGreeting),
        'the initialized companion speaks a configured forest greeting or reply',
      );
      startupState = 'complete';
      startupVisibility = 'visible';
      window.dispatchEvent(new window.Event('load'));
      document.dispatchEvent(new window.Event('visibilitychange'));
      await wait(30);
      assert.equal(startupIdle.size, 0, 'explicit startup cancels deferred automatic callbacks');
      assert.equal(
        configurationRequests(),
        1,
        'late load and visibility do not repeat initialization',
      );
      const initialInstance = demo.assistant;
      await demo.runScenario('reinit');
      assert.equal(demo.assistant, initialInstance, 'explicit repeat init remains idempotent');
      await demo.runScenario('reset');
      assert.notEqual(demo.assistant, initialInstance, 'reset replaces the destroyed instance');
      assert.equal(
        globalThis.__pikaIntegrationModuleLoads,
        1,
        'reset reuses the downloaded runtime module',
      );
      assert.equal(document.querySelectorAll('anime-shop-assistant').length, 1);
      assert.equal(demo.adapter.subscriberCount, 1, 'reset leaves one subscription');
      assert.equal(demo.cartCount, 1, 'reset keeps the confirmed cart');
      await demo.assistant.destroy();
      assert.equal(demo.adapter.subscriberCount, 0);
      assert.equal(rafs.size, 0);
      assert.equal(startupIdle.size, 0);
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(
        JSON.stringify({
          result: 'PASS',
          mode: 'startup',
          path: startupEarly ? 'explicit before load' : 'load then idle',
          visibility: startupHidden ? 'initially hidden' : 'visible',
          checked: [
            'shop content/cart/routes before runtime evaluation',
            'fictional brand/world routes/filtering and accessible names',
            'forest companion identity and unchanged reply deck sizes',
            'load and idle gate',
            'hidden-tab automatic deferral',
            'concurrent explicit early restore and summon',
            'single shared module and init',
            'late load cannot duplicate',
            'idempotent reinit',
            'reset replaces one instance',
            'cleanup',
          ],
        }),
      );
      return;
    }
    if (earlyClick) document.querySelector('[data-restore]').click();
    const wait = quietClock
      ? (ms) => quietClock.advance(ms)
      : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const keepScrolling = () => {
      const pulse = () => {
        scrollPosition = scrollPosition ? 0 : 100000;
        document.dispatchEvent(new window.Event('scroll', { bubbles: true }));
      };
      pulse();
      const interval = setInterval(pulse, 80);
      return () => clearInterval(interval);
    };
    const pointer = (
      target,
      type,
      point,
      pointerType = mobile ? 'touch' : 'mouse',
      pointerId = 7,
    ) => {
      const event = new window.MouseEvent(type, {
        bubbles: true,
        composed: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
      });
      Object.defineProperties(event, {
        pointerId: { value: pointerId },
        pointerType: { value: pointerType },
        isPrimary: { value: true },
      });
      target.dispatchEvent(event);
      return event;
    };
    await wait(150);
    quietDebug('startup clock advanced');
    const demo = window.pikaDemo;
    // Allow slow CI asset loading; --startup checks the startup deadline.
    const initDeadline = performance.now() + 10000;
    while (!demo.assistant && performance.now() < initDeadline) {
      await wait(16);
      // Let native I/O finish before advancing simulated deadlines.
      if (quietClock) await quietClock.waitForIO(16);
    }
    quietDebug('assistant ready');
    const element = document.querySelector('anime-shop-assistant');
    assert.ok(element, 'real init should insert assistant host');
    assert.ok(demo.assistant, 'real init promise should finish');
    const shadow = element.shadowRoot;
    if (earlyClick) {
      const restored = () => calm
        ? shadow.querySelector('dialog').open
        : !shadow.querySelector('.pika-a-greeting').hidden;
      // Wait for the early-click restore after the instance becomes available.
      while (!restored() && performance.now() < initDeadline) await wait(16);
      assert.equal(restored(), true, 'early restore click survives initialization');
      console.log(JSON.stringify({ earlyRestoreClickHandled: true, initReady: !!demo.assistant }));
      await demo.assistant.close();
    }
    assert.equal(element.dataset.state, 'closed', 'real assistant should initialize to closed');
    const launcher = shadow.querySelector('.pika-a-launcher');
    const parseOffset = (element) => {
      const match = element.style.transform.match(/translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/);
      return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 };
    };
    // Supply pointer coordinates; JSDOM has no layout or native hit testing.
    launcher.getBoundingClientRect = () => {
      const offset = parseOffset(launcher);
      const left = Number.parseFloat(launcher.style.left) + offset.x;
      const top = Number.parseFloat(launcher.style.top) + offset.y;
      const size = mobile ? 64 : 96;
      return {
        x: left,
        y: top,
        left,
        top,
        right: left + size,
        bottom: top + size,
        width: size,
        height: size,
        toJSON() {
          return {};
        },
      };
    };
    const center = () => {
      const rect = launcher.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    const feetFloor = () => window.innerHeight - demo.adapter.getContext().ui.bottomReservedPx;
    const assertFeetInsideViewport = (message) => {
      const actor = launcher.getBoundingClientRect();
      assert.ok(actor.left >= -0.1 && actor.right <= window.innerWidth + 0.1, message);
      assert.ok(
        actor.top >= -0.1 && actor.top + (actor.height * 11) / 12 <= feetFloor() + 0.1,
        message,
      );
    };
    // Check styled rectangles using the 96px fallback for unmeasured text.
    const assertSpeechClear = () => {
      const bubble = shadow.querySelector('.pika-a-greeting');
      if (bubble.hidden || bubble.style.visibility === 'hidden') return false;
      const offset = parseOffset(bubble);
      const width = Number.parseFloat(bubble.style.width);
      const height = bubble.offsetHeight || 96;
      const left = Number.parseFloat(bubble.style.left) + offset.x;
      const top = Number.parseFloat(bubble.style.top) + offset.y - height;
      const actor = launcher.getBoundingClientRect();
      const footprintTop =
        actor.top - (launcher.dataset.motion === 'parachute' ? actor.height / 2 : 0);
      const tolerance = 0.1;
      assert.ok(
        left >= 12 - tolerance && top >= 12 - tolerance,
        'speech stays clear of viewport top/left edges',
      );
      assert.ok(
        left + width <= window.innerWidth - 12 + tolerance &&
          top + height <= window.innerHeight - 12 + tolerance,
        'speech stays clear of viewport bottom/right edges',
      );
      assert.ok(
        left + width <= actor.left - 12 + tolerance ||
          left >= actor.right + 12 - tolerance ||
          top + height <= footprintTop - 12 + tolerance ||
          top >= actor.bottom + 12 - tolerance,
        'speech rectangle does not cover the character or its complete canopy',
      );
      return true;
    };
    const frameOf = (call) => {
      const atlas = call.sheet === 'main' ? atlasManifest.atlas : atlasManifest.atlases[call.sheet];
      return (
        (call.sy / atlasManifest.cell.height) * atlas.columns + call.sx / atlasManifest.cell.width
      );
    };
    const waitForMotion = async (deadline = 8000) => {
      const until = performance.now() + deadline;
      while (launcher.dataset.motion && performance.now() < until) await wait(25);
      assert.equal(
        launcher.dataset.motion ?? '',
        '',
        'character path finishes within its finite deadline',
      );
      await wait(35);
    };
    if (cartRouteOnly) {
      await waitForMotion();
      const routeTrace = [];
      const originalPrepare = demo.assistant.preparePagePush;
      const originalFinish = demo.assistant.finishPagePush;
      demo.assistant.preparePagePush = async (side) => {
        const record = { side, prepared: null, at: performance.now() };
        routeTrace.push(record);
        record.prepared = await originalPrepare(side);
        record.readyAt = performance.now();
        return record.prepared;
      };
      demo.assistant.finishPagePush = () => {
        routeTrace.push({ finish: true, at: performance.now() });
        return originalFinish();
      };
      const until = async (condition, message, timeout = 12000) => {
        const deadline = performance.now() + timeout;
        while (!condition() && performance.now() < deadline) await wait(16);
        assert.ok(condition(), `${message}: ${JSON.stringify({ path: location.pathname,
          phase: element.dataset.motion, actor: { left: launcher.getBoundingClientRect().left,
            top: launcher.getBoundingClientRect().top, right: launcher.getBoundingClientRect().right },
          overlay: document.querySelector('.page-push')?.dataset,
          trace: routeTrace.slice(-6), raf: rafs.size,
          animations: routeAnimations.slice(-3).map((animation) => ({ state: animation.playState,
            time: animation.currentTime, duration: animation.options.duration })) })}`);
      };
      const navigateFully = async (href) => {
        let done = false;
        const navigation = demo.navigate(href).then(() => { done = true; });
        await until(() => done, 'the actual router transition settles'); await navigation;
        await waitForMotion(3000);
      };
      const checks = [];
      for (const filled of viewportCommitOnly ? [false] : [false, true]) {
        if (filled) {
          const adding = demo.addProduct('electric-sun', { delay: 0 });
          await wait(16); await adding;
        }
        for (const source of viewportCommitOnly ? ['/new'] : ['/', '/new', '/delivery', '/contacts']) {
          for (const side of ['left', 'right']) {
            await navigateFully(source);
            const grab = center();
            const target = { x: side === 'left' ? 40 + launcher.getBoundingClientRect().width / 2
              : window.innerWidth - 40 - launcher.getBoundingClientRect().width / 2, y: grab.y };
            pointer(launcher, 'pointerdown', grab);
            pointer(launcher, 'pointermove', target);
            pointer(launcher, 'pointerup', target);
            await waitForMotion(2000);
            const canvas = shadow.querySelector('canvas');
            document.querySelector('[data-dialog="cart"]').click();
            const drawer = document.querySelector('#cart-dialog');
            assert.equal(drawer.open, true);
            assert.equal(element.parentNode, drawer, 'the original live host enters the cart top layer');
            assert.equal(demo.cartCount > 0, filled);
            const traceStart = routeTrace.length;
            const animationStart = routeAnimations.length;
            const drawStart = drawCalls.length;
            const link = drawer.querySelector('a[href="/catalog"]');
            assert.ok(link, 'both empty and filled carts expose the actual catalogue link');
            const coldPush = !filled && side === 'left' && source === '/';
            if (coldPush) holdPushImage = true;
            const resizeAtCommit = !filled && source === '/new';
            let commitViewportCheck;
            if (resizeAtCommit) {
              onRouteSlideCreated = (animation) => {
                const oldWidth = quietViewport.width;
                const overlay = document.querySelector('.page-push');
                const beforeResize = launcher.getBoundingClientRect();
                assert.ok(overlay && overlay.dataset.stage === 'slide');
                assert.equal(overlay.dataset.companion, 'true',
                  'the actual runtime has prepared the cart link push');
                assert.equal(animation.currentTime, 0,
                  'commit viewport resize arrives before the first push frame');
                assert.equal(location.pathname, '/catalog');
                assert.equal(drawer.open, false);
                quietViewport.width = oldWidth - 15;
                quietViewport.dispatchEvent(new window.Event('resize'));
                assert.equal(window.innerWidth, oldWidth,
                  'the scrollbar takes viewport width without resizing the browser window');
                assert.equal(overlay.isConnected, true,
                  'the commit resize cannot reveal the whole new page before pushing');
                assert.equal(animation.playState, 'paused');
                commitViewportCheck = { animation, oldWidth, overlay, beforeResize,
                  resizeAt: performance.now() };
              };
            }
            link.click();
            if (coldPush) {
              await until(() => pendingPushLoads.length > 0, 'the real optional push sheet starts loading');
              const waitingBefore = launcher.getBoundingClientRect();
              pointer(launcher, 'pointerover', center(), 'mouse');
              await wait(2400);
              const waiting = launcher.getBoundingClientRect();
              assert.ok(waiting.left >= 0 && waiting.right <= window.innerWidth,
                `cold optional push loading must keep the character visible: ${JSON.stringify({ actor: { left: waiting.left, right: waiting.right },
                  phase: element.dataset.motion, trace: routeTrace.slice(traceStart) })}`);
              assert.ok(Math.abs(waiting.left - waitingBefore.left) < .1 && Math.abs(waiting.top - waitingBefore.top) < .1,
                'cold loading owns a stable visible position, without an automatic departure');
              assert.equal(document.querySelector('.companion-skills').hidden, true,
                'hover cannot open emotion buttons while the transition awaits optional graphics');
              assert.equal(rafs.size, 0, 'cold graphics waiting owns no RAF');
              holdPushImage = false;
              for (const load of pendingPushLoads.splice(0)) load();
            }
            await until(() => routeTrace.slice(traceStart).some((entry) => entry.prepared === true),
              'cart navigation completes the real approach and brace');
            assert.equal(routeTrace.slice(traceStart).find((entry) => entry.side)?.side, side);
            assert.equal(drawer.open, false);
            assert.equal(element.parentNode, document.body, 'async native close restores the same live host');
            assert.equal(shadow.querySelector('canvas'), canvas);
            if (resizeAtCommit) {
              await until(() => Boolean(commitViewportCheck),
                'the actual covered route receives its scrollbar viewport event');
              await wait(32);
              assert.equal(commitViewportCheck.overlay.isConnected, true,
                'the real viewport observer preserves the old page after its queued layout pass');
              assert.equal(commitViewportCheck.animation.playState, 'paused');
              assert.equal(element.dataset.motion, 'page-push',
                'the real runtime keeps its prepared page-push session through width-only resize');
              assert.ok(!routeTrace.slice(traceStart).some((entry) => entry.finish),
                'the first viewport pass cannot release the character at the edge');
              await wait(750);
              const following = launcher.getBoundingClientRect();
              const moved = following.left - commitViewportCheck.beforeResize.left;
              assert.ok(side === 'left' ? moved > 1 : moved < -1,
                'real page progress still moves the character into the new visible page');
              assert.ok(drawCalls.slice(drawStart).some((call) => call.sheet === 'push'),
                'actual push footsteps are drawn after the width-only event');
              if (side === 'right') {
                quietViewport.width = commitViewportCheck.oldWidth;
                quietViewport.dispatchEvent(new window.Event('resize'));
                await wait(32);
                assert.equal(commitViewportCheck.overlay.isConnected, true,
                  'the disappearing scrollbar also preserves the same running screen');
                assert.equal(element.dataset.motion, 'page-push');
                assert.equal(commitViewportCheck.animation.playState, 'paused');
              }
            }
            await until(() => !document.querySelector('.page-push'), 'finite WAAPI removes the page snapshot');
            await waitForMotion(3000);
            assert.equal(location.pathname, '/catalog');
            assert.equal(demo.adapter.getContext().pageType, 'catalog');
            assert.equal(launcher.hidden, false);
            assertFeetInsideViewport('cart routing leaves the actor visible on the new page floor');
            assert.ok(routeTrace.slice(traceStart).some((entry) => entry.finish), 'router calls the real finishPagePush');
            assert.ok(routeAnimations.slice(animationStart).some((animation) => animation.element.matches('.page-push-panel') && animation.options.duration === 3000),
              'the actual router, not the static fallback, runs both finite push efforts');
            const clip = side === 'left' ? 'push-right' : 'push-left';
            const frames = drawCalls.slice(drawStart).filter((call) => call.sheet === 'push').map(frameOf);
            for (const frame of atlasManifest.clips[clip].frames) assert.ok(frames.includes(frame), `actual ${clip} draws ${frame}`);
            assert.equal(rafs.size, 0, 'the combined sprite and page progress loops both finish');
            if (resizeAtCommit && side === 'left') {
              assert.equal(quietViewport.width, commitViewportCheck.oldWidth - 15,
                'the scrollbar still consumes space when the real runtime releases the screen');
              const released = launcher.getBoundingClientRect();
              assert.ok(released.left >= quietViewport.offsetLeft - .1 &&
                released.right <= quietViewport.offsetLeft + quietViewport.width + .1,
                'release fits the complete character into the current narrower visible viewport');
              assert.ok(Math.abs(released.top + released.height * 11 / 12 -
                (quietViewport.offsetTop + quietViewport.height - demo.adapter.getContext().ui.bottomReservedPx)) < .1,
                'release places the feet on the current visible browser support');
              quietViewport.width = commitViewportCheck.oldWidth;
              quietViewport.dispatchEvent(new window.Event('resize'));
              await wait(35);
              assert.equal(rafs.size, 0, 'restoring the viewport after release leaves no animation loop');
            }
            checks.push({ source, cart: filled ? 'filled' : 'empty', side,
              viewportCommitResize: resizeAtCommit,
              narrowerViewportAtRelease: resizeAtCommit && side === 'left', frames: [...new Set(frames)] });
          }
        }
      }
      for (const source of viewportCommitOnly ? [] : ['/new', '/delivery', '/contacts']) {
        for (const scene of ['flip', 'peek', 'arrival']) {
          await navigateFully(source);
          const link = source === '/new'
            ? document.querySelector('#main .product-card .product-art-link')
            : source === '/delivery'
              ? document.querySelector('#main a[href="/catalog"]')
              : document.querySelector('.desktop-nav a[href="/catalog"]');
          assert.ok(link, `${source} exposes its actual page link`);
          const target = new URL(link.href).pathname;
          scrollPosition = 240;
          document.dispatchEvent(new window.Event('scroll', { bubbles: true }));
          const activity = demo.assistant.perform(scene);
          await wait(100);
          assert.ok(launcher.dataset.motion, `${scene}: a direct page click happens during a real active scene`);
          const traceStart = routeTrace.length;
          const animationStart = routeAnimations.length;
          link.click();
          await until(() => routeTrace.slice(traceStart).some((entry) => entry.prepared === true),
            `${source} direct link must prepare the character instead of silently omitting the push`);
          await until(() => !document.querySelector('.page-push'), 'a direct link finishes its finite page transition');
          await activity;
          await waitForMotion(3000);
          assert.equal(location.pathname, target);
          assert.ok(routeAnimations.slice(animationStart).some((animation) =>
            animation.element.matches('.page-push-panel') && animation.options.duration === 3000),
            `${source} direct link uses both character push efforts`);
          assertFeetInsideViewport('direct links leave the character on the visible new support');
          assert.equal(rafs.size, 0, 'direct page clicks clean up sprite and page loops');
          checks.push({ source, direct: true, target, during: scene });
        }
      }
      await demo.assistant.destroy();
      assert.equal(rafs.size, 0); assert.equal(pointerCaptures.size, 0);
      assert.equal(demo.adapter.subscriberCount, 0); assert.equal(errors.length, 0, errors.join('\n'));
      console.log(JSON.stringify({ result: 'PASS', mode: 'cart-route', layout: mobile ? 'compact' : 'desktop', checks,
        checked: [...(viewportCommitOnly ? [] : [
          'actual cart link clicks from home/new/delivery/contacts', 'direct news-card/delivery/contact clicks during flip/peek/arrival',
          'cold optional sheet waits visibly with closed palette/no automatic departure/0 RAF']),
          'navigation scroll is delivered asynchronously after the route commit', 'async native dialog close event', 'same real init/player/host',
          'actual /new empty cart link width-only visual viewport resize before first push frame preserves page cover/runtime session/footsteps',
          'left push release fits the complete actor into the still-narrower viewport and places feet on current support',
          'real approach/brace/two WAAPI push efforts/release', 'visible new floor and 0 RAF cleanup'],
        limitations: 'JSDOM mocks WAAPI and modal browser primitives; native layout and pixels are not rendered.' }));
      return;
    }
    if (pagePushOnly) {
      await waitForMotion();
      await demo.navigate('/product/electric-sun'); await waitForMotion(2000);
      const actualRuntime = await import(pathToFileURL(resolve(root, 'src/core/runtime.js')).href);
      assert.equal(typeof actualRuntime.AssistantRuntime, 'function', 'the page push uses the real runtime');
      const settle = async (promise, message) => {
        let done = false, result;
        void promise.then((value) => { done = true; result = value; });
        const deadline = performance.now() + 3000;
        while (!done && performance.now() < deadline) await wait(16);
        assert.ok(done, message); return result;
      };
      const checks = [];
      for (const side of ['left', 'right']) {
        const supportBefore = feetFloor();
        const browserFloor = quietViewport.offsetTop + quietViewport.height;
        const nextRoute = side === 'left' ? '/catalog' : '/product/electric-sun';
        const before = launcher.getBoundingClientRect();
        const preparationPlayback = playbackTrace.length;
        const preparationDraws = drawCalls.length;
        const preparing = demo.assistant.preparePagePush(side);
        const synchronous = launcher.getBoundingClientRect();
        assert.ok(Math.abs(synchronous.left - before.left) < .1 && Math.abs(synchronous.top - before.top) < .1,
          'preparation preserves the exact pixel position before leaving a store panel');
        if (supportBefore < browserFloor - .1) {
          const descentDeadline = performance.now() + 3000;
          while (element.dataset.motion !== 'fall' && performance.now() < descentDeadline) await wait(1);
          assert.equal(element.dataset.motion, 'fall', 'the actor first leaves the old fixed panel');
          await wait(64);
          const falling = launcher.getBoundingClientRect();
          assert.ok(falling.top > before.top && falling.top + falling.height * 11 / 12 < browserFloor,
            'the actor descends through actual intermediate frames rather than teleporting down');
        }
        assert.equal(await settle(preparing, 'preparation finishes after actual movement/assets'), true);
        assert.equal(element.dataset.motion, 'page-push');
        assert.ok(Math.abs(launcher.getBoundingClientRect().top + before.height * 11 / 12 - browserFloor) < .1,
          'preparation reaches the full browser floor before the first push');
        if (supportBefore < browserFloor - .1) {
          const preparationClips = playbackTrace.slice(preparationPlayback).map((entry) => entry.clip);
          assert.ok(preparationClips.includes('fall') && preparationClips.includes('land'), 'preparation plays fall and landing');
          assert.ok(!preparationClips.includes('parachute'), 'a short panel descent uses no random canopy');
          const drawn = drawCalls.slice(preparationDraws);
          for (const clip of ['fall', 'land']) {
            const descriptor = atlasManifest.clips[clip];
            assert.ok(drawn.some((call) => call.sheet === (descriptor.sheet ?? 'main') && descriptor.frames.includes(frameOf(call))),
              `the real ${clip} artwork is drawn before the approach finishes`);
          }
        }
        const brace = side === 'left' ? 'push-right' : 'push-left';
        const tip = (side === 'left' ? 170 : 22) / 192 * launcher.getBoundingClientRect().width;
        const boundary = (progress) => (side === 'left' ? progress : 1 - progress) * window.innerWidth;
        assert.equal(Number(shadow.querySelector('canvas').dataset.frame), atlasManifest.poses[brace]);
        assert.equal(rafs.size, 0, 'the braced hold owns no animation frame loop');
        assert.ok(Math.abs(launcher.getBoundingClientRect().left + tip - boundary(0)) < .1);
        demo.assistant.setInteractionHold(false);
        const pushDrawStart = drawCalls.length;
        const effortProgress = (raw) => {
          const segment = Math.min(1, Math.floor(raw * 2));
          const local = Math.min(1, raw * 2 - segment);
          let low = 0, high = 1;
          for (let sample = 0; sample < 16; sample++) {
            const t = (low + high) / 2;
            const x = 3 * (1 - t) ** 2 * t * .6 + 3 * (1 - t) * t ** 2 * .35 + t ** 3;
            if (x < local) low = t; else high = t;
          }
          const t = (low + high) / 2, eased = 3 * (1 - t) * t ** 2 + t ** 3;
          const distances = [0, .5, 1];
          return distances[segment] + eased * (distances[segment + 1] - distances[segment]);
        };
        for (let step = 0; step <= 120; step++) {
          const progress = effortProgress(step / 120);
          demo.assistant.setPagePushProgress(progress);
          const actor = launcher.getBoundingClientRect();
          assert.ok(Math.abs(actor.left + tip - boundary(progress)) < .1, 'paw tips stay attached to the page boundary');
          assert.ok(Math.abs(actor.top + actor.height * 11 / 12 - browserFloor) < .1, 'both efforts keep the feet on the browser floor through a covered commit');
          if (step === 5) {
            const beforeCommit = launcher.getBoundingClientRect();
            await demo.navigate(nextRoute);
            const afterCommit = launcher.getBoundingClientRect();
            assert.ok(Math.abs(afterCommit.left - beforeCommit.left) < .1 && Math.abs(afterCommit.top - beforeCommit.top) < .1,
              'the actual product/catalog commit changes sticky support without moving the actor');
            assert.equal(document.querySelector('.sticky-buy').hidden, side === 'left');
            assert.equal(demo.adapter.getContext().ui.bottomReservedPx, (mobile ? 68 : 0) + (side === 'right' ? (mobile ? 76 : 84) : 0));
          }
          if (step === 9) document.dispatchEvent(new window.Event('scroll', { bubbles: true }));
          await wait(25);
          assert.equal(element.dataset.motion, 'page-push', 'a covered commit and scroll preserve the push');
          assert.ok(rafs.size <= 1, 'only the finite sprite loop runs; progress adds none');
        }
        const steps = drawCalls.slice(pushDrawStart).filter((call) => call.sheet === 'push').map(frameOf);
        for (const frame of atlasManifest.clips[brace].frames) assert.ok(steps.includes(frame), `${brace} actually draws step ${frame}`);
        const final = launcher.getBoundingClientRect();
        demo.assistant.finishPagePush();
        const resting = launcher.getBoundingClientRect();
        assert.ok(Math.abs(resting.left - final.left) < resting.width, 'release uses the nearby visible resting point');
        assert.ok(Math.abs(resting.top - final.top) < .1, 'switching support begins continuously at release');
        if (demo.adapter.getContext().ui.bottomReservedPx > 0) assert.equal(element.dataset.motion, 'climb', 'the actor climbs onto the new page panel after releasing its edge');
        await waitForMotion(2000);
        assertFeetInsideViewport('release remains fully visible on the floor');
        assert.equal(element.dataset.motion ?? '', ''); assert.equal(rafs.size, 0);
        checks.push({ side, pose: atlasManifest.poses[brace], stepFrames: [...new Set(steps)], fromFloor: supportBefore, toFloor: feetFloor() });
      }
      for (const cancellation of ['replace', 'off', 'hide', 'resize', 'pagehide', 'blocker']) {
        const start = launcher.getBoundingClientRect();
        const preparing = demo.assistant.preparePagePush('left');
        const descentDeadline = performance.now() + 3000;
        const descending = () => launcher.getBoundingClientRect().top > start.top + 1;
        while (!descending() && performance.now() < descentDeadline) await wait(1);
        assert.ok(descending(), 'cancellation exercises an actual drawn descent after asset readiness');
        assert.ok(launcher.getBoundingClientRect().top + start.height * 11 / 12 < window.innerHeight,
          'the cancelled descent has not yet reached the browser floor');
        if (cancellation === 'replace') demo.assistant.finishPagePush();
        else if (cancellation === 'off') await demo.assistant.setMotion('off');
        else if (cancellation === 'hide') await demo.assistant.hide();
        else if (cancellation === 'blocker') demo.adapter.update({ ui: { blockers: ['page-push-review'] } });
        else window.dispatchEvent(new window.Event(cancellation));
        assert.equal(await settle(preparing, 'cancelled preparation settles immediately'), false);
        if (cancellation === 'pagehide') {
          assert.equal(element.dataset.motion ?? '', ''); assert.equal(rafs.size, 0, 'a hidden page cannot start a support climb');
          const suspended = launcher.getBoundingClientRect();
          let pageHidden = true;
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => pageHidden });
          document.dispatchEvent(new window.Event('visibilitychange'));
          demo.adapter.update({ ui: { blockers: ['suspended-cart-review'] } });
          window.dispatchEvent(new window.Event('resize'));
          await wait(64);
          assert.equal(element.dataset.motion ?? '', ''); assert.equal(rafs.size, 0, 'a late layout callback cannot restart a suspended page');
          assert.ok(Math.abs(launcher.getBoundingClientRect().top - suspended.top) < .1 && Math.abs(launcher.getBoundingClientRect().left - suspended.left) < .1,
            'suspension keeps the actual drawn position through hidden visibility and a store blocker');
          demo.adapter.update({ ui: { blockers: [] } });
          window.dispatchEvent(new window.Event('pageshow'));
          await wait(32); assert.equal(rafs.size, 0, 'pageshow waits until native visibility is restored');
          pageHidden = false;
          document.dispatchEvent(new window.Event('visibilitychange'));
          assert.ok(Math.abs(launcher.getBoundingClientRect().top - suspended.top) < .1, 'BFcache restoration begins without teleporting onto a panel');
          assert.equal(element.dataset.motion, 'climb');
          delete document.hidden;
        }
        await waitForMotion(2000); assert.equal(element.dataset.motion ?? '', ''); assert.equal(rafs.size, 0);
        if (cancellation === 'off') await demo.assistant.setMotion('system');
        else if (cancellation === 'hide') { await demo.assistant.restore(); await wait(2000); }
        else if (cancellation === 'blocker') demo.adapter.update({ ui: { blockers: [] } });
      }
      const autonomousStart = transitionTrace.length;
      const resumeDeadline = performance.now() + 12000;
      while (!transitionTrace.slice(autonomousStart).some((event) => event.name === 'run') && performance.now() < resumeDeadline) await wait(32);
      assert.ok(transitionTrace.slice(autonomousStart).some((event) => event.name === 'run'), 'finishing the transition releases automatic scene scheduling');
      await waitForMotion(30000);
      const finalPreparing = demo.assistant.preparePagePush('right'); await wait(32);
      await demo.assistant.destroy();
      assert.equal(await settle(finalPreparing, 'destroy resolves pending preparation'), false);
      assert.equal(rafs.size, 0); assert.equal(pointerCaptures.size, 0); assert.equal(demo.adapter.subscriberCount, 0);
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(JSON.stringify({ result: 'PASS', mode: 'page-push', layout: mobile ? 'compact' : 'desktop',
        checks, checked: ['real approach/brace asset readiness', 'paw-to-page contact both sides', 'actual push-sheet footsteps',
          'finite panel descent/landing before approach', 'actual product/catalog sticky support commit/scroll', 'browser floor held through both efforts and finite new panel climb',
          'no extra progress RAF', 'nearby resting place/no home return', 'automatic cadence resumes', 'cancel/off/hide/resize/pagehide/blocker/destroy cleanup'],
        limitations: 'JSDOM supplies browser primitives; native artwork/contact pixels were not rendered.' }));
      return;
    }
    if (skillsOnly) {
      await waitForMotion();
      const names = ['wiggle', 'sit', 'ears', 'scratch', 'stretch', 'nose'];
      const calls = [];
      const actualPerform = demo.assistant.perform;
      demo.assistant.perform = (scene) => {
        const call = { scene, at: performance.now(), drawStart: drawCalls.length, done: false };
        calls.push(call);
        call.promise = actualPerform(scene).then(() => { call.done = true; });
        return call.promise;
      };
      const until = async (condition, message, timeout = 30000) => {
        const deadline = performance.now() + timeout;
        while (!condition() && performance.now() < deadline) await wait(16);
        assert.ok(condition(), message);
      };
      const selectSkill = (name) => {
        const palette = document.querySelector('.companion-skills');
        if (palette.hidden && mobile) {
          pointer(launcher, 'pointerdown', center(), 'touch');
          pointer(launcher, 'pointerup', center(), 'touch');
          launcher.click();
        } else if (palette.hidden) pointer(launcher, 'pointerover', center(), 'mouse');
        assert.equal(palette.hidden, false, 'the real hover opens the arc');
        assert.deepEqual([...palette.querySelectorAll('button')].map((button) => button.dataset.companionSkill), names);
        assert.equal(palette.querySelectorAll('button svg').length, 6, 'all six icons are inline vectors, including nose');
        const button = palette.querySelector(`[data-companion-skill="${name}"]`);
        const point = { x: parseFloat(palette.style.left) + parseFloat(button.style.left) + 20,
          y: parseFloat(palette.style.top) + parseFloat(button.style.top) + 20 };
        if (!mobile) launcher.dispatchEvent(new window.MouseEvent('pointerout', {
          bubbles: true, composed: true, relatedTarget: palette.querySelector('.companion-skills-bridge'),
        }));
        pointer(button, 'pointerover', point);
        pointer(button, 'pointerdown', point); button.focus();
        pointer(button, 'pointerup', point); button.click();
        assert.equal(palette.hidden, false, 'selection keeps the arc available for the next emotion');
      };
      const leaveSkills = () => {
        const point = { x: window.innerWidth - 1, y: 0 };
        pointer(document.body, 'pointerover', point, 'mouse');
        pointer(document.body, 'pointermove', point, 'mouse');
        assert.equal(document.querySelector('.companion-skills').hidden, true, 'a real departure closes the selection session');
      };
      const actualClips = [];
      assert.equal(imageRequests.filter((source) => imageSheet(source)?.[0] === 'leisure').length, 0);
      const freshBefore = calls.length; selectSkill('nose');
      await until(() => calls.length > freshBefore, 'fresh nose reaches the public performer');
      const freshNose = calls.slice(freshBefore).find((call) => call.scene === 'nose');
      await until(() => freshNose.done, 'fresh nose loads leisure and finishes');
      const freshFrames = drawCalls.slice(freshNose.drawStart).filter((call) => call.sheet === 'leisure').map(frameOf);
      for (const frame of atlasManifest.clips.nose.frames) assert.ok(freshFrames.includes(frame), `fresh nose renders ${frame}`);
      assert.equal(imageRequests.filter((source) => imageSheet(source)?.[0] === 'leisure').length, 1);
      pointer(launcher, 'pointerover', center(), 'mouse');
      const gazeAnchor = launcher.getBoundingClientRect();
      const gazePosition = launcher.style.transform;
      for (const [pose, dx] of [['up', 0], ['up-left', -100], ['up-right', 100]]) {
        assert.ok(Number.isInteger(atlasManifest.poses[pose]), `actual main manifest exposes ${pose}`);
        demo.assistant.lookAt({ x: gazeAnchor.left + gazeAnchor.width / 2 + dx, y: gazeAnchor.top - 100 });
        await wait(16);
        assert.equal(shadow.querySelector('canvas').dataset.frame, String(atlasManifest.poses[pose]), `one-shot held gaze draws ${pose}`);
        assert.equal(launcher.style.transform, gazePosition, 'gaze never moves the actor');
        assert.equal(rafs.size, 0, 'one-shot pupil direction owns no frame loop');
      }
      const gazePalette = document.querySelector('.companion-skills');
      for (const index of [0, 3, 5]) {
        const button = gazePalette.querySelectorAll('button')[index];
        pointer(button, 'pointerover', {
          x: parseFloat(gazePalette.style.left) + parseFloat(button.style.left) + 20,
          y: parseFloat(gazePalette.style.top) + parseFloat(button.style.top) + 20,
        }, 'mouse');
        const dx = parseFloat(gazePalette.style.left) + parseFloat(button.style.left) + 20 - (gazeAnchor.left + gazeAnchor.width / 2);
        const dy = parseFloat(gazePalette.style.top) + parseFloat(button.style.top) + 20 - (gazeAnchor.top + gazeAnchor.height / 2);
        const expected = dy < 0 && Math.abs(dx) > Math.abs(dy) * .35 ? (dx < 0 ? 'up-left' : 'up-right') : 'up';
        await wait(16);
        assert.equal(shadow.querySelector('canvas').dataset.frame, String(atlasManifest.poses[expected]), 'actual button hover looks at its positioned centre');
      }
      leaveSkills();
      const controller = quietControllers.at(-1);
      controller.react('product:enter');
      assert.equal(element.dataset.animation, 'idle'); assert.equal(controller.snapshot.pose, 'curious');
      pointer(launcher, 'pointerover', center(), 'mouse');
      demo.assistant.lookAt({ x: center().x, y: gazeAnchor.top - 100 });
      await until(() => element.dataset.animation === 'static', 'idle microgesture finishes before applying gaze');
      await wait(16);
      assert.equal(controller.snapshot.pose, null, 'held gaze clears the completed curiosity pose');
      assert.equal(shadow.querySelector('canvas').dataset.frame, String(atlasManifest.poses.up));
      assert.equal(rafs.size, 0);
      const quietGaze = demo.assistant.perform('nose'); await wait(200);
      pointer(launcher, 'pointerover', center(), 'mouse');
      const quietPlayed = playbackTrace.length;
      demo.assistant.lookAt({ x: center().x - 100, y: gazeAnchor.top - 100 }); await wait(150);
      assert.equal(element.dataset.animation, 'nose', 'selecting a gaze target never interrupts the selected emotion');
      assert.equal(playbackTrace.length, quietPlayed, 'gaze does not restart the quiet clip');
      await until(() => calls.at(-1).done, 'the selected nose finishes completely before the stored gaze');
      await quietGaze; await wait(16);
      assert.equal(shadow.querySelector('canvas').dataset.frame, String(atlasManifest.poses['up-left']));
      assert.equal(rafs.size, 0);
      leaveSkills();
      const protectedSit = demo.assistant.perform('sit'); await wait(100);
      controller.perform('peek', false);
      pointer(launcher, 'pointerover', center(), 'mouse');
      await until(() => calls.at(-1).done, 'sit finishes while hover holds a pending physical route');
      await protectedSit;
      const pendingBefore = calls.length;
      selectSkill('nose');
      await until(() => calls.length > pendingBefore, 'the first click wins over the pending automatic peek');
      const pendingNose = calls.at(-1);
      assert.equal(pendingNose.scene, 'nose');
      await until(() => pendingNose.done, 'pending-route first-click nose renders and completes');
      const pendingFrames = drawCalls.slice(pendingNose.drawStart).filter((call) => call.sheet === 'leisure').map(frameOf);
      for (const frame of atlasManifest.clips.nose.frames) assert.ok(pendingFrames.includes(frame), `pending-route nose renders ${frame}`);
      const sessionPalette = document.querySelector('.companion-skills');
      const sessionPosition = launcher.style.transform;
      for (const name of ['scratch', 'nose', ...names]) {
        assert.equal(sessionPalette.hidden, false, `${name} remains available without reopening`);
        const before = calls.length; selectSkill(name);
        await until(() => calls.length > before, `sequential first press dispatches ${name}`);
        const selected = calls.at(-1);
        assert.equal(selected.scene, name); assert.equal(controller.interactionOnHold, true);
        await wait(32);
        assert.equal(element.dataset.animation, name, `${name} wins over the pending autonomous departure`);
        assert.equal(sessionPalette.hidden, false, `${name} does not close controls during playback`);
        await until(() => selected.done, `sequential ${name} finishes`);
        const clip = atlasManifest.clips[name];
        const frames = drawCalls.slice(selected.drawStart).filter((call) => call.sheet === (clip.sheet ?? 'main')).map(frameOf);
        for (const frame of new Set(clip.frames)) assert.ok(frames.includes(frame), `sequential ${name} draws actual crop ${frame}`);
        await wait(250);
        assert.equal(sessionPalette.hidden, false, 'completion keeps the session open');
        assert.equal(controller.interactionOnHold, true, 'completion retains automatic hold');
        assert.equal(element.dataset.motion || '', '', 'no automatic departure starts between choices');
        assert.equal(launcher.style.transform, sessionPosition, 'the chosen emotion returns to the same resting position');
        assert.equal(rafs.size, 0, 'the completed emotion leaves no frame loop');
      }
      for (const name of names) {
        leaveSkills();
        const moving = demo.assistant.perform('stroll');
        await wait(160);
        assert.equal(element.dataset.motion, 'stroll');
        const before = calls.length, offset = launcher.style.transform;
        selectSkill(name); await wait(32);
        assert.equal(calls.length, before + 1, `${name} is dispatched immediately without a queue`);
        await moving;
        const selected = calls.slice(before).find((call) => call.scene === name);
        assert.ok(selected, `${name} reaches the real public performer`);
        const clip = atlasManifest.clips[name];
        assert.equal(element.dataset.animation, name, `${name} reaches the real controller/player`);
        assert.equal(selected.done, false, `${name} does not resolve as a no-op`);
        assert.equal(launcher.style.transform, offset, `${name} starts at the held position without a teleport`);
        await until(() => selected.done, `${name} actually finishes`);
        const frames = drawCalls.slice(selected.drawStart).filter((call) => call.sheet === (clip.sheet ?? 'main')).map(frameOf);
        for (const frame of new Set(clip.frames)) assert.ok(frames.includes(frame), `${name} renders actual crop ${frame}`);
        assert.equal(element.dataset.motion ?? '', '');
        actualClips.push({ scene: name, distinctFrames: new Set(frames).size });
      }
      // Explicit choices replace a running reaction immediately; hover alone does not.
      for (const preceding of ['wave', 'happy']) {
        if (preceding === 'wave') await demo.assistant.open();
        else {
          const added = demo.addProduct('electric-sun', { delay: 0 });
          await wait(32); await added;
        }
        await wait(32);
        assert.equal(element.dataset.animation, preceding);
        const before = calls.length; selectSkill('nose'); await wait(32);
        assert.equal(calls.length, before + 1, `nose immediately replaces real ${preceding}`);
        assert.equal(element.dataset.animation, 'nose');
        const selected = calls.slice(before).find((call) => call.scene === 'nose');
        assert.ok(selected); await until(() => selected.done, `nose after ${preceding} finishes`);
      }
      const sitting = demo.assistant.perform('sit'); await wait(250);
      pointer(launcher, 'pointerover', center(), 'mouse'); await wait(32);
      assert.equal(element.dataset.animation, 'sit', 'hover alone leaves the current quiet clip playing');
      const sittingBefore = calls.length; selectSkill('nose'); await wait(32);
      assert.equal(element.dataset.animation, 'nose', 'explicit nose immediately replaces sit');
      assert.equal(calls.length, sittingBefore + 1);
      await sitting;
      const afterSit = calls.slice(sittingBefore).find((call) => call.scene === 'nose');
      assert.ok(afterSit); await until(() => afterSit.done, 'nose after sit finishes');
      document.dispatchEvent(new window.Event('scroll', { bubbles: true }));
      const scrollingBefore = calls.length; selectSkill('nose');
      await until(() => calls.length > scrollingBefore, 'an explicit nose click is not lost during active scroll');
      const duringScroll = calls.slice(scrollingBefore).find((call) => call.scene === 'nose');
      assert.ok(duringScroll); await wait(32);
      assert.equal(element.dataset.animation, 'nose');
      assert.equal(duringScroll.done, false, 'scroll-time nose plays rather than resolving as a no-op');
      await until(() => duringScroll.done, 'scroll-time nose completes');
      const repeatedBefore = calls.length; selectSkill('nose');
      await until(() => calls.length > repeatedBefore, 'a repeated same emotion restarts from its first click');
      const repeatNose = calls.at(-1);
      await until(() => repeatNose.done, 'repeated nose completes with a fresh full clip');
      const repeatedFrames = drawCalls.slice(repeatNose.drawStart).filter((call) => call.sheet === 'leisure').map(frameOf);
      for (const frame of atlasManifest.clips.nose.frames) assert.ok(repeatedFrames.includes(frame), `repeated nose renders ${frame}`);
      const cartDialog = document.querySelector('#cart-dialog');
      document.querySelector('[data-dialog="cart"]').click(); await wait(32);
      assert.equal(cartDialog.open, true);
      const cartBefore = calls.length; selectSkill('nose');
      await until(() => calls.length > cartBefore && calls.at(-1).done, 'first cart nose actually plays through onEnd');
      cartDialog.querySelector('[data-close="cart"]').click(); await wait(32);
      leaveSkills();
      const walking = demo.assistant.perform('stroll'); await wait(100);
      const replacedBefore = calls.length;
      selectSkill('sit'); selectSkill('nose');
      await until(() => calls.length >= replacedBefore + 2, 'both explicit choices dispatch immediately');
      assert.deepEqual(calls.slice(replacedBefore).map((call) => call.scene), ['sit', 'nose']);
      await walking;
      await until(() => calls.at(-1).done, 'replacement nose completes');
      leaveSkills();
      const heldWalk = demo.assistant.perform('stroll'); await wait(160);
      const heldPosition = launcher.style.transform;
      pointer(launcher, 'pointerover', center(), 'mouse'); await heldWalk;
      assert.equal(element.dataset.motion ?? '', '', 'hover stops a grounded walk');
      await wait(12000);
      assert.equal(launcher.style.transform, heldPosition, 'the actor stays at the same point while the palette is open');
      assert.equal(element.dataset.motion ?? '', '', 'automatic routes cannot escape the palette');
      assert.equal(rafs.size, 0, 'standing selection owns no animation frame loop');
      leaveSkills();
      const peeking = demo.assistant.perform('peek'); await wait(32);
      pointer(launcher, 'pointerover', center(), 'mouse');
      assert.equal(document.querySelector('.companion-skills').hidden, true, 'neither full nor head-only peeking opens controls');
      const endingPeek = demo.assistant.perform('nose');
      await until(() => calls.at(-1).done, 'a direct nose action completes after cancelling the peek');
      await endingPeek; await peeking;
      for (const cancellation of ['off', 'hide']) {
        leaveSkills();
        const route = demo.assistant.perform('stroll'); await wait(100);
        const before = calls.length;
        pointer(launcher, 'pointerover', center(), 'mouse');
        if (cancellation === 'off') await demo.assistant.setMotion('off');
        else await demo.assistant.hide();
        await wait(32); await route;
        assert.equal(calls.length, before, `${cancellation} releases hover without dispatching a scene`);
        if (cancellation === 'off') {
          pointer(launcher, 'pointerover', center(), 'mouse');
          const button = document.querySelector('[data-companion-skill="nose"]');
          assert.equal(button.getAttribute('aria-disabled'), 'true'); button.click();
          assert.equal(calls.length, before, 'motion-off click is explained without a silent performer no-op');
          const tooltip = document.querySelector('.companion-skills-tooltip');
          assert.equal(tooltip.hidden, false); assert.match(tooltip.textContent, /Движения выключены/);
        }
        if (cancellation === 'off') await demo.assistant.setMotion('system');
        else await demo.assistant.restore();
        await until(() => !(element.dataset.motion || ['wave', 'wake'].includes(element.dataset.animation)), 'restore finishes');
      }
      demo.assistant.perform = actualPerform;
      await demo.assistant.destroy(); await wait(0);
      assert.equal(rafs.size, 0); assert.equal(demo.adapter.subscriberCount, 0);
      assert.equal(document.querySelector('.companion-skills').hidden, true);
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(JSON.stringify({ result: 'PASS', mode: 'skills-companion', layout: mobile ? 'compact' : 'desktop',
        clips: actualClips, checked: ['actual6 SVG buttons/public performer/frames/completion', 'immediate replacement',
          'first real pointer/focus/up/click (touch on compact)', 'up/up-left/up-right finite gaze', 'button hover gaze/curiosity priority/quiet protected', 'pending automatic route cannot erase click', 'repeated nose restart', 'cart first press',
          'persistent scratch/nose/all6 sequential clicks with held pending peek', 'hover freezes position/no automatic escape/0RAF', 'no peek controls', 'fresh leisure nose', 'nose after wave/happy/sit', 'nose during scroll', 'latest selection', 'off/hide release', 'cleanup'],
        limitations: 'JSDOM supplies browser primitives; native arc pixels and pointer hit layout were not rendered.' }));
      return;
    }
    if (quietOnly) {
      assert.equal(calm || reduced, false, 'quiet playback uses the lively, enabled profile');
      await waitForMotion();
      quietDebug('arrival finished');
      const quietNames = ['sit', 'scratch', 'ears', 'stretch', 'nose'];
      const requestCount = (name) =>
        imageRequests.filter((source) => imageSheet(source)?.[0] === name).length;
      assert.equal(requestCount('leisure'), 0, 'arrival does not preload unused quiet artwork');
      assert.equal(atlasManifest.atlases.leisure.columns, 8);
      assert.equal(atlasManifest.atlases.leisure.rows, 8);
      const historyLength = history.length;
      const initialCart = demo.cartCount;
      const clips = [];
      const completed = (instance, scene) => {
        const result = { done: false, at: null };
        result.promise = instance.perform(scene).then(() => {
          result.done = true;
          result.at = performance.now();
        });
        return result;
      };
      const assertSettled = async (result, message) => {
        await wait(32);
        assert.equal(result.done, true, message);
        await result.promise;
      };
      const checkNeutral = (host, message) => {
        assert.equal(host.dataset.animation, 'static', message);
        assert.equal(rafs.size, 0, `${message}: no frame callbacks remain`);
      };
      const sourceDraws = drawCalls.length;
      const hoverEvents = [];
      const removeHoverProbe = demo.adapter.subscribe((event) => {
        if (event.type === 'interaction') hoverEvents.push(event.kind);
      });
      const productCard = document.querySelector('.product-card');
      assert.ok(productCard, 'the boundary-hover regression uses a real demo product card');
      const hoverProduct = () =>
        productCard.dispatchEvent(
          new window.MouseEvent('pointerover', {
            bubbles: true,
            relatedTarget: document.body,
          }),
        );
      let stopScrolling;
      try {
        for (const scene of quietNames) {
          stopScrolling?.();
          stopScrolling = undefined;
          await wait(516);
          const clip = atlasManifest.clips[scene];
          assert.ok(clip, `${scene} exists in the actual exported manifest`);
          assert.equal(clip.sheet, 'leisure');
          assert.equal(clip.fps, 8);
          const duration = (clip.frames.length * 1000) / clip.fps;
          if (scene === 'nose') assert.equal(duration, 1000);
          if (scene === 'stretch') assert.equal(duration, 2500);
          const drawStart = drawCalls.length;
          const start = performance.now();
          const result = completed(demo.assistant, scene);
          await wait(32);
          assert.equal(element.dataset.animation, scene, `${scene} reaches the real controller`);
          const controller = quietControllers.at(-1);
          const playbackStart = playbackTrace.length;
          assert.equal(
            controller.isScrolling,
            false,
            'early hover precedes the first scroll event',
          );
          assert.ok(
            Date.now() - controller.lastPersonalityReaction >= controller.personalityCooldown,
            'boundary reactions are eligible; cooldown cannot mask a missing quiet guard',
          );
          const hoverCount = hoverEvents.length;
          hoverProduct();
          assert.equal(hoverEvents.length, hoverCount + 1, 'demo pointerover emits product:enter');
          assert.equal(hoverEvents.at(-1), 'product:enter');
          assert.equal(
            quietReactions.at(-1),
            'product:enter',
            'the real controller receives card hover',
          );
          await wait(16);
          assert.equal(result.done, false, `${scene} is not cancelled by pre-scroll card hover`);
          assert.equal(element.dataset.animation, scene);

          // Scroll and hover changes must not replace the active quiet clip.
          document.dispatchEvent(new window.Event('scroll', { bubbles: true }));
          await wait(516);
          assert.equal(controller.isScrolling, false, 'the actual 500 ms scroll settle completed');
          assert.equal(
            controller.interacting,
            false,
            'physical busy cannot mask proximity handling',
          );
          hoverProduct();
          const nearCount = quietReactions.filter((kind) => kind === 'pointer:near').length;
          pointer(document, 'pointermove', { x: center().x - 300, y: center().y }, 'mouse');
          await wait(16);
          pointer(document, 'pointermove', center(), 'mouse');
          await wait(32);
          assert.equal(
            quietReactions.filter((kind) => kind === 'pointer:near').length,
            nearCount + 1,
            'far-to-near mouse events reach the real controller through runtime RAF',
          );
          assert.equal(
            hoverEvents.length,
            hoverCount + 2,
            'post-settle hover also reaches demo adapter',
          );
          assert.equal(
            result.done,
            false,
            `${scene} survives settled hover and real proximity RAF`,
          );
          assert.equal(element.dataset.animation, scene);
          assert.equal(
            playbackTrace.length,
            playbackStart,
            `${scene} is not replaced by an idle or wave reaction at either scroll boundary`,
          );
          stopScrolling = keepScrolling();
          await wait(Math.max(0, duration - 128 - (performance.now() - start)));
          assert.equal(result.done, false, `${scene} does not resolve before its final frame`);
          assert.equal(element.dataset.animation, scene, `${scene} continues during scroll`);
          assert.equal(element.dataset.motion ?? '', '', `${scene} remains a stationary gesture`);
          await wait(180);
          await assertSettled(result, `${scene} resolves from the real player onEnd`);
          checkNeutral(element, `${scene} completes naturally while scroll continues`);
          assert.ok(result.at - start >= duration, `${scene} retains its actual clip duration`);
          const frames = drawCalls
            .slice(drawStart)
            .filter((call) => call.sheet === clip.sheet)
            .map(frameOf);
          assert.deepEqual(
            [...new Set(frames)].sort((a, b) => a - b),
            [...new Set(clip.frames)].sort((a, b) => a - b),
            `${scene} draws every actual leisure crop, including nose/stretch final frames`,
          );
          const last = drawCalls.at(-1);
          assert.equal(last.sheet, 'main');
          assert.equal(frameOf(last), atlasManifest.neutralFrame);
          clips.push({ scene, durationMs: duration, distinctFrames: new Set(frames).size });
          quietDebug(`${scene} finished`);
        }
      } finally {
        stopScrolling?.();
        removeHoverProbe();
      }
      assert.equal(requestCount('leisure'), 1, 'five quiet gestures share one lazy image/decode');
      assert.equal(requestCount('reactions'), 0, 'quiet gestures do not load unrelated reactions');
      await wait(516);
      quietDebug('five quiet scenes finished');

      // Move browser bars during the tail pose without switching supports.
      const wiggleClip = atlasManifest.clips.wiggle;
      const wiggleDrawStart = drawCalls.length;
      const wigglePlayStart = playbackTrace.length;
      const wiggleStart = performance.now();
      const wiggling = completed(demo.assistant, 'wiggle');
      await wait(1050);
      const backFrame = frameOf(drawCalls.at(-1));
      assert.ok(
        wiggleClip.frames.slice(8, 13).includes(backFrame),
        'scroll starts on an actual rear-view tail frame',
      );
      assert.ok(playbackTrace.slice(wigglePlayStart).every((call) => call.clip === 'wiggle'));
      const settledTailPlayCount = playbackTrace.length;
      const actorX = launcher.getBoundingClientRect().left;
      const stopTailScroll = keepScrolling();
      try {
        for (const [top, delta] of [
          [0, -1],
          [0, 0],
          [0, -50],
          [18, -68],
          [0, 50],
          [0, 0],
        ]) {
          quietViewport.offsetTop = top;
          quietViewport.height = window.innerHeight + delta;
          // Real platforms can coalesce window resize, VV resize and VV scroll.
          window.dispatchEvent(new window.Event('resize'));
          quietViewport.dispatchEvent(new window.Event('resize'));
          quietViewport.dispatchEvent(new window.Event('scroll'));
          await wait(128);
          assert.equal(
            wiggling.done,
            false,
            'viewport changes do not complete or cancel the tail scene',
          );
          assert.equal(
            element.dataset.motion,
            'wiggle',
            'no recovery climb replaces the tail stage',
          );
          assert.equal(element.dataset.animation, 'wiggle');
          assert.equal(
            playbackTrace.length,
            settledTailPlayCount,
            'the real SpritePlayer is neither restarted nor replaced by climbing',
          );
          const actor = launcher.getBoundingClientRect();
          const size = mobile ? 64 : 96;
          const reserved = demo.adapter.getContext().ui.bottomReservedPx;
          assert.ok(
            Math.abs(actor.left - actorX) < 0.1,
            'scroll does not change the chosen resting X',
          );
          assert.ok(
            Math.abs(
              actor.top +
                (size * 11) / 12 -
                (quietViewport.offsetTop + quietViewport.height - reserved),
            ) < 0.1,
            'feet follow the visible browser edge above the unchanged store panel',
          );
        }
        await wait(Math.max(0, 3190 - (performance.now() - wiggleStart)));
        assert.equal(wiggling.done, false, 'one original finite route retains its deadline');
        await wait(64);
        await wiggling.promise;
        checkNeutral(element, 'the tail scene completes normally during continued scroll');
        const actualTailFrames = drawCalls
          .slice(wiggleDrawStart)
          .filter((call) => call.sheet === wiggleClip.sheet)
          .map(frameOf);
        assert.deepEqual(
          [...new Set(actualTailFrames)].sort((a, b) => a - b),
          [...new Set(wiggleClip.frames)].sort((a, b) => a - b),
          'the real tail clip draws every frame through browser-bar changes',
        );
      } finally {
        stopTailScroll();
        quietViewport.offsetTop = 0;
        quietViewport.height = window.innerHeight;
      }
      await wait(516);
      quietDebug('tail scene and visual viewport scroll finished');

      // A scene due during sit must wait for onEnd.
      const quietController = quietControllers.at(-1);
      const sceneTimer = quietController.timers.get('scene');
      assert.ok(sceneTimer?.id !== undefined, 'the real autonomous scene remains scheduled');
      await wait(Math.max(0, sceneTimer.deadline - Date.now() - 240));
      const queuedStart = transitionTrace.length;
      const sitting = completed(demo.assistant, 'sit');
      await wait(560);
      assert.equal(sitting.done, false);
      assert.equal(quietController.pendingScene, true, 'a due physical scene waits during sit');
      assert.equal(element.dataset.animation, 'sit');
      assert.equal(element.dataset.motion ?? '', '');
      assert.equal(transitionTrace.length, queuedStart, 'no physical driver interrupts sit');
      await wait(3500);
      await assertSettled(sitting, 'sit completes before the pending physical scene');
      const queuedRun = transitionTrace.slice(queuedStart).find((item) => item.name === 'run');
      assert.ok(queuedRun, 'the waiting scene starts after the actual quiet clip ends');
      assert.ok(queuedRun.at >= sitting.at - 0.1, 'no automatic scene overlaps sitting frames');
      await waitForMotion(30000);
      quietDebug('queued physical finished');

      // A quiet action must release pointer capture and complete playback.
      const grabPoint = center();
      pointer(launcher, 'pointerdown', grabPoint);
      pointer(window, 'pointermove', { x: grabPoint.x - 18, y: grabPoint.y - 60 });
      assert.ok(pointerCaptures.size > 0, 'the real drag acquired pointer capture');
      const unheld = completed(demo.assistant, 'nose');
      await wait(32);
      assert.equal(pointerCaptures.size, 0, 'quiet action releases an already held pointer');
      assert.equal(element.dataset.motion ?? '', '');
      assert.equal(element.dataset.animation, 'nose');
      await wait(1050);
      await assertSettled(unheld, 'nose completes after cancelling the held drag');
      quietDebug('drag-to-quiet finished');

      const manualQuiet = completed(demo.assistant, 'sit');
      await wait(250);
      const manualPath = completed(demo.assistant, 'stroll');
      await assertSettled(
        manualQuiet,
        'a new explicit physical scene resolves the old quiet action',
      );
      assert.ok(element.dataset.motion, 'the new explicit route actually starts');
      await waitForMotion();
      await assertSettled(manualPath, 'the replacement route also finishes');

      const offQuiet = completed(demo.assistant, 'stretch');
      await wait(250);
      await demo.assistant.setMotion('off');
      await assertSettled(offQuiet, 'motion off resolves an active quiet action');
      checkNeutral(element, 'motion off leaves a static character');
      const offDraws = drawCalls.length;
      await wait(400);
      assert.equal(drawCalls.length, offDraws, 'motion off leaves no hidden animation loop');
      await assertSettled(
        completed(demo.assistant, 'nose'),
        'disabled quiet action is an immediate no-op',
      );
      await demo.assistant.setMotion('system');

      const hiddenQuiet = completed(demo.assistant, 'ears');
      await wait(160);
      await demo.assistant.hide();
      await assertSettled(hiddenQuiet, 'hide resolves an active quiet action');
      assert.equal(launcher.hidden, true);
      checkNeutral(element, 'hide cancels quiet frame callbacks');
      await demo.assistant.restore();

      const blockedQuiet = completed(demo.assistant, 'scratch');
      await wait(160);
      demo.adapter.update({ ui: { blockers: ['quiet-review'] } });
      await assertSettled(blockedQuiet, 'store blockers resolve an active quiet action');
      checkNeutral(element, 'store blocker cancels quiet frame callbacks');
      demo.adapter.update({ ui: { blockers: [] } });

      const reducedQuiet = completed(demo.assistant, 'nose');
      await wait(160);
      quietReduced = true;
      for (const query of quietMedia.values()) query.notify();
      await assertSettled(reducedQuiet, 'system reduced motion resolves an active quiet action');
      checkNeutral(element, 'reduced motion cancels quiet frame callbacks');
      const reducedDraws = drawCalls.length;
      await assertSettled(completed(demo.assistant, 'stretch'), 'reduced quiet action is a no-op');
      await wait(400);
      assert.equal(drawCalls.length, reducedDraws);
      quietReduced = false;
      for (const query of quietMedia.values()) query.notify();

      const destroyedQuiet = completed(demo.assistant, 'sit');
      await wait(160);
      await demo.assistant.destroy();
      await assertSettled(destroyedQuiet, 'destroy resolves an active quiet action');
      assert.equal(rafs.size, 0);
      assert.equal(demo.adapter.subscriberCount, 0);
      assert.equal(pointerCaptures.size, 0);

      // A fresh instance must cache the optional sheet failure and use fallback.
      rejectedSheets.add('leisure');
      const { init } = await import(pathToFileURL(resolve(root, 'src/index.js')).href);
      let fresh;
      const initializing = init({
        configUrl: '/demo/assistant.config.json',
        adapter: demo.adapter,
      });
      initializing.then((instance) => {
        fresh = instance;
      });
      const initDeadline = performance.now() + 10000;
      while (!fresh && performance.now() < initDeadline) await wait(16);
      assert.ok(fresh, 'a fresh real instance initializes for optional-asset failure');
      const failureHost = document.querySelector('anime-shop-assistant');
      const failedRequestStart = requestCount('leisure');
      const failedDrawStart = drawCalls.length;
      const failedQuiet = completed(fresh, 'nose');
      const failureDeadline = performance.now() + 5000;
      while (!failedQuiet.done && performance.now() < failureDeadline) await wait(16);
      await assertSettled(
        failedQuiet,
        'optional leisure failure still resolves the finite quiet action',
      );
      checkNeutral(failureHost, 'optional sheet failure returns to the neutral core');
      assert.equal(requestCount('leisure'), failedRequestStart + 1);
      assert.equal(
        drawCalls.slice(failedDrawStart).some((call) => call.sheet === 'leisure'),
        false,
        'failed optional artwork never draws invalid crops',
      );
      const fallbackCanvas = failureHost.shadowRoot.querySelector('canvas');
      assert.equal(fallbackCanvas.hidden, false, 'optional failure preserves the decoded core canvas');
      assert.equal(fallbackCanvas.dataset.sheet, 'main');
      assert.equal(fallbackCanvas.dataset.frame, String(atlasManifest.neutralFrame),
        'optional failure leaves the actual neutral core cell visible, even when it was already drawn');
      assert.equal(failureHost.shadowRoot.querySelector('img').hidden, true);
      const cachedFailure = completed(fresh, 'nose');
      await wait(1150);
      await assertSettled(cachedFailure, 'cached optional failure completes without retry storms');
      assert.equal(requestCount('leisure'), failedRequestStart + 1);
      await fresh.destroy();
      assert.equal(rafs.size, 0);
      assert.equal(demo.adapter.subscriberCount, 0);
      assert.equal(document.querySelectorAll('anime-shop-assistant').length, 0);
      assert.equal(demo.cartCount, initialCart, 'quiet review does not alter the store cart');
      assert.equal(history.length, historyLength, 'quiet scenes create no menu/history entries');
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(
        JSON.stringify({
          result: 'PASS',
          mode: 'quiet',
          layout: mobile ? 'compact' : 'desktop',
          realAssistant: true,
          virtualTime: true,
          clips,
          drawCalls: drawCalls.length - sourceDraws,
          distinctFrames: new Set(drawCalls.map((call) => `${call.sheet}:${frameOf(call)}`)).size,
          successfulLeisureRequests: 1,
          failedLeisureRequests: 1,
          checked: [
            'real crop coordinates and onEnd completion',
            'product hover before scroll and after settle; real pointer-near RAF preserves quiet',
            'finite clip continuation during scroll',
            'tail back frames continue through VV ±1px, browser bars and viewport offsets without climb/replay',
            'automatic physical waits for quiet completion',
            'held drag releases capture',
            'manual replacement/off/hide/blocker/reduced/destroy cancellation',
            'lazy optional cache and graceful asset failure',
            'no history/cart changes',
            'cleanup: 0 RAF/0 subscribers',
          ],
          limitations:
            'Browser primitives use a virtual clock; JSDOM does not verify native artwork appearance or CSS layout.',
        }),
      );
      return;
    }
    if (isolationOnly) {
      await waitForMotion();
      const app = document.querySelector('#app');
      const checked = [];
      const initialCart = demo.cartCount;
      const historyLength = history.length;
      for (const scene of ['stroll', 'wiggle', 'flip']) {
        const records = [];
        const observer = new window.MutationObserver((mutations) => records.push(...mutations));
        observer.observe(app, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
        const start = drawCalls.length;
        try {
          await demo.assistant.perform(scene);
          await Promise.resolve();
        } finally {
          observer.disconnect();
        }
        assert.ok(drawCalls.length > start + 2, `${scene} renders actual sprite changes`);
        assert.equal(
          records.length,
          0,
          `${scene} leaves all shop DOM nodes and attributes untouched`,
        );
        checked.push(scene);
      }
      assert.equal(demo.cartCount, initialCart);
      assert.equal(history.length, historyLength);
      await demo.assistant.destroy();
      assert.equal(rafs.size, 0);
      assert.equal(demo.adapter.subscriberCount, 0);
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(
        JSON.stringify({
          result: 'PASS',
          mode: 'isolation',
          layout: mobile ? 'compact' : 'desktop',
          checked,
          shopMutations: 0,
          limitations:
            'Real runtime sprite changes are isolated from shop DOM. JSDOM does not measure native browser paints.',
        }),
      );
      return;
    }
    const exerciseCartCompanion = async () => {
      await waitForMotion();
      const originalParent = element.parentNode;
      const originalNext = element.nextSibling;
      const canvas = shadow.querySelector('canvas');
      const originalOffset = launcher.style.transform;
      const animation = demo.assistant.perform('wiggle');
      await wait(100);
      demo.openDialog('cart');
      const drawer = document.querySelector('#cart-dialog');
      assert.equal(drawer.open, true);
      assert.equal(drawer.querySelector('anime-shop-assistant'), element, 'cart top layer contains the original live companion');
      assert.equal(shadow.querySelector('canvas'), canvas, 'cart never clones/reinitializes the sprite canvas');
      assert.equal(launcher.hidden, false, 'cart does not suppress the companion');
      assert.equal(demo.adapter.getContext().ui.blockers.includes('cart-drawer'), false);
      assert.equal(launcher.style.transform, originalOffset, 'opening the cart preserves actor coordinates');
      assert.equal(element.dataset.animation, 'wiggle', 'cart preserves the active tail scene');
      assert.ok(drawer.querySelector('.cart-companion-pocket'), 'controls have a separate resting strip');
      const initialCount = demo.cartCount;
      drawer.querySelector('[data-quantity][data-delta="1"]').click();
      assert.equal(demo.cartCount, initialCount + 1, 'cart quantity controls work beside the live companion');
      drawer.querySelector('[data-quantity][data-delta="-1"]').click();
      assert.equal(demo.cartCount, initialCount);
      assert.ok(drawer.querySelector('a[href="/checkout"]'), 'checkout remains available above the resting strip');
      assert.equal(element.dataset.animation, 'wiggle', 'quantity rerenders preserve the current scene');
      assert.equal(Number.parseFloat(drawer.style.getPropertyValue('--cart-companion-reserved')),
        demo.adapter.getContext().ui.bottomReservedPx, 'the resting strip follows the real fixed-bar reservation');
      const closeButton = drawer.querySelector('[data-close="cart"]');
      closeButton.focus();
      assert.equal(document.activeElement, closeButton, 'cart controls remain focusable');
      const beforeDraw = drawCalls.length;
      await wait(120);
      assert.ok(drawCalls.length > beforeDraw, 'the live sprite continues inside the cart');
      await animation;
      demo.closeDialog('cart');
      assert.equal(element.parentNode, originalParent);
      assert.equal(element.nextSibling, originalNext, 'closing restores the original host order');
      assert.equal(launcher.style.transform, originalOffset);
      assert.equal(launcher.hidden, false);
      assert.equal(demo.adapter.subscriberCount, 1, 'moving the host creates no new controller subscription');
      demo.openDialog('cart');
      demo.openDialog('search');
      assert.equal(launcher.hidden, true, 'unrelated search modal keeps its blocker');
      demo.closeDialog('search');
      assert.equal(launcher.hidden, false, 'closing search exposes the companion in the still-open cart');
      assert.equal(element.parentNode, drawer);
      // JSDOM does not implement native Escape dismissal. Model its cancel→close primitives.
      assert.equal(drawer.dispatchEvent(new window.Event('cancel', { cancelable: true })), true);
      drawer.close();
      await wait(0);
      assert.equal(element.parentNode, originalParent, 'native close/Escape also restores the host');
      demo.openDialog('cart');
      drawer.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      assert.equal(drawer.open, false, 'clicking the transparent modal surface closes the cart');
      assert.equal(element.parentNode, originalParent);
      assert.equal(document.querySelectorAll('anime-shop-assistant').length, 1);
    };
    if (cartCompanionOnly) {
      await demo.addProduct('electric-sun', { delay: 0 });
      await exerciseCartCompanion();
      await demo.assistant.destroy();
      assert.equal(rafs.size, 0);
      assert.equal(demo.adapter.subscriberCount, 0);
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(JSON.stringify({ result: 'PASS', mode: 'cart-companion', layout: mobile ? 'compact' : 'desktop',
        checked: ['same live host/canvas', 'active scene continuity', 'position continuity', 'cart controls focus/quantity/checkout',
          'reserved resting strip', 'search blocker', 'native close/Escape primitive', 'backdrop', 'cleanup'],
        limitations: 'Native browser modal top-layer pixels/focus trapping are not rendered by JSDOM.' }));
      return;
    }
    const exerciseCheckout = async () => {
      await demo.navigate('/checkout');
      assert.equal(launcher.hidden, false, 'character remains available on checkout');
      assert.equal(
        document.querySelector('[data-restore]').hidden,
        false,
        'checkout keeps summon controls available',
      );
      const checkoutCount = demo.adapter.getContext().cartCount;
      const checkout = document.querySelector('#checkout-form');
      assert.equal(checkout.checkValidity(), false, 'checkout retains required form validation');
      for (const [name, value] of [
        ['name', 'Demo'],
        ['email', 'demo@example.com'],
        ['city', 'Demo city'],
      ])
        checkout.elements.namedItem(name).value = value;
      assert.equal(checkout.checkValidity(), true, 'demo checkout accepts valid fictitious fields');
      assert.equal(
        demo.adapter.getContext().cartCount,
        checkoutCount,
        'checkout character leaves the cart intact',
      );
      checkout.requestSubmit();
      await wait(40);
      assert.equal(
        location.pathname,
        '/payment',
        'checkout form still reaches the demonstration payment screen',
      );
      assert.equal(launcher.hidden, true, 'payment remains an excluded page');
      assert.equal(
        demo.adapter.getContext().cartCount,
        checkoutCount,
        'checkout submit preserves cart contents',
      );
      assert.equal(shadow.querySelector('dialog').open, false);
      return checkoutCount;
    };
    if (checkoutOnly) {
      await waitForMotion();
      await demo.addProduct('electric-sun', { delay: 20 });
      assert.equal(await exerciseCheckout(), 1, 'checkout summary retains the confirmed cart item');
      await demo.assistant.destroy();
      assert.equal(rafs.size, 0);
      assert.equal(demo.adapter.subscriberCount, 0);
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(
        JSON.stringify({
          result: 'PASS',
          mode: 'checkout',
          layout: mobile ? 'compact' : 'desktop',
          checked: [
            'real checkout character',
            'summon controls',
            'required form validation',
            'confirmed cart preserved',
            'actual form submit',
            'payment suppression',
            'cleanup',
          ],
        }),
      );
      return;
    }
    if (autonomousOnly) {
      assert.equal(calm, false, 'autonomy smoke uses the real lively configuration');
      const historyLength = history.length;
      if (reduced || motionOff) {
        await wait(2500);
        assert.equal(
          launcher.hidden,
          false,
          'disabled motion keeps the static character available',
        );
        assert.equal(playbackTrace.length, 0, 'disabled motion starts no autonomous sprite clip');
        assert.equal(transitionTrace.length, 0, 'disabled motion starts no entrance or scene');
        const staticCanvas = shadow.querySelector('canvas');
        assert.equal(staticCanvas.hidden, false, 'prepared graphics keep the static character visible');
        assert.equal(staticCanvas.dataset.sheet, 'main');
        assert.equal(staticCanvas.dataset.frame, String(atlasManifest.neutralFrame));
        assert.ok(drawCalls.length > 0);
        assert.ok(drawCalls.every((call) => call.sheet === 'main' && frameOf(call) === atlasManifest.neutralFrame),
          'disabled autonomy draws only the neutral core cell');
        const mandatorySprites = imageRequests.filter((url) => !!imageSheet(url));
        assert.equal(mandatorySprites.length, 1, 'preflight loads the core sheet once, without optional sheets');
        assert.equal(imageSheet(mandatorySprites[0])[0], 'main');
        assert.equal(requests.filter((url) => url.endsWith('/atlas.json')).length, 1);
        const settledDrawCount = drawCalls.length;
        await wait(400);
        assert.equal(drawCalls.length, settledDrawCount, 'disabled autonomy leaves no delayed repaint');
        assert.equal(rafs.size, 0);
        await demo.assistant.destroy();
        assert.equal(demo.adapter.subscriberCount, 0);
        assert.equal(rafs.size, 0);
        assert.equal(errors.length, 0, errors.join('\n'));
        console.log(
          JSON.stringify({
            result: 'PASS',
            mode: 'autonomous',
            layout: mobile ? 'compact' : 'desktop',
            motion: reduced ? 'reduced' : 'off',
            checked: [
              'no input',
              'static character',
              'mandatory core reused without autonomous clips/scenes/optional sprite requests',
              'RAF/subscription cleanup',
            ],
          }),
        );
        return;
      }
      await waitForMotion();
      assert.equal(
        transitionTrace.filter((call) => call.name === 'enter').length,
        1,
        'page starts with one automatic entrance',
      );
      const arrivedAt = performance.now();
      const firstDeadline = arrivedAt + 2500;
      while (
        !playbackTrace.some(
          (call) => call.at >= arrivedAt && ['idle', 'wink', 'wave'].includes(call.clip),
        ) &&
        performance.now() < firstDeadline
      )
        await wait(25);
      const firstGesture = playbackTrace.find(
        (call) => call.at >= arrivedAt && ['idle', 'wink', 'wave'].includes(call.clip),
      );
      assert.ok(
        firstGesture,
        `a finite gesture follows arrival promptly without clicks: ${JSON.stringify(playbackTrace)}`,
      );
      assert.equal(
        firstGesture.clip,
        'idle',
        'the first autonomous microgesture stays a gentle idle',
      );
      const gestureUntil = firstGesture.at + 3000;
      while (
        (element.dataset.animation !== 'static' || rafs.size) &&
        performance.now() < gestureUntil
      )
        await wait(25);
      assert.equal(element.dataset.animation, 'static', 'first autonomous gesture finishes');
      assert.equal(rafs.size, 0, 'the finite gesture stops all frame callbacks between actions');
      const microFrames = drawCalls.slice(firstGesture.drawStart);
      assert.ok(
        new Set(microFrames.map((call) => `${call.sheet}:${call.sx},${call.sy}`)).size >= 2,
        'the first autonomous gesture uses different real sprite cells',
      );
      const sceneDeadline = arrivedAt + 15000;
      while (
        !transitionTrace.some((call) => call.name === 'run' && call.at >= arrivedAt) &&
        performance.now() < sceneDeadline
      )
        await wait(25);
      const scene = transitionTrace.find((call) => call.name === 'run' && call.at >= arrivedAt);
      assert.ok(
        scene,
        `an autonomous physical scene follows within fifteen seconds: ${JSON.stringify(transitionTrace)}`,
      );
      await wait(300);
      assert.ok(element.dataset.motion, 'the autonomous physical scene is actually moving');
      const scenePlay = playbackTrace.find(
        (call) => call.at >= scene.at - 10 && call.clip !== firstGesture.clip,
      );
      assert.ok(
        scenePlay,
        'the autonomous scene uses a different finite clip from the first gesture',
      );
      assert.equal(
        playbackTrace.some((call) => call.clip === 'wink'),
        false,
        'early autonomous gestures respect the thirty-five-second wink cooldown',
      );
      assert.ok(
        drawCalls.length > firstGesture.drawStart + 2,
        'real player advances across autonomous actions',
      );
      const autonomousMotion = element.dataset.motion;
      const stopScrolling = keepScrolling();
      try {
        const moving = launcher.style.transform;
        const ongoingDraws = drawCalls.length;
        // Sample across intentional pauses while hidden or peeking.
        const continuedUntil = performance.now() + 3500;
        while (
          ((scene.scene !== 'wiggle' && launcher.style.transform === moving) ||
            drawCalls.length === ongoingDraws) &&
          element.dataset.motion &&
          performance.now() < continuedUntil
        )
          await wait(25);
        if (scene.scene !== 'wiggle')
          assert.notEqual(
            launcher.style.transform,
            moving,
            'scroll lets the current autonomous path continue',
          );
        assert.ok(
          drawCalls.length > ongoingDraws,
          'scroll lets the current autonomous sprite advance',
        );
        await waitForMotion(30000);
        assert.equal(
          rafs.size,
          0,
          'the current scene stops its finite frame loop while scrolling continues',
        );
        const finishedDraws = drawCalls.length;
        await wait(200);
        assert.equal(
          drawCalls.length,
          finishedDraws,
          'active scroll postpones new microgestures after the scene ends',
        );
        assert.equal(
          transitionTrace.filter((call) => call.name === 'run' && call.at >= arrivedAt).length,
          1,
          'active scroll postpones new automatic physical scenes',
        );
        assertFeetInsideViewport('the uninterrupted autonomous scene finishes on visible support');
      } finally {
        stopScrolling();
      }
      assert.equal(shadow.querySelector('dialog').open, false);
      assert.equal(history.length, historyLength);
      assert.equal(demo.adapter.getContext().cartCount, 0, 'autonomy leaves the store cart intact');
      assert.equal(
        transitionTrace.filter((call) => call.name === 'enter').length,
        1,
        'autonomy never replays startup',
      );
      const waveDeadline = arrivedAt + 28000;
      while (
        !playbackTrace.some((call) => call.at > firstGesture.at && call.clip === 'wave') &&
        performance.now() < waveDeadline
      )
        await wait(25);
      const autonomousWave = playbackTrace.find(
        (call) => call.at > firstGesture.at && call.clip === 'wave',
      );
      assert.ok(autonomousWave, 'a selected occasional autonomous wave plays without input');
      const initializedAt = transitionTrace.find((call) => call.name === 'enter').at;
      assert.ok(
        autonomousWave.at - initializedAt >= 11900,
        'automatic wave respects its initial twelve-second minimum',
      );
      assert.equal(autonomousWave.repetitions, 1, 'occasional wave is a finite single clip');
      await wait(180);
      const waveFrames = drawCalls
        .slice(autonomousWave.drawStart)
        .filter(
          (call) =>
            call.sheet === (atlasManifest.clips.wave.sheet ?? 'main') &&
            atlasManifest.clips.wave.frames.includes(frameOf(call)),
        );
      assert.ok(
        new Set(waveFrames.map(frameOf)).size >= 2,
        'actual occasional wave advances through core sprite cells',
      );
      assert.equal(
        playbackTrace.filter((call) => call.at >= initializedAt && call.clip === 'wave').length,
        1,
        'the first several microgestures do not repeatedly wave',
      );
      await demo.assistant.destroy();
      assert.equal(pointerCaptures.size, 0);
      assert.equal(rafs.size, 0);
      assert.equal(demo.adapter.subscriberCount, 0);
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(
        JSON.stringify({
          result: 'PASS',
          mode: 'autonomous',
          layout: mobile ? 'compact' : 'desktop',
          drawCalls: drawCalls.length,
          distinctFrames: new Set(drawCalls.map((call) => `${call.sheet}:${call.sx},${call.sy}`))
            .size,
          microClip: firstGesture.clip,
          microDelayMs: Math.round(firstGesture.at - arrivedAt),
          waveDelayMs: Math.round(autonomousWave.at - initializedAt),
          physicalScene: scene.scene,
          sceneDelayMs: Math.round(scene.at - arrivedAt),
          autonomousMotion,
          checked: [
            'no clicks or restores',
            'automatic initial appearance',
            'prompt finite microgesture',
            'autonomous finite wave and rare-wink cooldown',
            'different real sprite clips',
            'autonomous physical scene',
            'RAF-free intervals',
            'current animation continues during scroll; new automatic activity waits',
            'cart/history/menu unchanged',
            'destroy cleanup',
          ],
          limitations:
            'Real init/runtime/player and timers; JSDOM supplies browser primitives and pointer geometry.',
        }),
      );
      return;
    }
    if (transitionsOnly) {
      assert.equal(calm || reduced, false, 'transition smoke exercises lively motion');
      assert.equal(
        attachScrollInjected,
        true,
        'a real scroll arrives while init awaits stylesheet readiness',
      );
      assert.equal(
        launcher.hidden,
        true,
        'startup stays hidden while attach overlaps active scroll',
      );
      assert.equal(
        transitionTrace.length,
        0,
        'attach does not launch a short recovery or premature entrance',
      );
      const deferredUntil = performance.now() + 1200;
      while (!element.dataset.entry && performance.now() < deferredUntil) await wait(25);
      assert.equal(
        launcher.hidden,
        false,
        'one delayed entrance becomes visible after scroll settles',
      );
      assert.equal(
        element.dataset.entry,
        'bottom',
        'first startup really uses the bottom entrance',
      );
      assert.equal(element.dataset.motion, 'climb');
      const entryIndex = transitionTrace.findIndex((call) => call.name === 'enter');
      assert.ok(entryIndex >= 0, 'actual startup enters once');
      assert.equal(
        transitionTrace.slice(0, entryIndex).some((call) => call.name === 'recover'),
        false,
        `startup must not launch a recovery before its entrance: ${JSON.stringify(transitionTrace)}`,
      );
      await wait(320);
      assert.ok(drawCalls.length >= 2, 'initial bottom entrance draws actual sprite frames');
      assert.ok(
        new Set(drawCalls.map((call) => `${call.sheet}:${call.sx},${call.sy}`)).size > 1,
        'startup sprite frames visibly change',
      );
      const startupScroll = transitionTrace.length;
      const stopStartupScroll = keepScrolling();
      try {
        const ongoingEntrance = launcher.style.transform;
        const entryDraws = drawCalls.length;
        await wait(200);
        assert.notEqual(
          launcher.style.transform,
          ongoingEntrance,
          'scroll does not interrupt the bottom entrance',
        );
        assert.ok(drawCalls.length > entryDraws, 'scroll does not interrupt the entrance sprite');
        await waitForMotion(4000);
        assert.equal(rafs.size, 0, 'the entrance finishes normally while scrolling continues');
      } finally {
        stopStartupScroll();
      }
      const startupRecoveries = transitionTrace
        .slice(startupScroll)
        .filter((call) => call.name === 'recover');
      assert.ok(
        startupRecoveries.length === 0,
        `a scrolling entrance finishes without cancellation or recovery: ${JSON.stringify(startupRecoveries)}`,
      );
      const landed = launcher.getBoundingClientRect();
      assert.ok(
        Math.abs(landed.top + (landed.height * 11) / 12 - feetFloor()) < 0.2,
        'bottom arrival reaches real support while the document scrolls',
      );
      assert.equal(rafs.size, 0);

      const groundedTrace = transitionTrace.length;
      const grounded = launcher.style.transform;
      for (let index = 0; index < 20; index++) {
        scrollPosition = index % 2 ? 0 : 1000000;
        document.dispatchEvent(new window.Event('scroll', { bubbles: true }));
      }
      await wait(620);
      assert.equal(
        launcher.style.transform,
        grounded,
        'grounded scroll never starts another climb',
      );
      assert.equal(
        transitionTrace.slice(groundedTrace).filter((call) => call.name === 'recover').length,
        0,
        'settling on an existing support needs no recovery route',
      );
      assert.equal(rafs.size, 0);
      assert.equal(shadow.querySelector('canvas').dataset.sheet, 'main');
      assert.equal(
        Number(shadow.querySelector('canvas').dataset.frame),
        atlasManifest.neutralFrame,
        'grounded scroll settles to neutral instead of freezing an old physical pose',
      );

      const pageTrace = transitionTrace.length;
      const appearing = demo.assistant.perform('arrival');
      const visibleUntil = performance.now() + 2500;
      while (performance.now() < visibleUntil) {
        const actor = launcher.getBoundingClientRect();
        if (actor.left >= 0 && actor.right <= window.innerWidth) break;
        await wait(25);
      }
      assert.ok(element.dataset.motion, 'the next entrance is active when navigation begins');
      const insideBeforeNavigation = launcher.getBoundingClientRect();
      assert.ok(
        insideBeforeNavigation.left >= 0 && insideBeforeNavigation.right <= window.innerWidth,
        'navigation begins only after the arriving character is already inside',
      );
      const navVisibilityErrors = [];
      let navFrame = 0;
      let navSamples = 0;
      let samplingNavigation = true;
      const sampleNavigation = () => {
        navFrame = 0;
        const actor = launcher.getBoundingClientRect();
        navSamples++;
        if (
          actor.left < -0.2 ||
          actor.right > window.innerWidth + 0.2 ||
          actor.top < -0.2 ||
          actor.top + (actor.height * 11) / 12 > window.innerHeight + 0.2 ||
          launcher.hidden
        )
          navVisibilityErrors.push({
            left: actor.left,
            top: actor.top,
            right: actor.right,
            hidden: launcher.hidden,
          });
        if (samplingNavigation) navFrame = requestAnimationFrame(sampleNavigation);
      };
      sampleNavigation();
      scrollPosition = 300;
      const pageContexts = [];
      const unsubscribePageTrace = demo.adapter.subscribe((event) => {
        if (event.type === 'context') pageContexts.push(event.context);
      });
      await demo.navigate('/product/electric-sun');
      unsubscribePageTrace();
      assert.equal(
        pageContexts.length,
        1,
        'closed dialogs and SPA render publish one atomic context',
      );
      assert.equal(pageContexts[0].pageType, 'product');
      assert.equal(
        pageContexts[0].ui.bottomReservedPx,
        mobile ? 144 : 84,
        'the new page snapshot already contains its own fixed-panel height',
      );
      await wait(620);
      await appearing;
      await waitForMotion(3500);
      samplingNavigation = false;
      if (navFrame) cancelAnimationFrame(navFrame);
      assert.ok(navSamples > 10, 'navigation visibility was sampled across real animation frames');
      assert.deepEqual(
        navVisibilityErrors,
        [],
        'an already-visible character remains visible through SPA entry continuation',
      );
      assert.equal(
        document.querySelector('anime-shop-assistant'),
        element,
        'SPA preserves the same host identity',
      );
      const pageCalls = transitionTrace.slice(pageTrace);
      assert.equal(
        pageCalls.filter((call) => call.name === 'enter').length,
        1,
        'SPA navigation does not launch a second entrance',
      );
      assert.ok(
        pageCalls.filter((call) => call.name === 'recover').length <= 1,
        `new page support and native scroll settle into one recovery: ${JSON.stringify(pageCalls)}`,
      );
      const pageActor = launcher.getBoundingClientRect();
      assert.ok(
        Math.abs(pageActor.top + (pageActor.height * 11) / 12 - feetFloor()) < 0.2,
        'navigation finishes with visible feet on its new fixed-panel support',
      );
      assert.equal(document.querySelectorAll('anime-shop-assistant').length, 1);
      assert.equal(demo.adapter.subscriberCount, 1);
      assert.equal(scrollPosition, 0, 'the actual demo navigation resets document scroll');
      assert.equal(
        document.activeElement.id,
        'main',
        'navigation focuses content without requesting a scroll',
      );

      const offscreenTrace = transitionTrace.length;
      const sideEntry = demo.assistant.perform('arrival');
      assert.equal(element.dataset.entry, 'right');
      const outside = launcher.getBoundingClientRect();
      assert.ok(
        outside.left > window.innerWidth || outside.right < 0,
        'the real side entrance starts entirely outside the window before its first RAF',
      );
      document.dispatchEvent(new window.Event('scroll', { bubbles: true }));
      const stopSideScroll = keepScrolling();
      try {
        const enteringOffset = launcher.style.transform;
        const enteringDraws = drawCalls.length;
        await wait(200);
        assert.notEqual(
          launcher.style.transform,
          enteringOffset,
          'side entrance advances from offscreen during scroll',
        );
        assert.ok(
          drawCalls.length > enteringDraws,
          'side entrance draws real walk cells during scroll',
        );
        await sideEntry;
        assert.equal(rafs.size, 0, 'side entrance completes its finite path during scroll');
      } finally {
        stopSideScroll();
      }
      assertFeetInsideViewport(
        'side entrance brings the whole visible character onto viewport support',
      );
      const sideCalls = transitionTrace.slice(offscreenTrace);
      assert.equal(
        sideCalls.filter((call) => call.name === 'enter').length,
        1,
        'scrolling side arrival does not replay entrance',
      );
      assert.equal(
        sideCalls.filter((call) => call.name === 'recover').length,
        0,
        'scrolling side arrival needs no cancellation recovery',
      );
      assert.equal(rafs.size, 0);

      const panelTrace = transitionTrace.length;
      const reserved = demo.adapter.getContext().ui.bottomReservedPx;
      assert.ok(reserved > 0, 'the actual product route registers a fixed purchase panel');
      demo.adapter.update({ ui: { bottomReservedPx: 0 } });
      // Starting a new recovery still waits for the last scroll's 500ms quiet period.
      await wait(520);
      await waitForMotion(1800);
      const browserFloor = launcher.getBoundingClientRect();
      assert.ok(
        Math.abs(browserFloor.top + (browserFloor.height * 11) / 12 - feetFloor()) < 0.2,
        'removing page support settles at the browser floor',
      );
      demo.adapter.update({ ui: { bottomReservedPx: reserved } });
      await waitForMotion(1200);
      const panelFloor = launcher.getBoundingClientRect();
      assert.ok(
        Math.abs(panelFloor.top + (panelFloor.height * 11) / 12 - feetFloor()) < 0.2,
        'restoring page support settles at the panel floor',
      );
      assert.equal(
        transitionTrace.slice(panelTrace).filter((call) => call.name === 'recover').length,
        2,
        'two real support changes create exactly two finite recoveries',
      );
      assert.equal(
        transitionTrace.slice(panelTrace).filter((call) => call.name === 'enter').length,
        0,
        'support changes do not replay startup',
      );
      const optionalRequests = (name) =>
        imageRequests.filter((source) => imageSheet(source)?.[0] === name).length;
      assert.equal(
        optionalRequests('reactions'),
        0,
        'intro and support recovery do not fetch unused reaction cells',
      );
      assert.equal(
        optionalRequests('leisure'),
        0,
        'intro and support recovery do not fetch unused quiet variants',
      );
      const { PersonalityMotion } = await import(
        pathToFileURL(resolve(root, 'src/positioning/personality.js')).href
      );
      const actualNotify = PersonalityMotion.prototype.notify;
      const headStages = [];
      PersonalityMotion.prototype.notify = function (phase, metadata) {
        headStages.push({
          phase,
          activity: metadata?.activity,
          facing: metadata?.facing,
          at: performance.now(),
        });
        return actualNotify.call(this, phase, metadata);
      };
      const headPlaybackStart = playbackTrace.length;
      const headDrawStart = drawCalls.length;
      const headJourney = selectChance(0.5, true, () => demo.assistant.perform('peek'));
      const stopHeadScroll = keepScrolling();
      let headFinished = false;
      void headJourney.then(() => {
        headFinished = true;
      });
      let headSamples = 0;
      try {
        const headDeadline = performance.now() + 15000;
        while (!headFinished && performance.now() < headDeadline) {
          await wait(30);
          if (headStages.at(-1)?.activity !== 'head-look') continue;
          headSamples++;
          const box = launcher.getBoundingClientRect();
          const visibleWidth = Math.max(
            0,
            Math.min(box.right, window.innerWidth) - Math.max(box.left, 0),
          );
          assert.ok(visibleWidth <= 65, 'head reveal stays within its intended 64px edge area');
          assert.equal(
            element.dataset.animation,
            'static',
            'head-only reveal does not start a body walk loop',
          );
        }
        assert.equal(headFinished, true, 'head-only journey has a finite deadline');
        await headJourney;
      } finally {
        stopHeadScroll();
        PersonalityMotion.prototype.notify = actualNotify;
      }
      assert.ok(headSamples > 30, 'head reveal, hold and retract remain readable while scrolling');
      const headPlays = playbackTrace
        .slice(headPlaybackStart)
        .filter((call) => call.clip === 'head-peek');
      assert.equal(headPlays.length, 1, 'one finite head clip spans reveal, hold and retract');
      assert.equal(headPlays[0].repetitions, 1);
      const headClip = atlasManifest.clips['head-peek'];
      const headFrames = drawCalls
        .slice(headDrawStart)
        .filter((call) => call.sheet === headClip.sheet && headClip.frames.includes(frameOf(call)))
        .map(frameOf);
      assert.ok(new Set(headFrames).size >= 2, 'actual head-only sprite cells advance');
      assert.equal(
        new Set(
          headStages.filter((stage) => stage.activity === 'head-look').map((stage) => stage.facing),
        ).size,
        1,
        'head maintains its inward facing during reveal and retract',
      );
      assertFeetInsideViewport('head-only peek finishes fully visible on support');
      assert.equal(rafs.size, 0, 'head-only sequence releases all frame callbacks');
      assert.equal(
        optionalRequests('personality'),
        1,
        'intro and head share one lazily cached personality request',
      );
      assert.equal(optionalRequests('reactions'), 0, 'head-only use does not preload reactions');
      assert.equal(optionalRequests('leisure'), 0, 'head-only use does not preload leisure');
      assert.equal(errors.length, 0, errors.join('\n'));
      await demo.assistant.destroy();
      assert.equal(pointerCaptures.size, 0);
      assert.equal(rafs.size, 0);
      assert.equal(demo.adapter.subscriberCount, 0);
      console.log(
        JSON.stringify({
          result: 'PASS',
          mode: 'transitions',
          layout: mobile ? 'compact' : 'desktop',
          drawCalls: drawCalls.length,
          distinctFrames: new Set(drawCalls.map((call) => `${call.sheet}:${call.sx},${call.sy}`))
            .size,
          optionalRequests: Object.fromEntries(
            Object.keys(atlasManifest.atlases ?? {}).map((name) => [name, optionalRequests(name)]),
          ),
          checked: [
            'startup frames',
            'attach during scroll defers one appearance',
            'no recover before entrance',
            'scroll during bottom entry',
            'grounded scroll settle',
            'SPA during entry',
            'offscreen side entry continues when scroll starts before first RAF',
            'native navigation scroll/focus ordering',
            'fixed-panel support changes',
            'head-only reveal and finite sprite playback during scroll',
            'lazy named-sheet requests and cache',
            'singleton and cleanup',
          ],
          calls: transitionTrace.map((call) => ({
            name: call.name,
            needsRecovery: call.needsRecovery,
          })),
          limitations:
            'Actual runtime/demo/driver with browser primitive spies; JSDOM does not prove native layout or paint.',
        }),
      );
      return;
    }
    if (arrivalOnly) {
      const first = element.dataset.entry;
      assert.ok(
        ['left', 'right', 'top', 'bottom'].includes(first),
        'real startup selects one of four entrances',
      );
      assert.ok(element.dataset.motion, 'startup begins the entrance without a click');
      await waitForMotion();
      assertFeetInsideViewport('startup entrance finishes with visible feet inside the viewport');
      assert.ok(drawCalls.length > 2, 'automatic entrance draws actual sprite frames');
      assert.equal(rafs.size, 0, 'automatic entrance releases frame callbacks');
      await demo.assistant.destroy();
      const { init } = await import(pathToFileURL(resolve(root, 'src/index.js')).href);
      const next = await init({ configUrl: '/demo/assistant.config.json', adapter: demo.adapter });
      try {
        const nextHost = document.querySelector('anime-shop-assistant');
        assert.ok(['left', 'right', 'top', 'bottom'].includes(nextHost.dataset.entry));
        assert.notEqual(
          nextHost.dataset.entry,
          first,
          'a new initialization in the same session chooses another edge',
        );
        const until = performance.now() + 8000;
        while (nextHost.dataset.motion && performance.now() < until) await wait(25);
        assert.equal(nextHost.dataset.motion, '', 'next appearance also finishes');
        await wait(35);
        assert.equal(rafs.size, 0);
        assert.equal(demo.adapter.subscriberCount, 1);
      } finally {
        await next.destroy();
      }
      assert.equal(demo.adapter.subscriberCount, 0);
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(
        JSON.stringify({
          result: 'PASS',
          layout: mobile ? 'compact' : 'desktop',
          checked: [
            'automatic startup entrance',
            'actual sprite frames',
            'viewport finish',
            'different next entrance',
            'finite RAF',
            'cleanup',
          ],
          limitations:
            'JSDOM supplied pointer box; native browser reload/layout is covered separately by E2E.',
        }),
      );
      return;
    }
    if (speechOnly) {
      assert.equal(
        calm || reduced,
        false,
        'speech placement smoke exercises lively physical motion',
      );
      await demo.assistant.setMotion('off');
      await demo.assistant.setMotion('system');
      await waitForMotion();
      const canopy = shadow.querySelector('svg.pika-a-parachute');
      assert.ok(canopy, 'the real view mounts a separate decorative canopy');
      assert.equal(canopy.getAttribute('aria-hidden'), 'true');
      const canvas = shadow.querySelector('canvas');
      const pixels = { width: canvas.width, height: canvas.height };
      const before = launcher.getBoundingClientRect();
      const historyLength = history.length;
      const origin = center();
      const lifted = { x: window.innerWidth / 2, y: 24 + before.height / 2 };
      pointer(launcher, 'pointerdown', origin);
      const movement = pointer(launcher, 'pointermove', lifted);
      assert.equal(element.dataset.motion, 'drag');
      assert.equal(
        movement.defaultPrevented,
        true,
        'direct touch/mouse movement consumes page panning',
      );
      assert.equal(pointerCaptures.get(7), launcher);
      assert.equal(
        assertSpeechClear(),
        true,
        'the held character speaks without covering its body',
      );
      const droppedX = launcher.getBoundingClientRect().left;
      pointer(launcher, 'pointerup', lifted);
      assert.equal(pointerCaptures.size, 0);
      const phases = new Set();
      let visibleCanopySamples = 0;
      let groundSamples = 0;
      const until = performance.now() + 8000;
      while (launcher.dataset.motion && performance.now() < until) {
        const phase = launcher.dataset.motion;
        phases.add(phase);
        const speechVisible = assertSpeechClear();
        if (phase === 'parachute') {
          if (speechVisible) visibleCanopySamples++;
          assert.equal(canvas.width, pixels.width, 'parachute keeps the actor canvas width');
          assert.equal(canvas.height, pixels.height, 'parachute keeps the actor canvas height');
        }
        if (phase === 'land' || phase === 'return') {
          groundSamples++;
          const actor = launcher.getBoundingClientRect();
          assert.ok(
            Math.abs(actor.top + (actor.height * 11) / 12 - feetFloor()) < 0.2,
            'landing and return place visible feet on the viewport or fixed-panel floor',
          );
        }
        await wait(25);
      }
      await waitForMotion();
      assert.ok(phases.has('parachute'), 'seeded real release takes the canopy branch');
      assert.ok(visibleCanopySamples > 2, 'several real canopy frames include unobstructed speech');
      assert.ok(groundSamples > 2, 'landing and return were observed at the actual feet floor');
      assert.ok(
        Math.abs(launcher.getBoundingClientRect().left - droppedX) < 0.2,
        'landing stays at the horizontal position chosen by the user',
      );
      assertFeetInsideViewport('finished drop keeps visible body and feet in the viewport');
      assert.equal(history.length, historyLength);
      assert.equal(shadow.querySelector('dialog').open, false);
      assert.equal(rafs.size, 0, 'drop leaves no animation frame callbacks');
      const reserved = demo.adapter.getContext().ui.bottomReservedPx;
      const supportChecked = reserved > 0;
      if (supportChecked) {
        const supported = launcher.getBoundingClientRect();
        demo.adapter.update({ ui: { bottomReservedPx: 0 } });
        assert.equal(
          element.dataset.motion,
          'fall',
          'removing the real support starts a short fall',
        );
        assert.ok(
          Math.abs(launcher.getBoundingClientRect().top - supported.top) < 0.2,
          'support removal commits base and offset together without a synchronous jump',
        );
        const fallingFloorTop = feetFloor() - (supported.height * 11) / 12;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const firstFallTop = launcher.getBoundingClientRect().top;
        assert.ok(
          firstFallTop >= supported.top - 0.2 && firstFallTop <= fallingFloorTop + 0.2,
          'first fall frame progresses between the supported position and actual floor',
        );
        await wait(60);
        assert.ok(
          launcher.getBoundingClientRect().top > supported.top,
          'the unsupported character descends through real animation frames',
        );
        assertSpeechClear();
        await waitForMotion(1800);
        const unsupported = launcher.getBoundingClientRect();
        assert.ok(
          Math.abs(unsupported.top + (unsupported.height * 11) / 12 - feetFloor()) < 0.2,
          'the short fall reaches the unobstructed browser floor',
        );
        assert.equal(rafs.size, 0, 'support recovery fall releases frame callbacks');
        demo.adapter.update({ ui: { bottomReservedPx: reserved } });
        assert.equal(element.dataset.motion, 'climb', 'returning support starts a short climb');
        assert.ok(
          Math.abs(launcher.getBoundingClientRect().top - unsupported.top) < 0.2,
          'support return commits base and offset together without a synchronous jump',
        );
        const climbingFloorTop = feetFloor() - (unsupported.height * 11) / 12;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const firstClimbTop = launcher.getBoundingClientRect().top;
        assert.ok(
          firstClimbTop <= unsupported.top + 0.2 && firstClimbTop >= climbingFloorTop - 0.2,
          'first climb frame progresses between the unsupported position and actual floor',
        );
        await wait(60);
        assert.ok(
          launcher.getBoundingClientRect().top < unsupported.top,
          'the character climbs to the returning panel without teleporting',
        );
        assertSpeechClear();
        await waitForMotion(1000);
        const restored = launcher.getBoundingClientRect();
        assert.ok(
          Math.abs(restored.top + (restored.height * 11) / 12 - feetFloor()) < 0.2,
          'the short climb reaches the restored fixed-panel floor',
        );
        assert.equal(rafs.size, 0, 'support recovery climb releases frame callbacks');
      }
      assert.equal(errors.length, 0, errors.join('\n'));
      await demo.assistant.destroy();
      assert.equal(demo.adapter.subscriberCount, 0);
      assert.equal(pointerCaptures.size, 0);
      assert.equal(rafs.size, 0);
      console.log(
        JSON.stringify({
          result: 'PASS',
          layout: mobile ? 'compact 320px / touch' : 'desktop / mouse',
          checked: [
            'real drag/drop',
            'speech/body separation',
            'speech/canopy separation',
            'unchanged actor size',
            'viewport feet floor',
            'landing stays where placed',
            'capture/RAF/subscription cleanup',
          ],
          visibleCanopySamples,
          groundSamples,
          supportChecked,
          limitations:
            'JSDOM uses supplied pointer boxes and the real view 96px text-height fallback; native CSS layout is covered separately by E2E.',
        }),
      );
      return;
    }
    if (reduced) {
      const origin = center();
      pointer(launcher, 'pointerdown', origin);
      const move = pointer(launcher, 'pointermove', { x: origin.x - 120, y: origin.y - 240 });
      assert.equal(
        element.dataset.motion,
        'drag',
        'reduced motion still permits a direct human drag',
      );
      assert.equal(
        move.defaultPrevented,
        true,
        'direct touch/mouse drag consumes movement on the character',
      );
      assert.equal(pointerCaptures.get(7), launcher, 'direct drag owns pointer capture');
      assert.equal(rafs.size, 0, 'human-controlled drag does not start an autonomous frame loop');
      pointer(launcher, 'pointerup', { x: origin.x - 120, y: origin.y - 240 });
      await waitForMotion(200);
      assert.equal(pointerCaptures.size, 0, 'drop releases capture');
      const staticCanvas = shadow.querySelector('canvas');
      assert.equal(staticCanvas.hidden, false, 'reduced motion preserves the prepared static character');
      assert.equal(staticCanvas.dataset.sheet, 'main');
      assert.equal(staticCanvas.dataset.frame, String(atlasManifest.neutralFrame));
      assert.ok(drawCalls.length > 0, 'the prepared core image supplies a visible neutral character');
      assert.ok(drawCalls.every((call) => call.sheet === 'main' && frameOf(call) === atlasManifest.neutralFrame),
        'reduced drag draws only the neutral cell, never an animated frame');
      const mandatorySprites = imageRequests.filter((url) => !!imageSheet(url));
      assert.equal(mandatorySprites.length, 1, 'mandatory preflight loads the core sheet exactly once');
      assert.equal(imageSheet(mandatorySprites[0])[0], 'main', 'reduced drag loads no optional sheets');
      assert.equal(requests.filter((url) => url.endsWith('/atlas.json')).length, 1,
        'mandatory metadata is reused after preflight');
      const settledDrawCount = drawCalls.length;
      await wait(300);
      assert.equal(drawCalls.length, settledDrawCount, 'reduced release leaves no delayed sprite repaint');
      assert.equal(rafs.size, 0, 'reduced release leaves no autonomous frame loop');
      assert.equal(shadow.querySelector('dialog').open, false);
      await demo.assistant.destroy();
      assert.equal(rafs.size, 0);
      assert.equal(demo.adapter.subscriberCount, 0);
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(
        JSON.stringify({
          result: 'PASS',
          behavior: 'lively',
          layout: mobile ? 'compact' : 'desktop',
          reducedMotion: true,
          checked: [
            'real init',
            'human drag',
            'pointer capture',
            'immediate bounded release',
            'mandatory core reused without optional sprite requests',
            'no autonomous RAF',
            'destroy cleanup',
          ],
          limitations:
            'JSDOM pointer coordinates are supplied; real CSS layout/hit testing is not asserted.',
        }),
      );
      return;
    }
    assert.equal(launcher.hidden, false, 'real launcher should be visible');
    if (!calm) {
      pointer(launcher, 'pointerover', center(), 'mouse');
      pointer(launcher, 'pointerdown', center(), 'mouse');
      pointer(launcher, 'pointerup', center(), 'mouse');
    }
    launcher.click();
    await wait(150);
    assert.ok(drawCalls.length > 1, 'actual SpritePlayer draws multiple frames');
    assert.ok(
      new Set(drawCalls.map((call) => `${call.sheet}:${call.sx},${call.sy}`)).size > 1,
      'sprite crop changes across frames',
    );
    if (calm) {
      assert.equal(
        shadow.querySelector('dialog').open,
        true,
        'calm launcher click opens actual dialog',
      );
      assert.equal(element.dataset.state, 'open');
      if (mobile)
        assert.ok(document.documentElement.classList.contains('anime-assistant-scroll-locked'));
      assert.ok(shadow.textContent.includes('Найти карточки'));
      shadow.querySelector('.pika-a-row.primary').click();
      assert.ok(shadow.textContent.includes('Какие карточки ищешь?'));
      assert.equal(shadow.querySelectorAll('.pika-a-body a').length, 5);
      shadow.querySelector('.pika-a-header button').click();
      const settings = [...shadow.querySelectorAll('.pika-a-row')].find((row) =>
        row.textContent.includes('Настройки'),
      );
      settings.click();
      assert.ok(shadow.querySelector('[role=switch]'));
      shadow.querySelector('[role=switch]').click();
      assert.equal(shadow.querySelector('[role=switch]').getAttribute('aria-checked'), 'true');
      shadow.querySelector('[role=switch]').click();
    } else {
      assert.equal(shadow.querySelector('dialog').open, false, 'lively tap does not open a menu');
      assert.equal(element.dataset.state, 'closed');
      assert.equal(
        shadow.querySelector('.pika-a-greeting').hidden,
        false,
        'lively tap shows speech',
      );
      assert.ok(
        REPLIES.pet.includes(shadow.querySelector('.pika-a-greeting').textContent),
        'petting answers from its own varied reply set',
      );
      assert.equal(
        document.documentElement.classList.contains('anime-assistant-scroll-locked'),
        false,
      );
      assert.equal(history.state?.__animeShopAssistantOverlay_v1, undefined);
      await wait(1700);
      assert.equal(rafs.size, 0, 'finite wave releases requestAnimationFrame');
      pointer(launcher, 'pointerout', center(), 'mouse');
      pointer(document.body, 'pointerover', { x: center().x - 400, y: center().y }, 'mouse');
      assert.equal(document.querySelector('.companion-skills').hidden, true, 'the real mouse leave closes focused controls before cursor look');
      document.dispatchEvent(
        new window.MouseEvent('pointermove', {
          bubbles: true,
          clientX: center().x - 400,
          clientY: center().y,
        }),
      );
      await wait(40);
      assert.equal(
        shadow.querySelector('canvas').dataset.frame,
        String(atlasManifest.poses.left),
        'character looks left toward cursor',
      );
      document.dispatchEvent(
        new window.MouseEvent('pointermove', {
          bubbles: true,
          clientX: center().x + 400,
          clientY: center().y,
        }),
      );
      await wait(40);
      assert.equal(
        shadow.querySelector('canvas').dataset.frame,
        String(atlasManifest.poses.right),
        'character looks right toward cursor',
      );
      assert.equal(rafs.size, 0, 'cursor look is a finite layout/frame update');
      await demo.assistant.setMotion('off');
      await wait(40);
      const stoppedDraws = drawCalls.length;
      await wait(120);
      assert.equal(drawCalls.length, stoppedDraws, 'motion off stops sprite frames');
      await demo.assistant.setMotion('system');
      await wait(40);
      document
        .querySelector('.product-card')
        .dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true }));
      assert.equal(
        element.dataset.animation,
        'idle',
        'registered product hover triggers curiosity',
      );
      document
        .querySelector('.product-card')
        .dispatchEvent(new window.MouseEvent('pointerout', { bubbles: true }));
      await demo.addProduct('electric-sun', { fail: true, delay: 1 });
      assert.ok(
        REPLIES.error.includes(shadow.querySelector('.pika-a-greeting').textContent),
        'failed addition answers from the sympathetic reply set',
      );
      assert.equal(demo.cartCount, 0);
    }
    await demo.assistant.close();
    const beforeCartDraws = drawCalls.length;
    await demo.addProduct('electric-sun', { delay: 1 });
    await wait(150);
    assert.ok(drawCalls.length > beforeCartDraws);
    assert.ok(
      drawCalls
        .slice(beforeCartDraws)
        .some(
          (call) =>
            call.sheet === (atlasManifest.clips.happy.sheet ?? 'main') &&
            atlasManifest.clips.happy.frames.includes(frameOf(call)),
        ),
      'actual happy sprite cells are drawn after confirmed success',
    );
    await demo.assistant.open();
    assert.ok(shadow.textContent.includes('Корзина · 1'));
    await demo.assistant.hide();
    assert.equal(launcher.hidden, true);
    await demo.assistant.restore();
    assert.equal(launcher.hidden, false);
    assert.equal(shadow.querySelector('dialog').open, calm);
    await exerciseCheckout();
    await demo.navigate('/catalog');
    assert.equal(launcher.hidden, false);
    demo.openDialog('search');
    assert.equal(launcher.hidden, true);
    demo.closeDialog('search');
    assert.equal(launcher.hidden, false);
    if (scenes && !calm) {
      assert.ok(
        window.sessionStorage.getItem(PERSONALITY_SESSION_KEY),
        'session variation is persisted while permission is granted',
      );
      demo.adapter.update({ permissions: { persistentSettings: false } });
      assert.equal(
        window.sessionStorage.getItem(PERSONALITY_SESSION_KEY),
        null,
        'context permission revocation removes own variation record',
      );
      await demo.assistant.open();
      assert.equal(
        window.sessionStorage.getItem(PERSONALITY_SESSION_KEY),
        null,
        'new pet reply does not persist after permission revocation',
      );
      await demo.assistant.close();
      const resetScene = async (name) => {
        document.querySelector('.demo-lab').open = true;
        document.querySelector('.technical-scenarios').open = true;
        demo.adapter.update({ permissions: { persistentSettings: false } });
        demo.adapter.setPage('catalog', `full-scene-${name}`);
        await wait(40);
      };
      assert.equal(
        typeof demo.assistant.perform,
        'function',
        'public performer is exposed by real init',
      );
      await resetScene('stroll');
      const strollOrigin = parseOffset(launcher);
      const strollStart = drawCalls.length;
      const labStroll = demo.assistant.perform('stroll');
      await wait(800);
      assert.notEqual(
        parseOffset(launcher).x,
        strollOrigin.x,
        'the public performer moves character horizontally',
      );
      assertSpeechClear();
      document.dispatchEvent(
        new window.MouseEvent('pointermove', { bubbles: true, clientX: 400, clientY: 0 }),
      );
      await wait(60);
      const walkFrames = new Set(atlasManifest.clips.walk.frames);
      assert.ok(
        walkFrames.has(Number(shadow.querySelector('canvas').dataset.frame)),
        'cursor look does not overwrite walking frames',
      );
      // Stop at route completion before another idle gesture can start.
      await labStroll;
      assert.equal(element.dataset.motion ?? '', '', 'the lab stroll has actually finished');
      assert.equal(launcher.style.willChange, '', 'stroll ends without retaining compositor hint');
      assert.ok(
        Math.abs(parseOffset(launcher).x - strollOrigin.x) > 0.5 &&
          Math.abs(parseOffset(launcher).x - strollOrigin.x) <= (mobile ? 120 : 240) + 1,
        'finite varied stroll reaches a bounded destination',
      );
      assert.ok(drawCalls.length - strollStart > 10, 'walking sprite changes throughout the path');
      assert.equal(rafs.size, 0, 'stroll releases all animation frames');
      await resetScene('climb');
      const climbOrigin = parseOffset(launcher);
      const { PersonalityMotion: ClimbMotion } = await import(
        pathToFileURL(resolve(root, 'src/positioning/personality.js')).href
      );
      const actualClimbNotify = ClimbMotion.prototype.notify;
      const climbStages = [];
      ClimbMotion.prototype.notify = function (phase, metadata) {
        climbStages.push({ phase, activity: metadata?.activity, at: performance.now() });
        return actualClimbNotify.call(this, phase, metadata);
      };
      const climbing = demo.assistant.perform('climb');
      const stopClimbScroll = keepScrolling();
      try {
        const gripDeadline = performance.now() + 15000;
        while (climbStages.at(-1)?.activity !== 'grip' && performance.now() < gripDeadline)
          await wait(20);
        assert.equal(
          climbStages.at(-1)?.activity,
          'grip',
          'climb reaches its first deliberate grip after approaching the wall',
        );
        assert.ok(
          parseOffset(launcher).y < climbOrigin.y - 12,
          'climb raises character along side while scrolling',
        );
        const gripping = launcher.style.transform;
        const gripDraws = drawCalls.length;
        await wait(60);
        assert.equal(
          launcher.style.transform,
          gripping,
          'a grip pause holds the real wall position',
        );
        assert.equal(drawCalls.length, gripDraws, 'a grip pause holds the sprite frame');
        assert.equal(rafs.size, 0, 'the deliberate grip pause has no frame callbacks');
        const pullDeadline = performance.now() + 500;
        while (drawCalls.length === gripDraws && performance.now() < pullDeadline) await wait(20);
        assert.ok(
          drawCalls.length > gripDraws,
          'the next pull resumes real climbing sprite frames during scroll',
        );
        assertSpeechClear();
        await climbing;
      } finally {
        stopClimbScroll();
        ClimbMotion.prototype.notify = actualClimbNotify;
      }
      assert.deepEqual(
        climbStages
          .filter((stage) => stage.activity === 'climb' || stage.activity === 'grip')
          .map((stage) => stage.activity),
        ['climb', 'grip', 'climb', 'grip', 'climb'],
        'climb performs two finite grip pauses between three pulls',
      );
      const firstPull = climbStages.find((stage) => stage.activity === 'climb');
      assert.ok(
        performance.now() - firstPull.at >= 2750,
        'climbing and gripping remain readable for about 2.8 seconds',
      );
      assert.equal(parseOffset(launcher).y, climbOrigin.y, 'climb returns to bottom');
      assert.equal(rafs.size, 0, 'climb releases all animation frames');
      await resetScene('peek');
      if (!mobile) {
        const moveToCenter = center();
        pointer(launcher, 'pointerdown', moveToCenter);
        pointer(launcher, 'pointermove', { x: window.innerWidth / 2, y: moveToCenter.y });
        pointer(launcher, 'pointerup', { x: window.innerWidth / 2, y: moveToCenter.y });
        await waitForMotion(1500);
      }
      const { PersonalityMotion } = await import(
        pathToFileURL(resolve(root, 'src/positioning/personality.js')).href
      );
      const actualNotify = PersonalityMotion.prototype.notify;
      const peekStages = [];
      PersonalityMotion.prototype.notify = function (phase, metadata) {
        peekStages.push({ phase, activity: metadata?.activity, at: performance.now() });
        return actualNotify.call(this, phase, metadata);
      };
      // The baseline journey verifies full-body peeking; head-only has its own regression.
      const peeking = selectChance(0.5, false, () => demo.assistant.perform('peek'));
      const peekStartedAt = performance.now();
      const stopPeekScroll = keepScrolling();
      let peekFinished = false;
      void peeking.then(() => {
        peekFinished = true;
      });
      let fullHideSamples = 0;
      let curiousSamples = 0;
      let extendedWalkDrawStart = null;
      let extendedWalkDrawEnd = null;
      let previousPeek = { x: launcher.getBoundingClientRect().left, at: performance.now() };
      const peekDeadline = performance.now() + 30000;
      try {
        while (!peekFinished && performance.now() < peekDeadline) {
          await wait(40);
          const at = performance.now();
          const box = launcher.getBoundingClientRect();
          const activity = peekStages.at(-1)?.activity;
          if (
            !mobile &&
            activity === 'walk' &&
            at - peekStartedAt >= 5000 &&
            at - peekStartedAt <= 5600
          ) {
            extendedWalkDrawStart ??= drawCalls.length;
            extendedWalkDrawEnd = drawCalls.length;
          }
          const elapsed = at - previousPeek.at;
          const distance = Math.abs(box.left - previousPeek.x);
          const actualSpeed = (distance / elapsed) * 1000;
          // Allow two frames of sampling skew between DOM reads.
          assert.ok(
            distance <= ((mobile ? 64 : 96) * 0.55 * (elapsed + 35)) / 1000 + 0.5,
            `peek shares walking speed: observed ${actualSpeed.toFixed(2)}px/s, activity ${activity}, from ${previousPeek.x} to ${box.left}`,
          );
          if (activity === 'hide') {
            assert.ok(
              box.right <= 1 || box.left >= window.innerWidth - 1,
              'hidden hold puts the complete character outside the viewport',
            );
            assert.equal(element.dataset.animation, 'static', 'hidden hold stops walking');
            fullHideSamples++;
          }
          if (activity === 'look') {
            const visibleWidth = Math.max(
              0,
              Math.min(box.right, window.innerWidth) - Math.max(box.left, 0),
            );
            assert.ok(
              Math.abs(visibleWidth - 48) < 2,
              'curious hold shows a 48px peek beyond the actual browser edge',
            );
            assert.equal(element.dataset.animation, 'static', 'curious hold stops walking');
            assert.equal(
              shadow.querySelector('canvas').dataset.frame,
              String(atlasManifest.poses.curious),
              'curious hold uses the real look pose',
            );
            curiousSamples++;
          }
          previousPeek = { x: box.left, at };
        }
      } finally {
        stopPeekScroll();
        PersonalityMotion.prototype.notify = actualNotify;
      }
      assert.equal(peekFinished, true, 'staged peek has a finite deadline');
      await peeking;
      if (!mobile) {
        assert.ok(
          extendedWalkDrawEnd - extendedWalkDrawStart >= 3,
          'the real walk sprite keeps cycling beyond its first 4.8-second chunk during scroll',
        );
      }
      const peekBox = launcher.getBoundingClientRect();
      assert.ok(
        fullHideSamples > 5 && curiousSamples > 10,
        'peek includes a readable complete hide and a separate curious hold',
      );
      assert.ok(
        peekBox.left >= 3 &&
          peekBox.right <= window.innerWidth - 3 &&
          (Math.abs(peekBox.left - 4) < 1 || Math.abs(peekBox.right - window.innerWidth + 4) < 1),
        'peek finishes fully visible beside its nearest browser edge',
      );
      assert.equal(rafs.size, 0, 'peek releases all animation frames');
      await resetScene('wiggle');
      const danceStart = drawCalls.length;
      const dancing = demo.assistant.perform('wiggle');
      const stopDanceScroll = keepScrolling();
      try {
        await dancing;
      } finally {
        stopDanceScroll();
      }
      const wiggleFrames = drawCalls
        .slice(danceStart)
        .filter((call) => call.sheet === (atlasManifest.clips.wiggle.sheet ?? 'main'))
        .map(frameOf);
      assert.ok(
        new Set(wiggleFrames.filter((frame) => atlasManifest.clips.wiggle.frames.includes(frame)))
          .size >= 3,
        'wiggle draws several actual new sprite cells',
      );
      assert.equal(rafs.size, 0, 'wiggle releases all animation frames');
      await resetScene('flip');
      const flipStart = drawCalls.length;
      const flipping = demo.assistant.perform('flip');
      const stopFlipScroll = keepScrolling();
      try {
        await wait(350);
        assert.equal(
          element.dataset.motion,
          'flip',
          'somersault continues its distinct finite path while scrolling',
        );
        await flipping;
      } finally {
        stopFlipScroll();
      }
      await waitForMotion();
      const flipFrames = drawCalls
        .slice(flipStart)
        .filter((call) => call.sheet === atlasManifest.clips.flip.sheet)
        .map(frameOf);
      assert.ok(
        new Set(flipFrames).size >= 6,
        'somersault uses distinct perspective sprite frames',
      );
      assert.equal(rafs.size, 0, 'somersault releases all animation frames');
      await resetScene('arrival');
      const previousEntry = element.dataset.entry;
      await demo.assistant.perform('arrival');
      await waitForMotion();
      assert.ok(
        ['left', 'right', 'top', 'bottom'].includes(element.dataset.entry),
        'appearance records its selected edge',
      );
      assert.notEqual(
        element.dataset.entry,
        previousEntry,
        'next appearance chooses a different edge',
      );
      assert.equal(rafs.size, 0, 'appearance is finite');
      await resetScene('drag');
      const phases = [];
      const canopy = shadow.querySelector('svg.pika-a-parachute');
      assert.ok(canopy, 'parachute has a separate SVG above the actor');
      assert.equal(
        canopy.getAttribute('aria-hidden'),
        'true',
        'decorative canopy does not add an accessibility action',
      );
      const actorPixels = {
        width: shadow.querySelector('canvas').width,
        height: shadow.querySelector('canvas').height,
      };
      let actorSizePreserved = true;
      const phaseObserver = new window.MutationObserver(() => {
        const phase = element.dataset.motion;
        if (phase === 'parachute')
          actorSizePreserved &&=
            shadow.querySelector('canvas').width === actorPixels.width &&
            shadow.querySelector('canvas').height === actorPixels.height;
        if (phase && phases.at(-1) !== phase) phases.push(phase);
      });
      phaseObserver.observe(element, { attributes: true, attributeFilter: ['data-motion'] });
      const grabbedPath = demo.assistant.perform('stroll');
      await wait(180);
      const press = center();
      pointer(launcher, 'pointerdown', press);
      pointer(launcher, 'pointermove', { x: press.x + 2, y: press.y - 2 });
      assert.notEqual(element.dataset.dragging, 'true', 'subthreshold movement remains a press');
      const dragMove = pointer(launcher, 'pointermove', { x: press.x - 150, y: 100 });
      assert.equal(
        element.dataset.motion,
        'drag',
        'mouse/touch crossing threshold begins real drag',
      );
      assert.equal(dragMove.defaultPrevented, true, 'drag movement cannot pan the shop page');
      assert.equal(pointerCaptures.get(7), launcher, 'drag owns pointer capture');
      await grabbedPath;
      await wait(650);
      const heldFrame = shadow.querySelector('canvas').dataset.frame;
      const heldDraws = drawCalls.length;
      await wait(120);
      assert.equal(
        shadow.querySelector('canvas').dataset.frame,
        heldFrame,
        'held character has a steady final hold pose',
      );
      assert.equal(drawCalls.length, heldDraws, 'held pose stops its frame loop');
      assert.equal(rafs.size, 0, 'human-controlled dragging has no autonomous RAF');
      pointer(launcher, 'pointermove', { x: -200, y: -200 });
      const bounded = launcher.getBoundingClientRect();
      assert.ok(bounded.left >= 0 && bounded.top >= 0, 'drag is clamped to visible viewport');
      document.dispatchEvent(new window.Event('scroll', { bubbles: true }));
      pointer(launcher, 'pointermove', { x: 100, y: 80 });
      assert.equal(
        element.dataset.motion,
        'drag',
        'human drag remains responsive while a scroll event is observed',
      );
      const droppedX = launcher.getBoundingClientRect().left;
      selectChance(0.65, process.argv.includes('--canopy'), () =>
        pointer(launcher, 'pointerup', { x: 100, y: 80 }),
      );
      assert.equal(pointerCaptures.size, 0, 'release frees pointer capture');
      const stopDropScroll = keepScrolling();
      try {
        const fallingTop = launcher.getBoundingClientRect().top;
        const fallingDraws = drawCalls.length;
        await wait(180);
        assert.ok(
          launcher.getBoundingClientRect().top > fallingTop + 1,
          'the released character keeps falling during scroll',
        );
        assert.ok(drawCalls.length > fallingDraws, 'the real fall sprite advances during scroll');
        if (process.argv.includes('--canopy')) {
          const deployedUntil = performance.now() + 1000;
          while (element.dataset.motion !== 'parachute' && performance.now() < deployedUntil)
            await wait(25);
          assert.equal(
            element.dataset.motion,
            'parachute',
            'the real scroll-time release deploys its canopy',
          );
          const canopyTop = launcher.getBoundingClientRect().top;
          const canopyDraws = drawCalls.length;
          await wait(180);
          assert.ok(
            launcher.getBoundingClientRect().top > canopyTop + 1,
            'the deployed canopy descends during scroll',
          );
          assert.ok(
            drawCalls.length > canopyDraws,
            'the actual parachute clip advances during scroll',
          );
        }
        await waitForMotion(5000);
        assert.equal(
          rafs.size,
          0,
          'drop and landing stop their finite frames while scrolling continues',
        );
        const landedDraws = drawCalls.length;
        await wait(120);
        assert.equal(
          drawCalls.length,
          landedDraws,
          'scroll postpones a new microgesture after the drop lands',
        );
      } finally {
        stopDropScroll();
      }
      phaseObserver.disconnect();
      assert.ok(phases.includes('drag'));
      assert.ok(
        phases.includes('fall') || phases.includes('parachute'),
        'drop has a controlled descent',
      );
      if (process.argv.includes('--canopy'))
        assert.ok(phases.includes('parachute'), 'reproducible real drop visits canopy stage');
      else
        assert.equal(
          phases.includes('parachute'),
          false,
          'default smoke covers a plain fall during scroll',
        );
      assert.equal(actorSizePreserved, true, 'body canvas retains its size during parachute phase');
      assert.ok(
        phases.includes('land') && !phases.includes('return') && !phases.includes('hide'),
        'drop lands without automatically returning or hiding',
      );
      assert.ok(
        Math.abs(launcher.getBoundingClientRect().left - droppedX) < 0.2,
        'drop leaves the character at the horizontal position selected by the user',
      );
      assert.equal(rafs.size, 0, 'drop chain releases all animation frames');
      assert.equal(
        shadow.querySelector('dialog').open,
        false,
        'drag/drop does not open store menu',
      );
      assert.equal(
        history.state?.__animeShopAssistantOverlay_v1,
        undefined,
        'drag/drop does not create overlay history',
      );
      await resetScene('pointer-cancel');
      const cancelPress = center();
      pointer(launcher, 'pointerdown', cancelPress);
      pointer(launcher, 'pointermove', { x: cancelPress.x - 80, y: cancelPress.y - 120 });
      pointer(launcher, 'pointercancel', { x: cancelPress.x - 80, y: cancelPress.y - 120 });
      await waitForMotion();
      assert.equal(pointerCaptures.size, 0, 'pointercancel frees capture');
      assert.equal(rafs.size, 0, 'pointercancel leaves no animation callback');
      await resetScene('lost-capture');
      const lostPress = center();
      pointer(launcher, 'pointerdown', lostPress);
      pointer(launcher, 'pointermove', { x: lostPress.x - 80, y: lostPress.y - 120 });
      pointerCaptures.delete(7);
      pointer(launcher, 'lostpointercapture', { x: lostPress.x - 80, y: lostPress.y - 120 });
      await waitForMotion();
      assert.equal(rafs.size, 0, 'lost capture leaves no active path');
      await resetScene('scroll-continuation');
      const scrollingRoute = demo.assistant.perform('stroll');
      await wait(350);
      const stopRouteScroll = keepScrolling();
      try {
        const ongoingOffset = launcher.style.transform;
        const ongoingDraws = drawCalls.length;
        document.dispatchEvent(
          new window.MouseEvent('pointermove', { bubbles: true, clientX: -400, clientY: 0 }),
        );
        demo.adapter.emit({ type: 'interaction', kind: 'product:enter' });
        await wait(120);
        assert.notEqual(
          launcher.style.transform,
          ongoingOffset,
          'scroll lets the current route continue without snapping',
        );
        assert.ok(
          drawCalls.length > ongoingDraws,
          'scroll lets the current sprite advance while new cursor/hover reactions wait',
        );
        assert.equal(
          element.dataset.animation,
          'walk',
          'pointer and product input do not replace the current walking clip',
        );
        assert.equal(launcher.hidden, false, 'scroll keeps character visible');
        await scrollingRoute;
        assert.equal(rafs.size, 0, 'current scroll-time route completes its finite frames');
        launcher.dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true, composed: true }));
        document.querySelector('[data-companion-skill="wiggle"]').click();
        await wait(60);
        assert.equal(
          element.dataset.animation,
          'wiggle',
          'explicit lab command starts immediately during scrolling',
        );
        assert.ok(
          drawCalls.length > ongoingDraws,
          'explicit lab command is not silently lost during scroll pause',
        );
        await waitForMotion(4500);
        assert.equal(rafs.size, 0, 'explicit command during scroll remains finite');
      } finally {
        stopRouteScroll();
      }
      await resetScene('blocker-cancel');
      const blockedRoute = demo.assistant.perform('stroll');
      await wait(180);
      demo.openDialog('search');
      await blockedRoute;
      await wait(40);
      assert.equal(launcher.hidden, true);
      assert.equal(rafs.size, 0, 'store blocker cancels character movement and sprite frames');
      demo.closeDialog('search');
      await resetScene('drag-blocker');
      const blockerPress = center();
      pointer(launcher, 'pointerdown', blockerPress);
      pointer(launcher, 'pointermove', { x: blockerPress.x - 80, y: blockerPress.y - 120 });
      demo.openDialog('search');
      await wait(40);
      assert.equal(pointerCaptures.size, 0, 'store blocker frees active pointer capture');
      assert.equal(launcher.hidden, true);
      assert.equal(rafs.size, 0, 'store blocker cancels drag and held sprite');
      demo.closeDialog('search');
      await resetScene('motion-off-cancel');
      const stoppedRoute = demo.assistant.perform('climb');
      await wait(180);
      await demo.assistant.setMotion('off');
      await stoppedRoute;
      await wait(40);
      assert.equal(rafs.size, 0, 'motion switch cancels active path');
      await demo.assistant.setMotion('system');
      await resetScene('hide-cancel');
      const hiddenRoute = demo.assistant.perform('peek');
      await wait(180);
      await demo.assistant.hide();
      await hiddenRoute;
      await wait(40);
      assert.equal(launcher.hidden, true);
      assert.equal(rafs.size, 0, 'hide cancels active path');
      await demo.assistant.restore();
      await resetScene('destroy-cancel');
      const destroyPress = center();
      pointer(launcher, 'pointerdown', destroyPress);
      pointer(launcher, 'pointermove', { x: destroyPress.x - 80, y: destroyPress.y - 120 });
      console.log(
        JSON.stringify({
          scenesChecked: [
            'real lab stroll',
            'climb',
            'peek',
            'wiggle',
            'flip',
            'varied arrival',
            'mouse/touch drag threshold',
            'held pose',
            'drop stages',
            'drag bounds',
            'capture/cancel/lost capture',
            'bubble offsets',
            'pointer guards',
            'current routes and drop continue during scroll',
            'explicit lab command after scroll',
            'blocker cancel',
            'motion cancel',
            'hide cancel',
          ],
        }),
      );
    }
    await demo.assistant.destroy();
    assert.equal(pointerCaptures.size, 0, 'destroy frees active pointer capture');
    assert.equal(rafs.size, 0, 'destroy cancels active path and queued frame callbacks');
    assert.equal(document.querySelectorAll('anime-shop-assistant').length, 0);
    assert.equal(demo.adapter.subscriberCount, 0);
    const { init } = await import(pathToFileURL(resolve(root, 'src/index.js')).href);
    const recreated = await init({
      configUrl: '/demo/assistant.config.json',
      adapter: demo.adapter,
    });
    assert.equal(document.querySelectorAll('anime-shop-assistant').length, 1);
    assert.equal(demo.adapter.subscriberCount, 1);
    await recreated.destroy();
    assert.equal(demo.adapter.subscriberCount, 0);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log(
      JSON.stringify({
        result: 'PASS',
        behavior: calm ? 'calm' : 'lively',
        layout: mobile ? 'compact' : 'desktop',
        realAssistant: true,
        drawCalls: drawCalls.length,
        distinctFrames: new Set(drawCalls.map((call) => `${call.sheet}:${call.sx},${call.sy}`))
          .size,
        checked: [
          'startup',
          'launcher click',
          calm ? 'menu/categories/settings' : 'speech without menu/history',
          'motion switch',
          'confirmed cart animation',
          'cart counter',
          'hide/restore',
          'checkout character/form/cart and payment suppression',
          'search blocker',
          'destroy',
          'reinit',
        ],
        limitations:
          'JSDOM: CSS layout and native browser input are not asserted. Only browser primitives are mocked.',
      }),
    );
    for (const id of rafs) clearTimeout(id);
  } finally {
    restoreChance();
    await window.pikaDemo?.destroy();
    for (const id of rafs) clearTimeout(id);
    for (const timer of imageLoadTimers.values()) clearTimeout(timer);
    imageLoadTimers.clear();
    dom.window.close();
    quietClock?.restore();
  }
}

function installVirtualClock() {
  const native = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    dateNow: Date.now,
    performanceNow: Object.getOwnPropertyDescriptor(performance, 'now'),
  };
  const dateBase = Date.now();
  const performanceBase = performance.now();
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  const schedule = (callback, delay = 0, interval = 0, args = []) => {
    const id = --sequence;
    const timer = { callback, at: now + Math.max(0, Number(delay)), interval, args };
    // Keep Node HTTP timers real; the parser calls unref().
    const handle = {
      native: null,
      unref() {
        timers.delete(handle);
        handle.native ??= native.setTimeout(callback, delay, ...args);
        handle.native.unref();
        return handle;
      },
      ref() {
        handle.native?.ref();
        return handle;
      },
      refresh() {
        if (handle.native) handle.native.refresh();
        else {
          timer.at = now + Math.max(0, Number(delay));
          timers.set(handle, timer);
        }
        return handle;
      },
      [Symbol.toPrimitive]: () => id,
    };
    timers.set(handle, timer);
    return handle;
  };
  globalThis.setTimeout = (callback, delay, ...args) => schedule(callback, delay, 0, args);
  globalThis.setInterval = (callback, delay, ...args) =>
    schedule(callback, delay, Math.max(1, Number(delay)), args);
  globalThis.clearTimeout = (id) => {
    if (timers.has(id)) timers.delete(id);
    else if (id?.native) native.clearTimeout(id.native);
    else if (typeof id !== 'number' || id >= 0) native.clearTimeout(id);
  };
  globalThis.clearInterval = globalThis.clearTimeout;
  Date.now = () => dateBase + now;
  Object.defineProperty(performance, 'now', {
    configurable: true,
    value: () => performanceBase + now,
  });
  return {
    waitForIO(duration) { return new Promise((resolve) => native.setTimeout(resolve, duration)); },
    async advance(duration) {
      const target = now + duration;
      let callbacks = 0;
      let steps = 0;
      while (now < target) {
        const next = Math.min(target, now + 16);
        let pending;
        while (
          (pending = [...timers]
            .filter(([, timer]) => timer.at <= next)
            .sort((a, b) => a[1].at - b[1].at)[0])
        ) {
          const [id, timer] = pending;
          assert.ok(++callbacks < 10000, `virtual clock callback loop: ${timer.callback}`);
          now = Math.max(now, timer.at);
          timers.delete(id);
          if (timer.interval) timers.set(id, { ...timer, at: now + timer.interval });
          timer.callback(...timer.args);
          await Promise.resolve();
        }
        now = next;
        // Permit real HTTP, dynamic imports and promise continuations to settle.
        await new Promise((resolve) => {
          if (++steps % 32 === 0) native.setTimeout(resolve, 0);
          else setImmediate(resolve);
        });
      }
      await Promise.resolve();
    },
    restore() {
      timers.clear();
      globalThis.setTimeout = native.setTimeout;
      globalThis.clearTimeout = native.clearTimeout;
      globalThis.setInterval = native.setInterval;
      globalThis.clearInterval = native.clearInterval;
      Date.now = native.dateNow;
      if (native.performanceNow) Object.defineProperty(performance, 'now', native.performanceNow);
      else delete performance.now;
    },
  };
}
