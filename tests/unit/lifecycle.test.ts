import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/index';
import { createDemoAdapter } from '../../src/adapters/demo';
import { createAssistantElement } from '../../src/ui/element';
import { prepareGraphics } from '../../src/animation/preflight';
import type { PlaybackResult } from '../../src/animation/player';
import { PersonalityVariation } from '../../src/core/variation';
import { PREFERENCES_KEY } from '../../src/storage/preferences';
import type { AssistantInstance, OverlaySession, ShopAdapter } from '../../src/config/types';
import config from '../../demo/assistant.config.json';

// Mock graphics here; graphics-init.test.ts checks fetch, load and decode.
vi.mock('../../src/animation/preflight', () => ({
  prepareGraphics: vi.fn(async () => ({ manifest: {}, image: document.createElement('img'), poster: document.createElement('img') })),
}));

vi.mock('../../src/ui/element', () => ({
  createAssistantElement: vi.fn(() => {
    const element = document.createElement('div');
    element.dataset.lifecycleFixture = '1';
    const launcher = document.createElement('button');
    element.append(launcher);
    const dialog = { open: false };
    return Object.assign(element, {
      canvas: document.createElement('canvas'), poster: document.createElement('img'), launcher,
      dialog, shadow: { activeElement: null },
      setup: vi.fn(async () => true), setCompact: vi.fn(),
      position: vi.fn((reserved: number) => ({ room: true, launcherLeft: 880, launcherTop: 580,
        motionViewport: { ...viewportFixture.value, height: Math.max(1, viewportFixture.value.height - reserved) } })), render: vi.fn(), focusFirst: vi.fn(),
      setMotionOffset: vi.fn(),
      show() { dialog.open = true; }, close() { dialog.open = false; }, destroy() { element.remove(); },
    });
  }),
}));

vi.mock('../../src/animation/player', () => ({
  SpritePlayer: class {
    constructor(_canvas: HTMLCanvasElement, _poster: HTMLImageElement, _assets: unknown, onEnd: (result: PlaybackResult) => void) { animationCalls.end.mockImplementation(onEnd); }
    setEnabled = vi.fn(); resize = vi.fn(); play = animationCalls.play; stop = animationCalls.stop; pause = animationCalls.pause; look = animationCalls.look; prepareClip = animationCalls.prepare; sample = vi.fn(() => true); setFacing = animationCalls.facing; destroy = vi.fn();
  },
}));
vi.mock('../../src/positioning/viewport', () => ({
  ViewportObserver: class {
    constructor(onChange: () => void) { viewportFixture.onChange = onChange; }
    destroy = vi.fn();
  },
  visibleViewport: () => ({ ...viewportFixture.value }),
}));

let instance: AssistantInstance | null;
let compact = false;
const animationCalls = vi.hoisted(() => ({ play: vi.fn(), stop: vi.fn(), pause: vi.fn(), facing: vi.fn(), look: vi.fn(), prepare: vi.fn(async () => true), end: vi.fn<(result: PlaybackResult) => void>() }));
const viewportFixture = vi.hoisted(() => ({
  value: { left: 0, top: 0, width: 1000, height: 700 },
  onChange: null as (() => void) | null,
}));

function manualFrames() {
  let time = 0;
  let sequence = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++sequence;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  return {
    draw(at: number, advanceTimers = false) {
      const elapsed = at - time;
      time = at;
      if (advanceTimers) vi.advanceTimersByTime(Math.max(0, elapsed));
      const current = [...callbacks.values()];
      callbacks.clear();
      for (const callback of current) callback(at);
    },
    get pending() { return callbacks.size; },
  };
}

async function flushPageReadiness(): Promise<void> {
  // Flush optional asset preparation before approach.
  for (let turn = 0; turn < 5; turn++) await Promise.resolve();
}

beforeEach(() => {
  instance = null;
  compact = false;
  viewportFixture.value = { left: 0, top: 0, width: 1000, height: 700 };
  viewportFixture.onChange = null;
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'calm', timings: undefined }) })));
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query.includes('max-width') && compact,
    media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
});

afterEach(async () => {
  await instance?.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('initialization and lifecycle boundaries', () => {
  it.each([0, 20, 80])('spawns on the safe floor with a 34px bottom inset and reserved %i', async (reserved) => {
    compact = true;
    const frames = manualFrames();
    viewportFixture.value = { left: 0, top: 0, width: 390, height: 844 };
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ schemaVersion: 1, hidden: false, motion: 'off', lastGreetingAt: null }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const floor = 844 - Math.max(34, reserved);
    vi.mocked(createAssistantElement).mockImplementationOnce(() => {
      const element = document.createElement('div');
      const launcher = document.createElement('button');
      element.append(launcher);
      return Object.assign(element, {
        launcher, canvas: document.createElement('canvas'), poster: document.createElement('img'),
        dialog: { open: false }, shadow: { activeElement: null },
        setup: vi.fn(async () => true), setCompact: vi.fn(),
        position: vi.fn(() => ({
          room: true, launcherLeft: 314, launcherTop: floor - 12 - 64,
          panelLeft: 0, panelTop: floor, panelWidth: 390, panelHeight: 600,
          motionViewport: { left: 0, top: 0, width: 390, height: floor },
        })),
        render: vi.fn(), setMotionOffset: vi.fn(), focusFirst: vi.fn(),
        close: vi.fn(), show: vi.fn(), destroy: vi.fn(() => element.remove()),
      }) as unknown as ReturnType<typeof createAssistantElement>;
    });
    instance = await init({ configUrl: '/demo/assistant.config.json',
      adapter: createDemoAdapter({ context: { ui: { bottomReservedPx: reserved } } }) });
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    expect(view.position).toHaveBeenCalledWith(reserved, 'right');
    const offset = view.setMotionOffset.mock.calls.at(-1)![0];
    expect(floor - 12 - 64 + offset.y + 64 * 11 / 12).toBeCloseTo(floor);
    expect(frames.pending).toBe(0);
  });

  it.each([
    { behavior: 'calm', compactLayout: true, pageType: 'catalog', suppressed: true },
    { behavior: 'lively', compactLayout: true, pageType: 'catalog', suppressed: true },
    { behavior: 'calm', compactLayout: true, pageType: 'checkout', suppressed: true },
    { behavior: 'lively', compactLayout: true, pageType: 'checkout', suppressed: false },
    { behavior: 'calm', compactLayout: false, pageType: 'catalog', suppressed: false },
    { behavior: 'lively', compactLayout: false, pageType: 'catalog', suppressed: false },
  ] as const)('checks a field focused before initialization: $behavior, compact=$compactLayout, $pageType', async ({ behavior, compactLayout, pageType, suppressed }) => {
    compact = compactLayout;
    const frames = manualFrames();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior }) })));
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    instance = await init({ configUrl: '/demo/assistant.config.json',
      adapter: createDemoAdapter({ context: { pageType, pageKey: `/${pageType}` } }) });
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    expect(document.activeElement).toBe(input);
    expect(view.render.mock.calls.at(-1)![0].state).toBe(suppressed ? 'suppressed' : 'closed');
    if (suppressed) {
      expect(animationCalls.play).not.toHaveBeenCalled();
      expect(frames.pending).toBe(0);
      input.blur();
      await vi.advanceTimersByTimeAsync(0);
      expect(view.render.mock.calls.at(-1)![0].state).toBe('closed');
    }
  });

  it.each(['hidden', 'blocker', 'pagehide', 'destroy'] as const)('does not revive the character for navigation while %s', async (reason) => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const adapter = createDemoAdapter();
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    frames.draw(5000);
    if (reason === 'hidden') await instance.hide();
    else if (reason === 'blocker') adapter.update({ ui: { blockers: ['cart-modal'] } });
    else if (reason === 'destroy') await instance.destroy();
    else window.dispatchEvent(new Event('pagehide'));
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    const current = view.setMotionOffset.mock.calls.at(-1)![0];
    animationCalls.prepare.mockClear();
    expect(await instance.preparePagePush!('left')).toBe(false);
    expect(animationCalls.prepare).not.toHaveBeenCalled();
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(current);
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
  });

  it('keeps page navigation disabled when mandatory graphics fail before runtime initialization', async () => {
    const frames = manualFrames();
    const adapter = createDemoAdapter();
    vi.mocked(prepareGraphics).mockRejectedValueOnce(new Error('Mandatory atlas decode failed'));
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    expect(await instance.preparePagePush!('right')).toBe(false);
    expect(adapter.subscriberCount).toBe(0);
    expect(document.querySelector('[data-lifecycle-fixture]')).toBeNull();
    expect(frames.pending).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });

  it('gives explicit page navigation priority over an unfinished support recovery without teleporting', async () => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const adapter = createDemoAdapter({ context: { pageType: 'product', ui: { bottomReservedPx: 84 } } });
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    frames.draw(5000);
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    adapter.update({ pageType: 'catalog', pageKey: '/new', ui: { bottomReservedPx: 0 } });
    expect(view.dataset.motion).toBe('fall');
    frames.draw(5120);
    const current = view.setMotionOffset.mock.calls.at(-1)![0];
    const preparing = instance.preparePagePush!('left');
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(current);
    await flushPageReadiness();
    frames.draw(7500, true);
    expect(await preparing).toBe(true);
    expect(animationCalls.look).toHaveBeenLastCalledWith('push-right');
    instance.finishPagePush!();
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
  });

  it('returns continuously from a fully hidden peek before approaching the page edge', async () => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter: createDemoAdapter() });
    frames.draw(5000);
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    const start = 880 + view.setMotionOffset.mock.calls.at(-1)![0].x;
    const peeking = instance.perform!('peek');
    const outward = animationCalls.facing.mock.calls.at(-1)![0];
    const hiddenAt = 5000 + Math.abs((outward > 0 ? 1008 : -104) - start) / 52.8 * 1000 + 20;
    frames.draw(hiddenAt);
    expect(view.dataset.motion).toBe('hide');
    const hidden = view.setMotionOffset.mock.calls.at(-1)![0];
    const preparing = instance.preparePagePush!(outward > 0 ? 'right' : 'left');
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(hidden);
    await flushPageReadiness();
    expect(view.dataset.motion).toBe('return');
    frames.draw(hiddenAt + 100);
    const returning = view.setMotionOffset.mock.calls.at(-1)![0];
    expect((returning.x - hidden.x) * outward).toBeLessThan(0);
    expect(Math.abs(returning.x - hidden.x)).toBeLessThan(108);
    frames.draw(hiddenAt + 1500, true);
    expect(await preparing).toBe(true); await peeking;
    expect(animationCalls.look).toHaveBeenLastCalledWith(outward > 0 ? 'push-left' : 'push-right');
    instance.finishPagePush!();
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
  });

  it('recovers an unfinished initial arrival for page navigation at its last drawn position', async () => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter: createDemoAdapter() });
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    expect(view.dataset.motion).not.toBe('');
    const arriving = view.setMotionOffset.mock.calls.at(-1)![0];
    const preparing = instance.preparePagePush!('right');
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(arriving);
    await flushPageReadiness();
    frames.draw(2500, true);
    expect(await preparing).toBe(true);
    instance.finishPagePush!();
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
  });

  it('allows explicit navigation before a scroll-delayed initial arrival and releases its temporary hidden state', async () => {
    const frames = manualFrames();
    let finishSetup!: (ready: boolean) => void;
    const setup = new Promise<boolean>((resolve) => { finishSetup = resolve; });
    vi.mocked(createAssistantElement).mockImplementationOnce(() => {
      const element = document.createElement('div');
      const launcher = document.createElement('button');
      element.append(launcher);
      return Object.assign(element, {
        launcher, canvas: document.createElement('canvas'), poster: document.createElement('img'),
        dialog: { open: false }, shadow: { activeElement: null },
        setup: vi.fn(() => setup), setCompact: vi.fn(),
        position: vi.fn((reserved: number) => ({ room: true, launcherLeft: 880, launcherTop: 580,
          motionViewport: { ...viewportFixture.value, height: Math.max(1, viewportFixture.value.height - reserved) } })),
        render: vi.fn(() => { launcher.hidden = false; }), setMotionOffset: vi.fn(), focusFirst: vi.fn(),
        close: vi.fn(), show: vi.fn(), destroy: vi.fn(() => element.remove()),
      }) as unknown as ReturnType<typeof createAssistantElement>;
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const initializing = init({ configUrl: '/demo/assistant.config.json', adapter: createDemoAdapter() });
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    document.dispatchEvent(new Event('scroll'));
    finishSetup(true);
    instance = await initializing;
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    expect(view.launcher.hidden).toBe(true);
    const preparing = instance.preparePagePush!('left');
    expect(view.launcher.hidden).toBe(false);
    await flushPageReadiness(); frames.draw(2500, true);
    expect(await preparing).toBe(true);
    instance.finishPagePush!();
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
    frames.draw(2500, true);
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
  });

  it('waits for cold push artwork at the visible resting point, then begins the finite approach', async () => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter: createDemoAdapter() });
    frames.draw(5000);
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    const from = view.setMotionOffset.mock.calls.at(-1)![0];
    let loaded!: (ready: boolean) => void;
    animationCalls.prepare.mockImplementationOnce(() => new Promise<boolean>((resolve) => { loaded = resolve; }));
    const preparing = instance.preparePagePush!('left');
    frames.draw(7400, true);
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(from);
    expect(880 + from.x).toBeGreaterThanOrEqual(0);
    expect(880 + from.x + 96).toBeLessThanOrEqual(1000);
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
    loaded(true); await flushPageReadiness();
    expect(view.dataset.motion).toBe('page-push');
    frames.draw(9400); expect(await preparing).toBe(true);
    expect(880 + view.setMotionOffset.mock.calls.at(-1)![0].x + 85).toBeCloseTo(0);
    instance.finishPagePush!(); expect(frames.pending).toBe(0);
  });

  it('keeps the character visible and releases navigation when optional roll artwork is unavailable', async () => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter: createDemoAdapter() });
    frames.draw(5000);
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    const resting = view.setMotionOffset.mock.calls.at(-1)![0];
    const side = 880 + resting.x > 500 ? 'left' : 'right';
    animationCalls.prepare.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await instance.preparePagePush!(side)).toBe(false);
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(resting);
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
    frames.draw(5100); expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(resting);
  });

  it.each(['finish', 'off', 'hide', 'blocker', 'resize', 'pagehide', 'destroy'] as const)('cancels cold push readiness on %s without a late offscreen approach', async (reason) => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const adapter = createDemoAdapter();
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter }); frames.draw(5000);
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    let loaded!: (ready: boolean) => void;
    animationCalls.prepare.mockImplementationOnce(() => new Promise<boolean>((resolve) => { loaded = resolve; }));
    const preparing = instance.preparePagePush!('left');
    frames.draw(5400);
    if (reason === 'finish') instance.finishPagePush!();
    else if (reason === 'off') await instance.setMotion!('off');
    else if (reason === 'hide') await instance.hide();
    else if (reason === 'blocker') adapter.update({ ui: { blockers: ['cart-review'] } });
    else if (reason === 'destroy') await instance.destroy();
    else window.dispatchEvent(new Event(reason));
    expect(await preparing).toBe(false);
    const point = view.setMotionOffset.mock.calls.at(-1)![0];
    loaded(true); await flushPageReadiness(); frames.draw(10000);
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(point);
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
    await instance.destroy();
    // JSDOM dispatches storage writes asynchronously, even after listener cleanup.
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('prepares at the actual paw contact, braces, takes steps with the page and resumes at the new resting point', async () => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const adapter = createDemoAdapter();
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    frames.draw(5000);
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    const from = view.setMotionOffset.mock.calls.at(-1)![0];
    const preparing = instance.preparePagePush!('left');
    let finished = false; void preparing.then(() => { finished = true; });
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(from);
    await flushPageReadiness();
    expect(view.dataset.motion).toBe('page-push');
    frames.draw(5050); await Promise.resolve(); expect(finished).toBe(false);
    frames.draw(7000); expect(await preparing).toBe(true);
    expect(animationCalls.look).toHaveBeenLastCalledWith('push-right');
    expect(animationCalls.prepare).toHaveBeenCalledWith('push-right');
    expect(animationCalls.facing).toHaveBeenLastCalledWith(1);
    const braced = view.setMotionOffset.mock.calls.at(-1)![0];
    expect(880 + braced.x + 85).toBeCloseTo(0);
    expect(frames.pending).toBe(0);
    instance.setInteractionHold!(false); // A palette closing cannot release the transition's hold.
    animationCalls.end('completed'); expect(view.dataset.motion).toBe('page-push');
    instance.setPagePushProgress!(.5);
    expect(animationCalls.play).toHaveBeenLastCalledWith('push-right', 2);
    let point = view.setMotionOffset.mock.calls.at(-1)![0];
    expect(880 + point.x + 85).toBeCloseTo(500); expect(580 + point.y + 88).toBeCloseTo(700);
    adapter.setPage('catalog', '/catalog'); frames.draw(7000);
    expect(view.dataset.motion).toBe('page-push');
    instance.setPagePushProgress!(1); instance.finishPagePush!();
    point = view.setMotionOffset.mock.calls.at(-1)![0];
    expect(880 + point.x).toBeCloseTo(900); expect(view.dataset.motion).toBe('');
    expect(frames.pending).toBe(0);
    const walking = instance.perform!('stroll'); frames.draw(9400); await walking;
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
  });

  it.each([-15, 15])('preserves the page contact when a covered route changes only scrollbar viewport width by %i pixels', async (difference) => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const adapter = createDemoAdapter({ context: { pageType: 'catalog', pageKey: '/new' } });
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    frames.draw(5000);
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    const preparing = instance.preparePagePush!('left');
    await flushPageReadiness(); frames.draw(7000);
    expect(await preparing).toBe(true);
    instance.setPagePushProgress!(.2);
    const contact = view.setMotionOffset.mock.calls.at(-1)![0];
    const positionCalls = view.position.mock.calls.length;
    viewportFixture.value.width += difference;
    viewportFixture.onChange!();
    expect(view.dataset.motion).toBe('page-push');
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(contact);
    expect(view.position.mock.calls.length).toBe(positionCalls);
    adapter.setPage('catalog', '/catalog');
    expect(view.dataset.motion).toBe('page-push');
    instance.setPagePushProgress!(.6);
    const moved = view.setMotionOffset.mock.calls.at(-1)![0];
    expect(880 + moved.x + 85).toBeCloseTo(600);
    expect(580 + moved.y + 88).toBe(700);
    expect(frames.pending).toBe(0);
    instance.finishPagePush!();
    expect(view.position.mock.calls.length).toBeGreaterThan(positionCalls);
    frames.draw(7500);
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
  });

  it.each(['height', 'offset-left', 'offset-top', 'scale'] as const)('still cancels a prepared page push when the visible viewport changes %s', async (change) => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal('visualViewport', { scale: 1 });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter: createDemoAdapter() });
    frames.draw(5000);
    const preparing = instance.preparePagePush!('left');
    await flushPageReadiness(); frames.draw(7000);
    expect(await preparing).toBe(true);
    instance.setPagePushProgress!(.2);
    if (change === 'scale') vi.stubGlobal('visualViewport', { scale: 1.25 });
    else if (change === 'height') viewportFixture.value.height -= 60;
    else if (change === 'offset-left') viewportFixture.value.left = 10;
    else viewportFixture.value.top = 10;
    viewportFixture.onChange!();
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    expect(view.dataset.motion).toBe('');
    const cancelledAt = view.setMotionOffset.mock.calls.at(-1)![0];
    instance.setPagePushProgress!(.6);
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(cancelledAt);
    frames.draw(7500);
    expect(view.dataset.motion).not.toBe('page-push');
    expect(frames.pending).toBe(0);
  });

  it.each(['finish', 'off', 'hide', 'blocker', 'resize', 'pagehide', 'destroy'] as const)('cancels a pending page approach on %s and settles without a frame or hold leak', async (reason) => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const adapter = createDemoAdapter({ context: { permissions: { persistentSettings: false } } });
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter }); frames.draw(5000);
    const preparing = instance.preparePagePush!('right'); await flushPageReadiness(); frames.draw(5200);
    if (reason === 'finish') instance.finishPagePush!();
    else if (reason === 'off') await instance.setMotion!('off');
    else if (reason === 'hide') await instance.hide();
    else if (reason === 'blocker') adapter.update({ ui: { blockers: ['cart'] } });
    else if (reason === 'destroy') await instance.destroy();
    else window.dispatchEvent(new Event(reason));
    expect(await preparing).toBe(false);
    frames.draw(10000); expect(frames.pending).toBe(0);
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    expect(view.dataset.motion).toBe('');
    await instance.destroy(); expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels while a braced pose is still loading and cannot revive a replaced page command', async () => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter: createDemoAdapter() }); frames.draw(5000);
    let resolvePose!: (ready: boolean) => void;
    animationCalls.look.mockImplementationOnce(() => new Promise<boolean>((resolve) => { resolvePose = resolve; }));
    const preparing = instance.preparePagePush!('left'); await flushPageReadiness(); frames.draw(7000);
    await Promise.resolve(); expect(resolvePose).toBeTypeOf('function');
    instance.finishPagePush!(); expect(await preparing).toBe(false);
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    const position = view.setMotionOffset.mock.calls.at(-1)![0];
    resolvePose(true); await Promise.resolve(); await Promise.resolve();
    instance.setPagePushProgress!(.7);
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(position);
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
  });

  it('keeps page preparation static when motion is off and recovers an airborne flip for explicit navigation', async () => {
    const frames = manualFrames();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter: createDemoAdapter() }); frames.draw(5000);
    await instance.setMotion!('off'); expect(await instance.preparePagePush!('left')).toBe(false);
    await instance.setMotion!('system');
    const flipping = instance.perform!('flip'); frames.draw(6250);
    const preparing = instance.preparePagePush!('right'); await flushPageReadiness();
    frames.draw(10000, true); expect(await preparing).toBe(true);
    await flipping;
    instance.finishPagePush!(); expect(frames.pending).toBe(0);
  });

  it.each([[84, 0], [0, 84], [144, 68], [68, 144]])('descends from reserved %i, pushes on the browser floor, then recovers continuously to reserved %i', async (fromReserved, toReserved) => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const adapter = createDemoAdapter({ context: { pageType: fromReserved ? 'product' : 'catalog', ui: { bottomReservedPx: fromReserved } } });
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter }); frames.draw(5000);
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    const original = view.setMotionOffset.mock.calls.at(-1)![0];
    const preparing = instance.preparePagePush!('left');
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(original);
    await flushPageReadiness();
    if (fromReserved) {
      expect(view.dataset.motion).toBe('fall');
      frames.draw(5150);
      const descending = 580 + view.setMotionOffset.mock.calls.at(-1)![0].y + 88;
      expect(descending).toBeGreaterThan(700 - fromReserved);
      expect(descending).toBeLessThan(700);
      frames.draw(5400); expect(view.dataset.motion).toBe('land');
      expect(animationCalls.play.mock.calls.some(([clip]) => clip === 'parachute')).toBe(false);
    }
    frames.draw(7800, true); expect(await preparing).toBe(true);
    expect(580 + view.setMotionOffset.mock.calls.at(-1)![0].y + 88).toBe(700);
    instance.setPagePushProgress!(.35);
    const beforeCommit = view.setMotionOffset.mock.calls.at(-1)![0];
    adapter.update({ pageType: toReserved ? 'product' : 'catalog', pageKey: '/covered-next', ui: { bottomReservedPx: toReserved } });
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(beforeCommit);
    expect(view.dataset.motion).toBe('page-push');
    instance.setPagePushProgress!(.7);
    const pushed = view.setMotionOffset.mock.calls.at(-1)![0];
    expect(580 + pushed.y + 88).toBe(700);
    instance.finishPagePush!();
    const recovering = view.setMotionOffset.mock.calls.at(-1)![0];
    expect(580 + recovering.y + 88).toBe(700);
    expect(view.dataset.motion).toBe(toReserved ? 'climb' : '');
    frames.draw(8800);
    expect(580 + view.setMotionOffset.mock.calls.at(-1)![0].y + 88).toBe(700 - toReserved);
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
  });

  it('cancels a panel descent at the drawn pixel, then climbs back onto the current support without returning home', async () => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const adapter = createDemoAdapter({ context: { pageType: 'product', ui: { bottomReservedPx: 84 } } });
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter }); frames.draw(5000);
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    const preparing = instance.preparePagePush!('left'); await flushPageReadiness(); frames.draw(5120);
    const descending = view.setMotionOffset.mock.calls.at(-1)![0];
    instance.finishPagePush!(); expect(await preparing).toBe(false);
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(descending);
    expect(view.dataset.motion).toBe('climb');
    frames.draw(5160);
    const climbing = view.setMotionOffset.mock.calls.at(-1)![0];
    expect(climbing.x).toBe(descending.x); expect(climbing.y).toBeLessThan(descending.y);
    frames.draw(6000);
    expect(580 + view.setMotionOffset.mock.calls.at(-1)![0].y + 88).toBe(616);
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
  });

  it('suspends a panel descent on pagehide and resumes onto its support continuously on pageshow', async () => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const adapter = createDemoAdapter({ context: { pageType: 'product', ui: { bottomReservedPx: 84 } } });
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    frames.draw(5000);
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    const preparing = instance.preparePagePush!('left'); await flushPageReadiness(); frames.draw(5120);
    const drawn = view.setMotionOffset.mock.calls.at(-1)![0];
    window.dispatchEvent(new Event('pagehide'));
    expect(await preparing).toBe(false);
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(drawn);
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    adapter.update({ ui: { blockers: ['suspended-store-dialog'] } });
    animationCalls.end('completed');
    window.dispatchEvent(new Event('resize')); frames.draw(5500);
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(drawn);
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
    adapter.update({ ui: { blockers: [] } });
    window.dispatchEvent(new Event('pageshow'));
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(drawn);
    expect(view.dataset.motion).toBe('climb');
    frames.draw(6500);
    expect(580 + view.setMotionOffset.mock.calls.at(-1)![0].y + 88).toBe(616);
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
  });

  it('uses finite walk clips followed by quiet hidden and curious peek holds', async () => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter: createDemoAdapter() });
    frames.draw(4000);
    animationCalls.play.mockClear();
    animationCalls.facing.mockClear();
    const motion = instance.perform?.('peek');
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    const outward = animationCalls.facing.mock.calls.at(-1)![0];
    const start = 880 + view.setMotionOffset.mock.calls.at(-1)![0].x;
    const leave = 4000 + Math.abs((outward > 0 ? 1008 : -104) - start) / 52.8 * 1000;
    const visible = leave + 800 + 56 / 52.8 * 1000;
    const plays = animationCalls.play.mock.calls.length;
    frames.draw(4900);
    expect(animationCalls.facing).toHaveBeenLastCalledWith(outward);
    expect(animationCalls.play).toHaveBeenCalledTimes(plays);
    expect(view.dataset.motion).toBe('peek');
    expect(view.launcher.hidden).toBe(false);
    animationCalls.end('completed');
    expect(animationCalls.play).toHaveBeenCalledTimes(plays + 1);
    frames.draw(leave + 20);
    expect(view.dataset.motion).toBe('hide');
    expect(frames.pending).toBe(0);
    const hiddenPlays = animationCalls.play.mock.calls.length;
    animationCalls.end('completed');
    expect(animationCalls.play).toHaveBeenCalledTimes(hiddenPlays);
    frames.draw(visible + 20, true);
    expect(animationCalls.look).toHaveBeenLastCalledWith('curious');
    expect(view.dataset.motion).toBe('peek');
    expect(frames.pending).toBe(0);
    animationCalls.end('completed');
    expect(animationCalls.play).toHaveBeenCalledTimes(hiddenPlays + 1);
    frames.draw(visible + 2100, true); await motion;
    expect(view.dataset.motion).toBe('');
    expect(frames.pending).toBe(0);
  });

  it('uses one finite head-only peek clip across reveal, hold and retract, then returns with walking', async () => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(.25);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter: createDemoAdapter() });
    frames.draw(5000);
    animationCalls.play.mockClear();
    animationCalls.facing.mockClear();
    const peeking = instance.perform!('peek');
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    const outward = animationCalls.facing.mock.calls.at(-1)![0];
    const start = 880 + view.setMotionOffset.mock.calls.at(-1)![0].x;
    const leftAt = 5000 + Math.abs((outward > 0 ? 1008 : -104) - start) / 52.8 * 1000;
    const headAt = leftAt + 700;
    frames.draw(leftAt + 10, true);
    expect(view.dataset.motion).toBe('hide');
    frames.draw(headAt + 200, true);
    expect(view.dataset.motion).toBe('peek');
    expect(animationCalls.play.mock.calls.filter(([clip]) => clip === 'head-peek')).toEqual([['head-peek', 1]]);
    expect(animationCalls.facing).toHaveBeenLastCalledWith(-outward);
    const plays = animationCalls.play.mock.calls.length;
    animationCalls.end('completed');
    expect(animationCalls.play).toHaveBeenCalledTimes(plays);
    frames.draw(headAt + 600, true);
    expect(frames.pending).toBe(0);
    frames.draw(headAt + 1600, true);
    expect(animationCalls.facing).toHaveBeenLastCalledWith(-outward);
    expect(animationCalls.play.mock.calls.filter(([clip]) => clip === 'head-peek')).toHaveLength(1);
    frames.draw(headAt + 2010, true);
    expect(view.dataset.motion).toBe('hide');
    frames.draw(headAt + 3000, true);
    expect(view.dataset.motion).toBe('return');
    expect(animationCalls.play.mock.lastCall?.[0]).toBe('walk');
    frames.draw(headAt + 7000, true);
    await peeking;
    expect(view.dataset.motion).toBe('');
    expect(frames.pending).toBe(0);
  });

  it('continues one arrival across both the page route scroll reset and subsequent user scrolling', async () => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    sessionStorage.setItem('animeShopAssistant:v1:personality', JSON.stringify({ schema: 1,
      decks: { arrival: { remaining: ['bottom', 'top', 'left', 'right'], last: null } } }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const adapter = createDemoAdapter();
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    frames.draw(800);
    expect(view.dataset.entry).toBe('bottom');
    expect(view.launcher.dataset.motion).toBe('climb');
    const before = view.setMotionOffset.mock.calls.at(-1)![0];
    animationCalls.pause.mockClear();
    adapter.update({ pageType: 'product', pageKey: '/product/one', ui: { bottomReservedPx: 84 } });
    vi.stubGlobal('scrollY', 0);
    document.dispatchEvent(new Event('scroll'));
    expect(animationCalls.pause).not.toHaveBeenCalled();
    expect(view.launcher.dataset.motion).toBe('climb');
    expect(view.dataset.entry).toBe('bottom');
    expect(frames.pending).toBe(1);
    frames.draw(1000);
    const after = view.setMotionOffset.mock.calls.at(-1)![0];
    expect(after.y).toBeLessThan(before.y);
    document.dispatchEvent(new Event('scroll'));
    expect(animationCalls.pause).not.toHaveBeenCalled();
    expect(frames.pending).toBe(1);
    vi.advanceTimersByTime(500);
    frames.draw(4000);
    const resting = view.setMotionOffset.mock.calls.at(-1)![0];
    expect(580 + resting.y + 88).toBe(616);
    expect(view.launcher.dataset.motion).toBe('');
    expect(frames.pending).toBe(0);
  });

  it('keeps the lively character available while filling out a compact checkout form', async () => {
    compact = true;
    manualFrames();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const adapter = createDemoAdapter({ context: { pageType: 'checkout', pageKey: '/checkout' } });
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    animationCalls.play.mockClear();
    await instance.open();
    expect(document.activeElement).toBe(input);
    expect(animationCalls.play).not.toHaveBeenCalled();
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    expect(view.render.mock.calls.at(-1)![0].greetingVisible).toBe(true);
    expect(adapter.subscriberCount).toBe(1);
  });

  it('concurrent init shares a single promise, node and subscription over twenty SPA routes', async () => {
    const adapter = createDemoAdapter();
    const first = init({ configUrl: '/demo/assistant.config.json', adapter });
    const second = init({ configUrl: '/demo/assistant.config.json', adapter });
    expect(second).toBe(first);
    instance = await first;
    expect(adapter.subscriberCount).toBe(1);
    expect(document.querySelectorAll('[data-lifecycle-fixture]')).toHaveLength(1);
    for (let index = 0; index < 20; index++) adapter.setPage('catalog', `/catalog?visit=${index}`);
    expect(adapter.subscriberCount).toBe(1);
    expect(document.querySelectorAll('[data-lifecycle-fixture]')).toHaveLength(1);
    await instance.destroy();
    expect(adapter.subscriberCount).toBe(0);
    expect(document.querySelectorAll('[data-lifecycle-fixture]')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    const third = init({ configUrl: '/demo/assistant.config.json', adapter });
    expect(third).not.toBe(first);
    instance = await third;
    expect(adapter.subscriberCount).toBe(1);
  });

  it('validates context around graphics preparation, subscribes before the final read and accepts a newer buffered snapshot', async () => {
    const adapter = createDemoAdapter();
    const initial = adapter.getContext();
    const operations: string[] = [];
    const wrapped: ShopAdapter = {
      ...adapter,
      subscribe(listener) {
        operations.push('subscribe');
        const remove = adapter.subscribe(listener);
        listener({ type: 'context', context: { ...initial, revision: 3, pageType: 'payment', pageKey: '/payment' } });
        return remove;
      },
      getContext() { operations.push('read'); return initial; },
    };
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter: wrapped });
    await instance.open();
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)?.value;
    expect(operations).toEqual(['read', 'read', 'subscribe', 'read']);
    expect(view.dialog.open).toBe(false);
  });

  it('disabled configuration never subscribes, creates a widget or starts timers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, enabled: false }) })));
    const adapter = createDemoAdapter();
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    await instance.open();
    expect(adapter.subscriberCount).toBe(0);
    expect(document.querySelectorAll('[data-lifecycle-fixture]')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('adapter exceptions during startup leave no subscription or DOM resource behind', async () => {
    const adapter = createDemoAdapter();
    adapter.getContext = () => { throw new Error('Store not ready'); };
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    expect(adapter.subscriberCount).toBe(0);
    expect(document.querySelectorAll('[data-lifecycle-fixture]')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])('waits for overlay cleanup and respects a later close, cancelled=%s', async (cancelled) => {
    compact = true;
    let finishClose = () => {};
    const pendingClose = new Promise<void>((resolve) => { finishClose = resolve; });
    const close = vi.fn(async () => {}).mockImplementationOnce(() => pendingClose);
    const adapter = createDemoAdapter();
    adapter.enterOverlay = vi.fn(async () => ({ close }));
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;

    await instance.open();
    expect(view.dialog.open).toBe(true);
    expect(document.documentElement.classList.contains('anime-assistant-scroll-locked')).toBe(true);
    const closing = instance.close();
    const reopening = instance.open();
    const lastClose = cancelled ? instance.close() : Promise.resolve();
    await Promise.resolve();
    expect(view.dialog.open).toBe(false);
    expect(adapter.enterOverlay).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains('anime-assistant-scroll-locked')).toBe(false);

    finishClose();
    await Promise.all([closing, reopening, lastClose]);
    expect(adapter.enterOverlay).toHaveBeenCalledTimes(cancelled ? 1 : 2);
    expect(close).toHaveBeenCalledTimes(1);
    expect(view.dialog.open).toBe(!cancelled);
    expect(view.render.mock.calls.at(-1)![0].state).toBe(cancelled ? 'closed' : 'open');
    expect(document.documentElement.classList.contains('anime-assistant-scroll-locked')).toBe(!cancelled);
    if (cancelled) {
      await instance.open();
      expect(view.dialog.open).toBe(true);
      expect(adapter.enterOverlay).toHaveBeenCalledTimes(2);
    }
    await instance.close();
  });

  it('destroy waits for an overlay that resolves after destruction begins and closes it once', async () => {
    compact = true;
    let resolveSession: (session: OverlaySession) => void = () => {};
    const pendingSession = new Promise<OverlaySession>((resolve) => { resolveSession = resolve; });
    const close = vi.fn(async () => {});
    const adapter = createDemoAdapter();
    adapter.enterOverlay = vi.fn(() => pendingSession);
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    const opening = instance.open();
    const destroying = instance.destroy();
    let finished = false;
    void destroying.then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    resolveSession({ close });
    await Promise.all([opening, destroying]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('[data-lifecycle-fixture]')).toHaveLength(0);
    expect(adapter.subscriberCount).toBe(0);
    expect(document.documentElement.classList.contains('anime-assistant-scroll-locked')).toBe(false);
  });

  it('an analytics callback failure never blocks opening or cleanup', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'calm', analyticsEnabled: true }) })));
    const track = vi.fn(() => { throw new Error('Analytics unavailable'); });
    const adapter = createDemoAdapter({ track, context: { permissions: { analytics: true } } });
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    await expect(instance.open()).resolves.toBeUndefined();
    expect(track).toHaveBeenCalled();
    await expect(instance.destroy()).resolves.toBeUndefined();
    expect(adapter.subscriberCount).toBe(0);
  });

  it('a lively character responds to a compact tap after arrival without opening a dialog or history overlay', async () => {
    compact = true;
    const frames = manualFrames();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const adapter = createDemoAdapter();
    adapter.enterOverlay = vi.fn(async () => ({ close: async () => {} }));
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    frames.draw(5000);
    await instance.open();
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)?.value;
    expect(view.dialog.open).toBe(false);
    expect(adapter.enterOverlay).not.toHaveBeenCalled();
    expect(animationCalls.play).toHaveBeenCalledWith('wink', 1);
    expect(document.documentElement.classList.contains('anime-assistant-scroll-locked')).toBe(false);
  });

  it.each(['left', 'right'] as const)('continues a %s arrival after a completed walk but never replays unavailable walking', async (side) => {
    const frames = manualFrames();
    vi.spyOn(PersonalityVariation.prototype, 'arrival').mockReturnValue(side);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter: createDemoAdapter() });
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    expect(view.dataset.entry).toBe(side);
    expect(animationCalls.play.mock.lastCall?.[0]).toBe('walk');
    const plays = animationCalls.play.mock.calls.length;
    animationCalls.end('completed');
    expect(animationCalls.play).toHaveBeenCalledTimes(plays + 1);
    const position = view.setMotionOffset.mock.calls.at(-1)![0];
    animationCalls.end('unavailable');
    await flushPageReadiness();
    expect(animationCalls.play).toHaveBeenCalledTimes(plays + 1);
    expect(frames.pending).toBe(1);
    frames.draw(200);
    expect(view.setMotionOffset.mock.calls.at(-1)![0]).not.toEqual(position);
    frames.draw(5000);
    expect(view.dataset.motion).toBe('');
    expect(frames.pending).toBe(0);
  });

  it('the public lively scene promise resolves at the real movement endpoint and keeps speech coordinates synchronized', async () => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const adapter = createDemoAdapter({ context: { permissions: { persistentSettings: false } } });
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)?.value;
    frames.draw(5000);
    const from = view.setMotionOffset.mock.calls.at(-1)![0];
    const performing = instance.perform!('stroll');
    let completed = false;
    void performing.then(() => { completed = true; });
    frames.draw(6200);
    await Promise.resolve();
    expect(completed).toBe(false);
    const midpoint = view.setMotionOffset.mock.calls.at(-1)![0];
    expect(580 + midpoint.y + 88).toBe(700);
    expect(view.launcher.style.transform).toContain('translate');
    expect(animationCalls.play).toHaveBeenCalledWith('walk', 6);
    frames.draw(7400);
    await performing;
    expect(completed).toBe(true);
    const endpoint = view.setMotionOffset.mock.calls.at(-1)![0];
    expect(Math.abs(midpoint.x - from.x) / 1.2).toBeCloseTo(52.8, 1);
    expect(580 + endpoint.y + 88).toBe(700);
    expect(Math.abs(endpoint.x - from.x)).toBeLessThanOrEqual(126.72);
    expect(frames.pending).toBe(0);
    expect(view.dialog.open).toBe(false);
  });

  it('destroy during a fully hidden peek cancels the hold and any finite walking continuation', async () => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter: createDemoAdapter() });
    frames.draw(5000);
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    const start = 880 + view.setMotionOffset.mock.calls.at(-1)![0].x;
    const peeking = instance.perform!('peek');
    const outward = animationCalls.facing.mock.calls.at(-1)![0];
    const hiddenAt = 5000 + Math.abs((outward > 0 ? 1008 : -104) - start) / 52.8 * 1000 + 20;
    frames.draw(hiddenAt);
    expect(view.dataset.motion).toBe('hide');
    expect(frames.pending).toBe(0);
    await instance.destroy(); await peeking;
    const plays = animationCalls.play.mock.calls.length;
    animationCalls.end('completed');
    frames.draw(hiddenAt + 20000, true);
    expect(animationCalls.play).toHaveBeenCalledTimes(plays);
    expect(frames.pending).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(document.querySelector('[data-lifecycle-fixture]')).toBeNull();
  });

  it('scrolling preserves a live scene, suppresses new reactions, and destroy releases every frame', async () => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const adapter = createDemoAdapter({ context: { permissions: { persistentSettings: false } } });
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)?.value;
    frames.draw(5000);
    const walking = instance.perform!('stroll');
    frames.draw(5800);
    const moving = view.launcher.style.transform;
    document.dispatchEvent(new Event('scroll'));
    frames.draw(6200);
    expect(view.launcher.style.transform).not.toBe(moving);
    expect(frames.pending).toBe(1);
    expect(animationCalls.pause).not.toHaveBeenCalled();
    const played = animationCalls.play.mock.calls.length;
    adapter.emit({ type: 'interaction', kind: 'product:enter' });
    expect(frames.pending).toBe(1);
    expect(animationCalls.play).toHaveBeenCalledTimes(played);
    frames.draw(7500);
    await walking;
    expect(frames.pending).toBe(0);
    const climbing = instance.perform!('climb');
    frames.draw(7900);
    expect(frames.pending).toBe(1);
    await instance.destroy();
    await climbing;
    expect(frames.pending).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(adapter.subscriberCount).toBe(0);
    expect(view.launcher.style.transform).toBe('');
  });

  it('destroy during a captured drag clears the physical state and releases the pointer exactly once', async () => {
    const frames = manualFrames();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const adapter = createDemoAdapter({ context: { permissions: { persistentSettings: false } } });
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)?.value;
    frames.draw(5000);
    view.launcher.setPointerCapture = vi.fn();
    view.launcher.releasePointerCapture = vi.fn();
    const pointer = (type: string, x: number, y: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerId: 7, clientX: x, clientY: y, button: 0, isPrimary: true });
      view.launcher.dispatchEvent(event);
    };
    pointer('pointerdown', 800, 600);
    pointer('pointermove', 720, 420);
    expect(view.dataset.dragging).toBe('true');
    expect(view.launcher.dataset.motion).toBe('drag');
    expect(frames.pending).toBe(0);
    expect(await instance.preparePagePush!('left')).toBe(false);
    expect(view.dataset.dragging).toBe('true');
    await instance.destroy();
    expect(view.launcher.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
    expect(adapter.subscriberCount).toBe(0);
    expect(frames.pending).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    pointer('pointermove', 100, 100);
    expect(view.launcher.style.transform).toBe('');
  });

  it.each(['mouse', 'touch'])('retains a stationary %s press past automatic deadlines and then starts dragging', async (pointerType) => {
    const frames = manualFrames();
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    instance = await init({ configUrl: '/demo/assistant.config.json',
      adapter: createDemoAdapter({ context: { permissions: { persistentSettings: false } } }) });
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    frames.draw(5000);
    view.launcher.setPointerCapture = vi.fn(); view.launcher.releasePointerCapture = vi.fn();
    const pointer = (type: string, x = 800, y = 600) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerId: 7, pointerType, clientX: x, clientY: y, button: 0, isPrimary: true });
      view.launcher.dispatchEvent(event);
    };
    const image = document.createElement('img'); document.body.append(image);
    const nativeDrag = () => {
      const event = new Event('dragstart', { bubbles: true, cancelable: true });
      image.dispatchEvent(event); return event.defaultPrevented;
    };
    expect(nativeDrag()).toBe(false);
    pointer('pointerdown');
    expect(nativeDrag()).toBe(true);
    const played = animationCalls.play.mock.calls.length;
    instance.setInteractionHold!(true); instance.setInteractionHold!(false);
    vi.advanceTimersByTime(10000);
    expect(animationCalls.play).toHaveBeenCalledTimes(played);
    expect(view.launcher.releasePointerCapture).not.toHaveBeenCalled();
    expect(view.dataset.motion).toBe('');
    pointer('pointermove', 840, 420);
    expect(view.dataset.motion).toBe('drag'); expect(view.dataset.dragging).toBe('true');
    expect(nativeDrag()).toBe(true);
    pointer('pointerup', 840, 420);
    expect(nativeDrag()).toBe(false);
    expect(view.launcher.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
    frames.draw(7000);
    expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
  });

  it.each(['pointerup', 'pointercancel', 'lostpointercapture', 'escape', 'off', 'blocker', 'destroy'])(
    'releases a pending stationary press on %s without a stuck hold or capture', async (release) => {
      const frames = manualFrames();
      vi.spyOn(Math, 'random').mockReturnValue(.5);
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
      const adapter = createDemoAdapter({ context: { permissions: { persistentSettings: false } } });
      instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
      const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
      frames.draw(5000);
      view.launcher.setPointerCapture = vi.fn(); view.launcher.releasePointerCapture = vi.fn();
      const pointer = (type: string) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, { pointerId: 7, pointerType: 'touch', clientX: 800, clientY: 600, button: 0, isPrimary: true });
        view.launcher.dispatchEvent(event);
      };
      pointer('pointerdown'); vi.advanceTimersByTime(1000);
      expect(view.launcher.releasePointerCapture).not.toHaveBeenCalled();
      if (release === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      else if (release === 'off') await instance.setMotion!('off');
      else if (release === 'blocker') adapter.update({ ui: { blockers: ['shop'] } });
      else if (release === 'destroy') await instance.destroy();
      else pointer(release);
      expect(view.launcher.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
      expect(view.dataset.motion).toBe(''); expect(frames.pending).toBe(0);
      if (!['off', 'blocker', 'destroy'].includes(release)) {
        const played = animationCalls.play.mock.calls.length;
        vi.advanceTimersByTime(1000);
        expect(animationCalls.play.mock.calls.length).toBeGreaterThan(played);
      }
    },
  );

  it.each(['pointerup', 'pointercancel'])(
    'keeps the waking drag captured through movement and releases it on %s', async (release) => {
      const frames = manualFrames();
      vi.spyOn(Math, 'random').mockReturnValue(.5);
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({
        ...config, behavior: 'lively', timings: { ...config.timings, sleepAfterMs: 100 },
      }) })));
      instance = await init({ configUrl: '/demo/assistant.config.json',
        adapter: createDemoAdapter({ context: { permissions: { persistentSettings: false } } }) });
      const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
      frames.draw(5000);
      vi.advanceTimersByTime(100);
      expect(view.render.mock.calls.at(-1)![0].sleeping).toBe(true);
      view.launcher.setPointerCapture = vi.fn();
      view.launcher.releasePointerCapture = vi.fn();
      const pointer = (type: string, x: number, y: number) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, { pointerId: 7, clientX: x, clientY: y, button: 0, isPrimary: true });
        view.launcher.dispatchEvent(event);
      };
      pointer('pointerdown', 800, 600);
      expect(view.render.mock.calls.at(-1)![0].sleeping).toBe(true);
      pointer('pointermove', 720, 420);
      expect(view.render.mock.calls.at(-1)![0].sleeping).toBe(false);
      expect(view.dataset.dragging).toBe('true');
      expect(view.dataset.motion).toBe('drag');
      expect(view.launcher.setPointerCapture).toHaveBeenCalledExactlyOnceWith(7);
      expect(view.launcher.releasePointerCapture).not.toHaveBeenCalled();
      const held = view.setMotionOffset.mock.calls.at(-1)![0];
      pointer('pointermove', 760, 380);
      expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual({ x: held.x + 40, y: held.y - 40 });
      pointer(release, 760, 380);
      expect(view.launcher.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
      expect(view.dataset.dragging).toBe('false');
      frames.draw(7000);
      expect(view.dataset.motion).toBe('');
      expect(frames.pending).toBe(0);
      const landed = view.setMotionOffset.mock.calls.at(-1)![0];
      expect(580 + landed.y + 88).toBe(700);
      pointer('pointermove', 100, 100);
      expect(view.setMotionOffset.mock.calls.at(-1)![0]).toEqual(landed);
    },
  );

  it('finishes an airborne flip through a large scroll burst without a suspended recovery', async () => {
    const frames = manualFrames();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter: createDemoAdapter() });
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    frames.draw(5000);
    const flipping = instance.perform!('flip');
    frames.draw(6250);
    const airborne = view.launcher.style.transform;
    const positions = new Set<string>();
    for (let index = 0; index < 100; index++) {
      vi.stubGlobal('scrollY', index % 2 ? 1_000_000 : 0);
      document.dispatchEvent(new Event('scroll'));
      frames.draw(6300 + index * 50, true);
      positions.add(view.launcher.style.transform);
      if (index < 24) expect(frames.pending).toBe(1);
      else expect(frames.pending).toBe(0);
    }
    await flipping;
    expect(positions.size).toBeGreaterThan(5);
    expect(view.launcher.style.transform).not.toBe(airborne);
    expect(animationCalls.pause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(449);
    expect(frames.pending).toBe(0);
    vi.advanceTimersByTime(1);
    expect(view.launcher.dataset.motion).toBe('');
    expect(frames.pending).toBe(0);
    const landed = view.setMotionOffset.mock.calls.at(-1)![0];
    expect(580 + landed.y + 88).toBe(700);
    expect(frames.pending).toBe(0);
    expect(view.launcher.dataset.motion).toBe('');
  });

  it('finishes walking during scroll without pausing, replaying arrival or starting a recovery flight', async () => {
    const frames = manualFrames();
    // This entrance keeps the first stroll active through the scroll samples.
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    instance = await init({ configUrl: '/demo/assistant.config.json', adapter: createDemoAdapter() });
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    frames.draw(5000);
    const walking = instance.perform!('stroll');
    frames.draw(5800);
    const position = view.launcher.style.transform;
    animationCalls.stop.mockClear();
    animationCalls.pause.mockClear();
    for (let index = 0; index < 5; index++) {
      document.dispatchEvent(new Event('scroll'));
      frames.draw(5900 + index * 100, true);
      expect(frames.pending).toBe(1);
    }
    frames.draw(7400, true);
    await walking;
    expect(view.launcher.style.transform).not.toBe(position);
    expect(animationCalls.pause).not.toHaveBeenCalled();
    expect(view.launcher.dataset.motion).toBe('');
    expect(frames.pending).toBe(0);
    const next = instance.perform!('stroll');
    frames.draw(9800);
    await next;
    expect(view.launcher.style.transform).not.toBe(position);
  });

  it('waits for an existing scroll to settle before showing a single initial arrival', async () => {
    const frames = manualFrames();
    let finishSetup = () => {};
    const setupPending = new Promise<boolean>((resolve) => { finishSetup = () => resolve(true); });
    vi.mocked(createAssistantElement).mockImplementationOnce(() => {
      const element = document.createElement('div');
      const launcher = document.createElement('button');
      element.append(launcher);
      return Object.assign(element, {
        launcher, canvas: document.createElement('canvas'), poster: document.createElement('img'),
        dialog: { open: false }, shadow: { activeElement: null },
        setup: vi.fn(() => setupPending), setCompact: vi.fn(),
        position: vi.fn((reserved: number) => ({ room: true, launcherLeft: 880, launcherTop: 580,
          motionViewport: { ...viewportFixture.value, height: Math.max(1, viewportFixture.value.height - reserved) } })),
        render: vi.fn(() => { launcher.hidden = false; }), setMotionOffset: vi.fn(), focusFirst: vi.fn(),
        close: vi.fn(), show: vi.fn(), destroy: vi.fn(() => element.remove()),
      }) as unknown as ReturnType<typeof createAssistantElement>;
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...config, behavior: 'lively' }) })));
    const initializing = init({ configUrl: '/demo/assistant.config.json', adapter: createDemoAdapter() });
    for (let index = 0; index < 20; index++) await Promise.resolve();
    const view = vi.mocked(createAssistantElement).mock.results.at(-1)!.value;
    expect(view.setup).toHaveBeenCalled();
    document.dispatchEvent(new Event('scroll'));
    finishSetup();
    instance = await initializing;
    expect(view.launcher.hidden).toBe(true);
    expect(animationCalls.play).not.toHaveBeenCalled();
    expect(frames.pending).toBe(0);
    vi.advanceTimersByTime(499);
    expect(view.launcher.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(view.launcher.hidden).toBe(false);
    expect(animationCalls.play).toHaveBeenCalledTimes(1);
    expect(view.launcher.dataset.motion).not.toBe('');
    frames.draw(5000);
    expect(view.launcher.dataset.motion).toBe('');
    expect(frames.pending).toBe(0);
  });
});
