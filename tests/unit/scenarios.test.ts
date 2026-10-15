import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUIET_GESTURES, ScenarioController, type ScenarioPreferences } from '../../src/core/scenarios';
import type { AnimationState } from '../../src/animation/manifest';
import type { MotionKind } from '../../src/positioning/personality';
import type { AssistantConfig, ShopContext, ShopEvent } from '../../src/config/types';
import { validateConfig, validateShopEvent } from '../../src/config/validate';
import configFixture from '../../demo/assistant.config.json';
import { PersonalityVariation, REPLIES } from '../../src/core/variation';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const DAY = 86_400_000;
const controllers: ScenarioController[] = [];
const config = validateConfig({ ...configFixture, behavior: 'calm', timings: undefined }, 'https://shop.example').config as AssistantConfig;
const livelyConfig = validateConfig(configFixture, 'https://shop.example').config as AssistantConfig;

function context(overrides: Partial<ShopContext> = {}): ShopContext {
  return {
    revision: 0, pageKey: '/catalog', pageType: 'catalog', cartCount: null,
    ui: { floatingAllowed: true, bottomReservedPx: 0, blockers: [] },
    permissions: { persistentSettings: true, analytics: false },
    ...overrides,
  };
}

function addition(id: string, overrides: Partial<Extract<ShopEvent, { type: 'cart:added' }>> = {}): Extract<ShopEvent, { type: 'cart:added' }> {
  return { type: 'cart:added', id, quantity: 1, occurredAt: Date.now(), ...overrides };
}

function setup(options: { profile?: 'calm' | 'lively'; scenes?: boolean; persistent?: boolean; compact?: boolean; reduced?: boolean; preferences?: Partial<ScenarioPreferences>; context?: ShopContext; random?: () => number; sleepAfterMs?: number } = {}) {
  const preferences: ScenarioPreferences = { hidden: false, motion: 'system', lastGreetingAt: null, ...options.preferences };
  const hooks = { change: vi.fn(), animate: vi.fn(), greeted: vi.fn(), pose: vi.fn(), pause: vi.fn(), recover: vi.fn(), ...(options.scenes ? { motion: vi.fn() } : {}) };
  const variation = new PersonalityVariation({ storage: null, random: options.random ?? (() => .4) });
  const selectedConfig = options.profile === 'lively' ? livelyConfig : config;
  const controller = new ScenarioController(options.sleepAfterMs === undefined ? selectedConfig : { ...selectedConfig, timings: { ...selectedConfig.timings, sleepAfterMs: options.sleepAfterMs } }, preferences, hooks, variation);
  controllers.push(controller);
  controller.setPreferences(preferences, options.persistent ?? true);
  controller.setEnvironment(options.compact ?? false, options.reduced ?? false);
  controller.context(options.context ?? context());
  const calls = (animation: AnimationState) => hooks.animate.mock.calls.filter(([state]) => state === animation);
  return { controller, hooks, preferences, calls };
}

/** Simulate only finite browser clip/driver completion; all scheduling stays in the real controller. */
function completeFiniteActions(controller: ScenarioController, hooks: ReturnType<typeof setup>['hooks']) {
  let generation = 0;
  const trace: { state: AnimationState; at: number }[] = [];
  const clips: Partial<Record<AnimationState, number>> = { idle: 1000, wink: 1250, wave: 1500, happy: 1500, wake: 750, sleep: 1000, sit: 4000, scratch: 1500, ears: 1500, stretch: 2500, nose: 1000, guitar: 9500 };
  hooks.animate.mockImplementation((state: AnimationState) => {
    trace.push({ state, at: Date.now() });
    const current = ++generation;
    const duration = clips[state];
    if (duration) setTimeout(() => {
      if (current === generation && !controller.interacting) controller.finishAnimation();
    }, duration);
  });
  hooks.motion?.mockImplementation((scene) => {
    const durations: Record<MotionKind, number> = { stroll: 2400, peek: 1600, climb: 2800, wiggle: 3200, flip: 2500 };
    const duration = durations[scene as MotionKind];
    setTimeout(() => controller.endPhysical(), duration);
  });
  return trace;
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.destroy();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('greeting and active time', () => {
  it('greets after five active seconds without opening a panel; the bubble ends after six seconds', () => {
    const { controller, hooks, calls } = setup();
    vi.advanceTimersByTime(4999);
    expect(hooks.greeted).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hooks.greeted).toHaveBeenCalledExactlyOnceWith(NOW + 5000);
    expect(calls('wave')).toHaveLength(1);
    expect(controller.snapshot.state).toBe('closed');
    expect(controller.snapshot.greetingVisible).toBe(true);
    vi.advanceTimersByTime(6000);
    expect(controller.snapshot.greetingVisible).toBe(false);
  });

  it('does not repeat greeting on navigation before thirty days, then allows a new visit', () => {
    const { controller, calls } = setup();
    vi.advanceTimersByTime(5000);
    controller.context(context({ revision: 1, pageKey: '/product/1' }));
    vi.advanceTimersByTime(5000);
    expect(calls('wave')).toHaveLength(1);
    vi.setSystemTime(NOW + 5000 + 30 * DAY);
    controller.context(context({ revision: 2, pageKey: '/catalog/new' }));
    vi.advanceTimersByTime(5000);
    expect(calls('wave')).toHaveLength(2);
  });

  it.each([['recent', NOW - 29 * DAY, 0], ['thirty days', NOW - 30 * DAY, 1]] as const)('respects the saved %s greeting timestamp', (_description, lastGreetingAt, expected) => {
    const { calls } = setup({ preferences: { lastGreetingAt } });
    vi.advanceTimersByTime(5000);
    expect(calls('wave')).toHaveLength(expected);
  });

  it('keeps automatic greetings disabled in memory-only settings and after permission withdrawal', () => {
    const memory = setup({ persistent: false });
    vi.advanceTimersByTime(5000);
    expect(memory.calls('wave')).toHaveLength(0);
    const revoked = setup();
    vi.advanceTimersByTime(4000);
    revoked.controller.setPreferences(revoked.preferences, false);
    vi.advanceTimersByTime(2000);
    expect(revoked.calls('wave')).toHaveLength(0);
  });

  it('uses only character motion on compact screens and cancels greeting when the menu opens', () => {
    const compact = setup({ compact: true });
    vi.advanceTimersByTime(5000);
    expect(compact.calls('wave')).toHaveLength(1);
    expect(compact.controller.snapshot.greetingVisible).toBe(false);
    const opened = setup();
    expect(opened.controller.open()).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(opened.hooks.greeted).not.toHaveBeenCalled();
    expect(opened.calls('wave')).toHaveLength(1);
    expect(opened.controller.snapshot.state).toBe('open');
  });

  it('pauses active time in a hidden tab and does not accumulate animation callbacks', () => {
    const { controller, hooks, calls } = setup();
    vi.advanceTimersByTime(3000);
    controller.block('documentHidden', true);
    expect(vi.getTimerCount()).toBe(0);
    hooks.animate.mockClear();
    vi.advanceTimersByTime(120_000);
    expect(hooks.animate).not.toHaveBeenCalled();
    expect(hooks.greeted).not.toHaveBeenCalled();
    controller.block('documentHidden', false);
    vi.advanceTimersByTime(1999);
    expect(calls('wave')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls('wave')).toHaveLength(1);
    expect(controller.snapshot.sleeping).toBe(false);
  });

  it('holds the greeting timeout while its pointer or focus is inside', () => {
    const { controller } = setup();
    vi.advanceTimersByTime(5000);
    vi.advanceTimersByTime(2000);
    controller.holdGreeting(true);
    vi.advanceTimersByTime(15_000);
    expect(controller.snapshot.greetingVisible).toBe(true);
    controller.holdGreeting(false);
    vi.advanceTimersByTime(3999);
    expect(controller.snapshot.greetingVisible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(controller.snapshot.greetingVisible).toBe(false);
  });
});

describe('priorities, context and cleanup', () => {
  it('requires a new revision and resets the panel only on an actual pageKey change', () => {
    const { controller } = setup();
    controller.open();
    controller.screen('categories');
    expect(controller.context(context({ revision: 0, pageKey: '/product/stale', cartCount: 9 }))).toBe(false);
    expect(controller.context(context({ revision: -1 }))).toBe(false);
    expect(controller.snapshot.context?.cartCount).toBeNull();
    expect(controller.snapshot.screen).toBe('categories');
    expect(controller.context(context({ revision: 1, cartCount: 3 }))).toBe(true);
    expect(controller.snapshot.state).toBe('open');
    expect(controller.snapshot.screen).toBe('categories');
    expect(controller.snapshot.context?.cartCount).toBe(3);
    expect(controller.context(context({ revision: 2, pageKey: '/product/new', pageType: 'product' }))).toBe(true);
    expect(controller.snapshot.state).toBe('closed');
    expect(controller.snapshot.screen).toBe('home');
  });

  it('keeps independent blockers until all are removed and drops blocked cart events', () => {
    const { controller, calls } = setup({ persistent: false });
    controller.open();
    controller.block('search', true);
    controller.block('cart', true);
    expect(controller.snapshot.state).toBe('suppressed');
    expect(controller.cart(addition('blocked-add'))).toBe(false);
    controller.block('search', false);
    expect(controller.available).toBe(false);
    expect(controller.open()).toBe(false);
    controller.block('cart', false);
    expect(controller.snapshot.state).toBe('closed');
    vi.advanceTimersByTime(6000);
    expect(calls('happy')).toHaveLength(0);
    expect(controller.cart(addition('blocked-add'))).toBe(false);
  });

  it('honors adapter blockers and user hiding independently', () => {
    const { controller, preferences } = setup({ persistent: false });
    controller.context(context({ revision: 1, ui: { floatingAllowed: true, bottomReservedPx: 48, blockers: ['menu', 'cookie'] } }));
    expect(controller.snapshot.state).toBe('suppressed');
    controller.setPreferences({ ...preferences, hidden: true }, true);
    controller.context(context({ revision: 2 }));
    expect(controller.snapshot.state).toBe('hiddenByUser');
    expect(controller.open()).toBe(false);
    controller.setPreferences(preferences, true);
    expect(controller.snapshot.state).toBe('closed');
  });

  it.each(['payment', 'account'] as const)('cannot be restored or opened on %s', (pageType) => {
    const { controller, calls } = setup({ context: context({ pageType }) });
    expect(controller.allowed).toBe(false);
    expect(controller.open()).toBe(false);
    expect(controller.cart(addition('forbidden'))).toBe(false);
    vi.advanceTimersByTime(120_000);
    expect(calls('wave')).toHaveLength(0);
    expect(calls('happy')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps checkout available while the shop still controls its registered blockers', () => {
    const { controller } = setup({ profile: 'lively', context: context({ pageType: 'checkout' }) });
    expect(controller.allowed).toBe(true);
    expect(controller.available).toBe(true);
    controller.block('checkout-dialog', true);
    expect(controller.available).toBe(false);
    controller.block('checkout-dialog', false);
    expect(controller.available).toBe(true);
  });

  it('destroy cancels deadlines and ignores later context, cart and activity', () => {
    const { controller, hooks } = setup();
    vi.advanceTimersByTime(2000);
    controller.activity(true);
    controller.destroy();
    expect(vi.getTimerCount()).toBe(0);
    hooks.animate.mockClear();
    hooks.change.mockClear();
    vi.advanceTimersByTime(120_000);
    expect(controller.context(context({ revision: 1 }))).toBe(false);
    expect(controller.cart(addition('destroyed'))).toBe(false);
    expect(controller.open()).toBe(false);
    controller.activity(true);
    expect(hooks.animate).not.toHaveBeenCalled();
    expect(hooks.change).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not accumulate timers over twenty route changes', () => {
    const { controller } = setup();
    for (let revision = 1; revision <= 20; revision += 1) {
      controller.open();
      controller.screen('settings');
      controller.context(context({ revision, pageKey: `/catalog/${revision}` }));
      expect(controller.snapshot.state).toBe('closed');
      expect(controller.snapshot.screen).toBe('home');
      expect(vi.getTimerCount()).toBeLessThanOrEqual(3);
    }
    controller.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('finite idle, sleep and scrolling', () => {
  it.each([[false, 16_000], [true, 24_000]] as const)('uses the %s compact idle interval of %i ms', (compact, interval) => {
    const { controller, calls } = setup({ compact, persistent: false });
    vi.advanceTimersByTime(interval - 1);
    expect(calls('idle')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls('idle')).toHaveLength(1);
    controller.finishAnimation();
    expect(controller.snapshot.animation).toBe('static');
    vi.advanceTimersByTime(interval - 1);
    expect(calls('idle')).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(calls('idle')).toHaveLength(2);
  });

  it('sleeps once after sixty seconds, stops idle and opens with wake on the first click', () => {
    const { controller, calls } = setup({ persistent: false });
    vi.advanceTimersByTime(59_999);
    expect(controller.snapshot.sleeping).toBe(false);
    vi.advanceTimersByTime(1);
    expect(controller.snapshot.sleeping).toBe(true);
    expect(calls('sleep')).toHaveLength(1);
    controller.finishAnimation();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(120_000);
    expect(calls('sleep')).toHaveLength(1);
    expect(controller.open()).toBe(true);
    expect(controller.snapshot.state).toBe('open');
    expect(controller.snapshot.sleeping).toBe(false);
    expect(calls('wake')).toHaveLength(1);
  });

  it('starts a new inactivity deadline when the user acts', () => {
    const { controller } = setup({ persistent: false });
    vi.advanceTimersByTime(55_000);
    controller.activity();
    vi.advanceTimersByTime(59_999);
    expect(controller.snapshot.sleeping).toBe(false);
    vi.advanceTimersByTime(1);
    expect(controller.snapshot.sleeping).toBe(true);
  });

  it('returns to the ordinary idle cadence after waking and closing the panel', () => {
    const { controller, calls } = setup({ persistent: false });
    vi.advanceTimersByTime(60_000);
    expect(controller.snapshot.sleeping).toBe(true);
    controller.open();
    controller.finishAnimation();
    controller.close();
    const previous = calls('idle').length;
    vi.advanceTimersByTime(15_999);
    expect(calls('idle')).toHaveLength(previous);
    vi.advanceTimersByTime(1);
    expect(calls('idle')).toHaveLength(previous + 1);
  });

  it('pauses decorative deadlines during scroll and resumes after 500 ms of quiet', () => {
    const { controller, calls } = setup({ persistent: false, compact: true });
    vi.advanceTimersByTime(23_000);
    controller.activity(true);
    expect(controller.snapshot.state).toBe('closed');
    vi.advanceTimersByTime(300);
    controller.activity(true);
    vi.advanceTimersByTime(499);
    expect(calls('idle')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    vi.advanceTimersByTime(999);
    expect(calls('idle')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls('idle')).toHaveLength(1);
  });

  it('does not animate cart reactions during scrolling or queue them afterwards', () => {
    const { controller, calls } = setup({ persistent: false, compact: true });
    controller.activity(true);
    expect(controller.cart(addition('scroll-add'))).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(calls('happy')).toHaveLength(0);
    expect(controller.cart(addition('scroll-add'))).toBe(false);
  });

  it('never shows a desktop greeting bubble during or within two seconds after scroll', () => {
    const { controller, calls } = setup();
    vi.advanceTimersByTime(4500);
    controller.activity(true);
    vi.advanceTimersByTime(1999);
    expect(calls('wave')).toHaveLength(0);
    expect(controller.snapshot.greetingVisible).toBe(false);
    vi.advanceTimersByTime(1);
    expect(calls('wave')).toHaveLength(1);
    expect(controller.snapshot.greetingVisible).toBe(true);
  });

  it('recovers once after a scroll burst rather than starting a flight on every event', () => {
    const { controller, hooks } = setup({ profile: 'lively' });
    for (let index = 0; index < 100; index++) {
      controller.activity(true);
      vi.advanceTimersByTime(50);
    }
    expect(hooks.recover).not.toHaveBeenCalled();
    expect(controller.isScrolling).toBe(true);
    vi.advanceTimersByTime(449);
    expect(hooks.recover).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hooks.recover).toHaveBeenCalledTimes(1);
    expect(controller.isScrolling).toBe(false);
  });

  it('keeps the calm profile pause for an in-progress finite clip', () => {
    const { controller, hooks } = setup({ persistent: false });
    vi.advanceTimersByTime(16_000);
    expect(controller.snapshot.animation).toBe('idle');
    controller.activity(true);
    expect(controller.snapshot.animation).toBe('static');
    expect(hooks.pause).toHaveBeenCalledTimes(1);
    controller.activity(true);
    expect(hooks.pause).toHaveBeenCalledTimes(1);
  });

  it.each(['idle', 'wave', 'happy'] as const)('lets the current lively %s clip finish during scroll but delays new gestures', (animation) => {
    const { controller, hooks } = setup({ profile: 'lively', persistent: false });
    if (animation === 'idle') vi.advanceTimersByTime(640);
    else if (animation === 'wave') controller.pet();
    else controller.cart(addition('scrolling-current-happy'));
    const trace = completeFiniteActions(controller, hooks);
    const duration = animation === 'idle' ? 1000 : 1500;
    setTimeout(() => controller.finishAnimation(), duration);
    for (let index = 0; index < duration / 100; index++) {
      controller.activity(true);
      vi.advanceTimersByTime(100);
      if (index < duration / 100 - 1) expect(controller.snapshot.animation).toBe(animation);
    }
    expect(controller.snapshot.animation).toBe('static');
    expect(controller.isScrolling).toBe(true);
    expect(hooks.pause).not.toHaveBeenCalled();
    expect(trace).toEqual([]);
    vi.advanceTimersByTime(399);
    expect(trace).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(controller.isScrolling).toBe(false);
    const remainingIdle = animation === 'idle' ? 1720 : 640;
    vi.advanceTimersByTime(remainingIdle - 1);
    expect(trace).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(trace[0]?.state).toBe('idle');
  });

  it.each(['fall', 'parachute'] as const)('preserves a manually dropped %s through scrolling, landing and the new inactivity deadline', (descent) => {
    const { controller, hooks, calls } = setup({ profile: 'lively', persistent: false });
    controller.beginPhysical(true);
    controller.physicalStage(descent);
    setTimeout(() => controller.physicalStage('land'), 700);
    setTimeout(() => controller.endPhysical(), 1200);
    for (let index = 0; index < 12; index++) {
      controller.activity(true);
      vi.advanceTimersByTime(100);
      if (index < 6) expect(controller.snapshot.animation).toBe(descent);
      if (index >= 6 && index < 11) expect(controller.snapshot.animation).toBe('land');
      if (index < 11) expect(controller.interacting).toBe(true);
    }
    expect(controller.interacting).toBe(false);
    expect(controller.snapshot.animation).toBe('static');
    expect(hooks.pause).not.toHaveBeenCalled();
    const trace = completeFiniteActions(controller, hooks);
    vi.advanceTimersByTime(90_399);
    expect(controller.snapshot.sleeping).toBe(false);
    vi.advanceTimersByTime(1);
    expect(controller.snapshot.sleeping).toBe(true);
    expect(calls('sleep')).toHaveLength(1);
    expect(trace.find(({ state }) => state === 'sleep')?.at).toBe(NOW + 91_600);
  });

  it.each(['stroll', 'climb', 'peek', 'wiggle', 'flip'] as const)('keeps an active lively %s physical scene during scrolling and pauses the following automatic deadline', (scene) => {
    const { controller, hooks } = setup({ profile: 'lively', scenes: true, persistent: false });
    controller.perform(scene);
    const animation = controller.snapshot.animation;
    for (let index = 0; index < 10; index++) {
      controller.activity(true);
      vi.advanceTimersByTime(100);
      expect(controller.interacting).toBe(true);
      expect(controller.snapshot.animation).toBe(animation);
    }
    expect(hooks.pause).not.toHaveBeenCalled();
    controller.endPhysical();
    vi.advanceTimersByTime(399);
    expect(hooks.motion).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(controller.isScrolling).toBe(false);
    vi.advanceTimersByTime(6599);
    expect(hooks.motion).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(hooks.motion).toHaveBeenCalledTimes(2);
  });

  it('returns a sleeping lively character to neutral on scroll instead of leaving its sleep clip held', () => {
    const { controller, hooks } = setup({ profile: 'lively', persistent: false });
    completeFiniteActions(controller, hooks);
    vi.advanceTimersByTime(90_000);
    expect(controller.snapshot.sleeping).toBe(true);
    expect(controller.snapshot.animation).toBe('sleep');
    hooks.animate.mockClear();
    controller.activity(true);
    expect(controller.snapshot.sleeping).toBe(false);
    expect(controller.snapshot.animation).toBe('static');
    expect(hooks.animate).toHaveBeenCalledExactlyOnceWith('static', 1);
    expect(hooks.pause).not.toHaveBeenCalled();
  });

  it.each([{ reduced: true }, { preferences: { motion: 'off' as const } }])('keeps manual and system reduced motion static while menu access works', (options) => {
    const { controller, hooks } = setup(options);
    vi.advanceTimersByTime(120_000);
    expect(hooks.animate.mock.calls.every(([animation]) => animation === 'static')).toBe(true);
    expect(controller.cart(addition('reduced'))).toBe(false);
    expect(controller.open()).toBe(true);
    expect(controller.snapshot.state).toBe('open');
  });
});

describe('confirmed cart additions', () => {
  it.each([200, 201, 256, 257])('shares the event validator ID limit for a %i-character confirmation', (length) => {
    const { controller, calls } = setup({ persistent: false });
    const event = addition('a'.repeat(length));
    const accepted = length <= 256;
    expect(validateShopEvent(event)).toBe(accepted);
    expect(controller.cart(event)).toBe(accepted);
    expect(controller.cart(event)).toBe(false);
    expect(calls('happy')).toHaveLength(accepted ? 1 : 0);
  });

  it('deduplicates event IDs and reacts at most once per five seconds without inventing cart totals', () => {
    const { controller, calls } = setup({ persistent: false });
    expect(controller.cart(addition('one'))).toBe(true);
    expect(controller.snapshot.context?.cartCount).toBeNull();
    vi.advanceTimersByTime(4999);
    expect(controller.cart(addition('two'))).toBe(false);
    vi.advanceTimersByTime(1);
    expect(controller.cart(addition('one'))).toBe(false);
    expect(controller.cart(addition('two'))).toBe(false);
    controller.context(context({ revision: 1, cartCount: 8 }));
    expect(controller.cart(addition('three', { quantity: 5 }))).toBe(true);
    expect(controller.snapshot.context?.cartCount).toBe(8);
    expect(calls('happy')).toHaveLength(2);
  });

  it('drops stale/future and malformed confirmation events', () => {
    const { controller, calls } = setup({ persistent: false });
    expect(controller.cart(addition('stale', { occurredAt: NOW - 5001 }))).toBe(false);
    expect(controller.cart(addition('future', { occurredAt: NOW + 1001 }))).toBe(false);
    expect(controller.cart(addition('zero', { quantity: 0 }))).toBe(false);
    expect(controller.cart(addition('fraction', { quantity: 1.5 }))).toBe(false);
    expect(controller.cart(addition('invalid-time', { occurredAt: NaN }))).toBe(false);
    expect(controller.cart(addition(''))).toBe(false);
    expect(calls('happy')).toHaveLength(0);
    expect(controller.cart(addition('fresh', { occurredAt: NOW - 5000 }))).toBe(true);
  });

  it('retains only the latest 100 IDs, bounding memory without delayed reactions', () => {
    const { controller, calls } = setup({ persistent: false });
    controller.open();
    for (let id = 0; id < 101; id += 1) expect(controller.cart(addition(`operation-${id}`))).toBe(false);
    controller.close();
    expect(controller.cart(addition('operation-1'))).toBe(false);
    expect(controller.cart(addition('operation-0'))).toBe(true);
    expect(calls('happy')).toHaveLength(1);
  });
});

describe('lively companion profile', () => {
  it.each([false, true])('keeps the first idle quiet and autonomous waves at least twelve seconds apart, compact=%s', (compact) => {
    const { controller, hooks, calls } = setup({ profile: 'lively', compact, persistent: false, random: () => 0 });
    const trace = completeFiniteActions(controller, hooks);
    vi.advanceTimersByTime(399);
    expect(calls('idle')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls('idle')).toHaveLength(1);
    vi.advanceTimersByTime(11599);
    expect(calls('wave')).toHaveLength(0);
    vi.advanceTimersByTime(22501);
    const waves = trace.filter(({ state }) => state === 'wave');
    expect(waves.length).toBeGreaterThanOrEqual(2);
    expect(waves[0]!.at - NOW).toBeGreaterThanOrEqual(12000);
    for (let index = 1; index < waves.length; index++) expect(waves[index]!.at - waves[index - 1]!.at).toBeGreaterThanOrEqual(12000);
    expect(calls('wink')).toHaveLength(0);
    expect(controller.snapshot.state).toBe('closed');
  });

  it('does not wave automatically when the eligible thirty-percent choice is not selected; petting remains immediate', () => {
    const { controller, hooks, calls } = setup({ profile: 'lively', persistent: false, random: () => .8 });
    completeFiniteActions(controller, hooks);
    vi.advanceTimersByTime(34000);
    expect(calls('wave')).toHaveLength(0);
    expect(calls('idle').length).toBeGreaterThan(5);
    controller.pet();
    expect(calls('wave')).toHaveLength(1);
    expect(controller.snapshot.animation).toBe('wave');
  });

  it.each(QUIET_GESTURES)('occasionally substitutes finite %s after the first idle without changing petting', (gesture) => {
    const actualBetween = PersonalityVariation.prototype.between;
    vi.spyOn(PersonalityVariation.prototype, 'chance').mockImplementation((probability) => probability === .2);
    vi.spyOn(PersonalityVariation.prototype, 'between').mockImplementation(function (this: PersonalityVariation, minimum, maximum) {
      return minimum === 0 && maximum === QUIET_GESTURES.length - 1 ? QUIET_GESTURES.indexOf(gesture) : actualBetween.call(this, minimum, maximum);
    });
    const { controller, hooks, calls } = setup({ profile: 'lively', persistent: false });
    completeFiniteActions(controller, hooks);
    vi.advanceTimersByTime(640);
    expect(calls('idle')).toHaveLength(1);
    expect(calls(gesture)).toHaveLength(0);
    vi.advanceTimersByTime(2720);
    expect(controller.snapshot.animation).toBe(gesture);
    expect(calls(gesture)).toHaveLength(1);
    expect(controller.snapshot.state).toBe('closed');
    vi.advanceTimersByTime(gesture === 'guitar' ? 9500 : gesture === 'sit' ? 4000 : gesture === 'stretch' ? 2500 : gesture === 'nose' ? 1000 : 1500);
    expect(controller.snapshot.animation).toBe('static');
    vi.advanceTimersByTime(1720);
    expect(controller.snapshot.animation).toBe('idle');
    expect(calls('wave')).toHaveLength(0);
    controller.pet();
    expect(controller.snapshot.animation).toBe('wave');
    expect(REPLIES.pet).toContain(controller.snapshot.greetingText);
    controller.destroy();
    vi.advanceTimersByTime(1500);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('finishes rare quiet clips before physical scenes and retains the original sleep deadline', () => {
    vi.spyOn(PersonalityVariation.prototype, 'chance').mockImplementation((probability) => probability === .2);
    const { controller, hooks, calls } = setup({ profile: 'lively', scenes: true, persistent: false });
    completeFiniteActions(controller, hooks);
    vi.advanceTimersByTime(90_000);
    expect(QUIET_GESTURES.some((gesture) => calls(gesture).length > 0)).toBe(true);
    expect(new Set(hooks.motion!.mock.calls.slice(0, 4).map(([scene]) => scene))).toEqual(new Set(['stroll', 'flip', 'peek', 'wiggle']));
    expect(controller.snapshot.sleeping).toBe(true);
    expect(calls('sleep')).toHaveLength(1);
  });

  it('finishes four seconds of sitting before draining one expired automatic scene', () => {
    vi.spyOn(PersonalityVariation.prototype, 'chance').mockImplementation((probability) => probability === .2);
    const actualBetween = PersonalityVariation.prototype.between;
    vi.spyOn(PersonalityVariation.prototype, 'between').mockImplementation(function (this: PersonalityVariation, minimum, maximum) {
      return minimum === 0 && maximum === QUIET_GESTURES.length - 1 ? 0 : actualBetween.call(this, minimum, maximum);
    });
    const { controller, hooks, calls } = setup({ profile: 'lively', scenes: true, persistent: false });
    completeFiniteActions(controller, hooks);
    vi.advanceTimersByTime(3360);
    expect(controller.snapshot.animation).toBe('sit');
    expect(calls('sit')).toHaveLength(1);
    vi.advanceTimersByTime(3999);
    expect(controller.snapshot.animation).toBe('sit');
    expect(hooks.motion).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hooks.motion).toHaveBeenCalledExactlyOnceWith('peek');
    expect(controller.snapshot.animation).toBe('walk');
  });

  it('lets a sitting clip end before a due sleep, without losing the sleep deadline or starting another gesture', () => {
    vi.spyOn(PersonalityVariation.prototype, 'chance').mockImplementation((probability) => probability === .2);
    const actualBetween = PersonalityVariation.prototype.between;
    vi.spyOn(PersonalityVariation.prototype, 'between').mockImplementation(function (this: PersonalityVariation, minimum, maximum) {
      return minimum === 0 && maximum === QUIET_GESTURES.length - 1 ? 0 : actualBetween.call(this, minimum, maximum);
    });
    const { controller, hooks, calls } = setup({ profile: 'lively', persistent: false, sleepAfterMs: 4000 });
    const trace = completeFiniteActions(controller, hooks);
    vi.advanceTimersByTime(4000);
    expect(controller.snapshot.animation).toBe('sit');
    expect(controller.snapshot.sleeping).toBe(false);
    vi.advanceTimersByTime(3359);
    expect(calls('sleep')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(controller.snapshot.sleeping).toBe(true);
    expect(trace.filter(({ state }) => state === 'sleep')).toEqual([{ state: 'sleep', at: NOW + 7360 }]);
    const gestures = calls('sit').length + calls('idle').length;
    vi.advanceTimersByTime(10000);
    expect(calls('sit').length + calls('idle').length).toBe(gestures);
    expect(calls('sleep')).toHaveLength(1);
  });

  it('keeps winks at least thirty-five seconds apart even when every eligible random choice selects one', () => {
    const { controller, hooks } = setup({ profile: 'lively', persistent: false, random: () => 0 });
    const trace = completeFiniteActions(controller, hooks);
    vi.advanceTimersByTime(90_000);
    const winks = trace.filter(({ state }) => state === 'wink');
    expect(winks.length).toBeGreaterThanOrEqual(2);
    expect(winks[0]!.at - NOW).toBeGreaterThanOrEqual(35_000);
    for (let index = 1; index < winks.length; index++) {
      expect(winks[index]!.at - winks[index - 1]!.at).toBeGreaterThanOrEqual(35_000);
    }
    expect(trace.filter(({ state }) => state === 'wave').length).toBeGreaterThanOrEqual(2);
    vi.advanceTimersByTime(4000);
    expect(controller.snapshot.sleeping).toBe(true);
  });

  it('keeps sparse selected waves finite and the original sleep deadline unchanged', () => {
    vi.spyOn(PersonalityVariation.prototype, 'chance').mockImplementation((probability) => probability === .3);
    const { controller, hooks, calls } = setup({ profile: 'lively', persistent: false });
    const trace = completeFiniteActions(controller, hooks);
    vi.advanceTimersByTime(89_999);
    expect(controller.snapshot.sleeping).toBe(false);
    expect(calls('wave').length).toBeGreaterThanOrEqual(3);
    expect(calls('wave').length).toBeLessThanOrEqual(6);
    expect(calls('wink')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(controller.snapshot.sleeping).toBe(true);
    expect(trace.filter(({ state }) => state === 'sleep')).toEqual([{ state: 'sleep', at: NOW + 90_000 }]);
    const gestureCount = trace.length;
    vi.advanceTimersByTime(10_000);
    expect(trace).toHaveLength(gestureCount);
  });

  it('introduces itself after 1.5 active seconds when saved settings are allowed', () => {
    const { hooks, calls, controller } = setup({ profile: 'lively' });
    vi.advanceTimersByTime(1499);
    expect(hooks.greeted).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hooks.greeted).toHaveBeenCalledTimes(1);
    expect(calls('wave')).toHaveLength(1);
    expect(controller.snapshot.state).toBe('closed');
  });

  it('occasionally attracts attention later with a varied short speech, retaining the closed interface', () => {
    const { controller, calls } = setup({ profile: 'lively', persistent: false });
    vi.advanceTimersByTime(44_999);
    expect(calls('wave')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls('wave')).toHaveLength(1);
    expect(controller.snapshot.greetingVisible).toBe(true);
    expect(REPLIES.welcome).toContain(controller.snapshot.greetingText);
    expect(controller.snapshot.state).toBe('closed');
    vi.advanceTimersByTime(5000);
    expect(controller.snapshot.greetingVisible).toBe(false);
  });

  it('waves when the pointer approaches without winking, opening navigation or making a success claim', () => {
    const { controller, calls } = setup({ profile: 'lively', persistent: false });
    controller.react('pointer:near');
    expect(calls('wave')).toHaveLength(1);
    expect(calls('wink')).toHaveLength(0);
    expect(calls('happy')).toHaveLength(0);
    expect(controller.snapshot.state).toBe('closed');
    expect(controller.snapshot.greetingVisible).toBe(false);
  });

  it('shows curiosity at a product and ignores product-leave events', () => {
    const { controller, calls, hooks } = setup({ profile: 'lively', persistent: false });
    hooks.animate.mockClear();
    controller.react('product:leave');
    expect(hooks.animate).not.toHaveBeenCalled();
    controller.react('product:enter');
    expect(calls('idle')).toHaveLength(1);
    expect(REPLIES.interest).toContain(controller.snapshot.greetingText);
    expect(controller.snapshot.greetingVisible).toBe(true);
    expect(controller.snapshot.state).toBe('closed');
    vi.advanceTimersByTime(4000);
    expect(controller.snapshot.greetingVisible).toBe(false);
  });

  it('reacts sympathetically to cart errors without happy animation or changed cart totals', () => {
    const { controller, calls, hooks } = setup({ profile: 'lively', persistent: false, context: context({ cartCount: 4 }) });
    controller.react('cart:error');
    expect(calls('happy')).toHaveLength(0);
    expect(calls('idle')).toHaveLength(0);
    expect(hooks.pose).toHaveBeenCalledWith('sympathetic');
    expect(controller.snapshot.pose).toBe('sympathetic');
    expect(REPLIES.error).toContain(controller.snapshot.greetingText);
    expect(controller.snapshot.context?.cartCount).toBe(4);
  });

  it('waits twelve to fifteen seconds before another pointer greeting while clicks remain immediate', () => {
    const { controller, calls } = setup({ profile: 'lively', persistent: false });
    controller.react('pointer:near');
    controller.finishAnimation();
    vi.advanceTimersByTime(13199);
    controller.react('pointer:near');
    expect(calls('wave')).toHaveLength(1);
    vi.advanceTimersByTime(1);
    controller.react('pointer:near');
    expect(calls('wave')).toHaveLength(2);
    controller.pet();
    expect(calls('wave')).toHaveLength(3);
    expect(calls('wink')).toHaveLength(0);
  });

  it('responds to petting with speech and cancels pending attention while keeping navigation closed', () => {
    const { controller, calls, hooks } = setup({ profile: 'lively' });
    controller.pet();
    expect(controller.snapshot.state).toBe('closed');
    expect(controller.snapshot.greetingVisible).toBe(true);
    expect(REPLIES.pet).toContain(controller.snapshot.greetingText);
    expect(calls('wave')).toHaveLength(1);
    controller.finishAnimation();
    vi.advanceTimersByTime(18_000);
    expect(calls('wave')).toHaveLength(1);
    expect(hooks.greeted).not.toHaveBeenCalled();
    expect(controller.snapshot.greetingVisible).toBe(false);
  });

  it('wakes a sleeping character on the first pet without opening a shop panel', () => {
    const { controller, calls, hooks } = setup({ profile: 'lively', persistent: false });
    completeFiniteActions(controller, hooks);
    vi.advanceTimersByTime(90_000);
    expect(controller.snapshot.sleeping).toBe(true);
    controller.pet();
    expect(controller.snapshot.sleeping).toBe(false);
    expect(calls('wake')).toHaveLength(1);
    expect(controller.snapshot.state).toBe('closed');
    expect(REPLIES.wake).toContain(controller.snapshot.greetingText);
  });

  it('honors reduced motion for automatic and pointer reactions while explicit petting still gives speech', () => {
    const { controller, hooks } = setup({ profile: 'lively', reduced: true });
    vi.advanceTimersByTime(90_000);
    controller.react('pointer:near');
    controller.react('product:enter');
    expect(hooks.animate.mock.calls.every(([animation]) => animation === 'static')).toBe(true);
    controller.pet();
    expect(controller.snapshot.greetingVisible).toBe(true);
    expect(REPLIES.pet).toContain(controller.snapshot.greetingText);
    expect(controller.snapshot.state).toBe('closed');
    expect(hooks.animate.mock.calls.every(([animation]) => animation === 'static')).toBe(true);
  });

  it('drops personality reactions during active scrolling rather than restarting decorative motion', () => {
    const { controller, calls } = setup({ profile: 'lively', persistent: false });
    controller.activity(true);
    controller.react('pointer:near');
    controller.react('product:enter');
    expect(calls('wave')).toHaveLength(0);
    expect(calls('idle')).toHaveLength(0);
    vi.advanceTimersByTime(501);
    expect(calls('wave')).toHaveLength(0);
  });
});

describe('physical companion scenes', () => {
  it.each([false, true])('starts a short first gesture after arrival ends, compact=%s', (compact) => {
    const { controller, hooks, calls } = setup({ profile: 'lively', scenes: true, compact, persistent: false });
    controller.beginPhysical();
    controller.physicalStage('walk');
    vi.advanceTimersByTime(6000);
    expect(hooks.motion).not.toHaveBeenCalled();
    expect(calls('idle')).toHaveLength(0);
    controller.endPhysical();
    vi.advanceTimersByTime(639);
    expect(calls('idle')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls('idle')).toHaveLength(1);
    vi.advanceTimersByTime(3159);
    expect(hooks.motion).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hooks.motion).toHaveBeenCalledExactlyOnceWith('peek');
  });

  it('does not treat cancellation as an arrival or scene completion', () => {
    const { controller, hooks, calls } = setup({ profile: 'lively', scenes: true, persistent: false });
    controller.beginPhysical();
    controller.physicalStage('walk');
    vi.advanceTimersByTime(6000);
    controller.endPhysical(false);
    expect(controller.snapshot.animation).toBe('walk');
    vi.advanceTimersByTime(5000);
    expect(calls('idle')).toHaveLength(0);
    expect(hooks.motion).not.toHaveBeenCalled();
    controller.finishAnimation();
    vi.advanceTimersByTime(1000);
    expect(calls('idle')).toHaveLength(0);
    vi.advanceTimersByTime(720);
    expect(calls('idle')).toHaveLength(1);
  });

  it('chooses a first scene after a variable delay, then takes the next item from the shuffled deck', () => {
    const { controller, hooks } = setup({ profile: 'lively', scenes: true, persistent: false });
    completeFiniteActions(controller, hooks);
    vi.advanceTimersByTime(3799);
    expect(hooks.motion).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hooks.motion).toHaveBeenCalledWith('peek');
    expect(hooks.animate).toHaveBeenCalledWith('walk', 3);
    expect(controller.snapshot.state).toBe('closed');
    vi.advanceTimersByTime(1600);
    vi.advanceTimersByTime(6599);
    expect(hooks.motion).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(hooks.motion).toHaveBeenCalledTimes(2);
    expect(hooks.motion).toHaveBeenLastCalledWith('wiggle');
    expect(hooks.animate).toHaveBeenCalledWith('wiggle', 1);
  });

  it('shows all four autonomous scenes before ninety seconds without postponing sleep', () => {
    const { controller, hooks, calls } = setup({ profile: 'lively', scenes: true, persistent: false });
    completeFiniteActions(controller, hooks);
    vi.advanceTimersByTime(89_999);
    expect(new Set(hooks.motion?.mock.calls.slice(0, 4).map(([scene]) => scene))).toEqual(new Set(['stroll', 'flip', 'peek', 'wiggle']));
    const total = hooks.motion?.mock.calls.length;
    expect(controller.snapshot.sleeping).toBe(false);
    vi.advanceTimersByTime(1);
    expect(controller.snapshot.sleeping).toBe(true);
    expect(calls('sleep')).toHaveLength(1);
    vi.advanceTimersByTime(60_000);
    expect(hooks.motion).toHaveBeenCalledTimes(total!);
    expect(controller.snapshot.sleeping).toBe(true);
  });

  it('keeps a physical scene deadline while an autonomous micro wave is playing', () => {
    const actualBetween = PersonalityVariation.prototype.between;
    vi.spyOn(PersonalityVariation.prototype, 'between').mockImplementation(function (this: PersonalityVariation, minimum, maximum) {
      return minimum === 3000 && maximum === 5000 ? 17400 : actualBetween.call(this, minimum, maximum);
    });
    vi.spyOn(PersonalityVariation.prototype, 'chance').mockImplementation((probability) => probability === .3);
    const { controller, hooks, calls } = setup({ profile: 'lively', scenes: true, persistent: false });
    completeFiniteActions(controller, hooks);
    vi.advanceTimersByTime(17400 - 1);
    expect(controller.snapshot.animation).toBe('wave');
    expect(calls('wave')).toHaveLength(1);
    expect(hooks.motion).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hooks.motion).toHaveBeenCalledExactlyOnceWith('peek');
    expect(hooks.animate).toHaveBeenCalledWith('walk', 3);
  });

  it.each(['wave', 'happy', 'held pose'] as const)('does not interrupt %s for an autonomous scene', (activity) => {
    const { controller, hooks } = setup({ profile: 'lively', scenes: true, persistent: false });
    vi.advanceTimersByTime(3500);
    if (activity === 'wave') controller.pet();
    else if (activity === 'happy') controller.cart(addition('protected-success'));
    else controller.react('product:enter');
    vi.advanceTimersByTime(300);
    expect(hooks.motion).not.toHaveBeenCalled();
    if (activity === 'held pose') expect(controller.snapshot.pose).toBe('curious');
    else expect(controller.snapshot.animation).toBe(activity);
  });

  it.each(['wave', 'happy'] as const)('retains one expired scene until protected %s finishes', (animation) => {
    const { controller, hooks } = setup({ profile: 'lively', scenes: true, persistent: false });
    vi.advanceTimersByTime(3500);
    if (animation === 'wave') controller.pet();
    else controller.cart(addition('pending-success'));
    vi.advanceTimersByTime(1500);
    expect(hooks.motion).not.toHaveBeenCalled();
    controller.finishAnimation();
    expect(hooks.motion).toHaveBeenCalledExactlyOnceWith('peek');
    expect(controller.snapshot.animation).toBe('walk');
    controller.finishAnimation();
    expect(controller.snapshot.animation).toBe('walk');
    expect(hooks.motion).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('waits for a held product pose before draining the pending scene, compact=%s', (compact) => {
    const { controller, hooks } = setup({ profile: 'lively', scenes: true, compact, persistent: false });
    vi.advanceTimersByTime(3500);
    controller.react('product:enter');
    vi.advanceTimersByTime(1000);
    controller.finishAnimation();
    vi.advanceTimersByTime(2999);
    expect(controller.snapshot.pose).toBe('curious');
    expect(hooks.motion).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(controller.snapshot.pose).toBeNull();
    expect(hooks.motion).toHaveBeenCalledExactlyOnceWith('peek');
  });

  it('does not insert a pending scene while a synchronous pose cleanup starts a pet reaction', () => {
    const { controller, hooks } = setup({ profile: 'lively', scenes: true, persistent: false });
    hooks.pose.mockImplementation((pose) => { if (!pose) controller.finishAnimation(); });
    vi.advanceTimersByTime(3000);
    controller.react('cart:error');
    vi.advanceTimersByTime(1000);
    controller.pet();
    expect(controller.snapshot.animation).toBe('wave');
    expect(hooks.motion).not.toHaveBeenCalled();
    controller.finishAnimation();
    expect(hooks.motion).toHaveBeenCalledExactlyOnceWith('peek');
  });

  it('measures the next physical pause from actual scene completion', () => {
    const { controller, hooks } = setup({ profile: 'lively', scenes: true, persistent: false });
    controller.perform('stroll');
    vi.advanceTimersByTime(12000);
    expect(hooks.motion).toHaveBeenCalledTimes(1);
    controller.endPhysical();
    vi.advanceTimersByTime(6599);
    expect(hooks.motion).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(hooks.motion).toHaveBeenCalledTimes(2);
  });

  it('does not let automatic physical motion postpone sleep after an expired inactivity deadline', () => {
    const { controller, hooks, calls } = setup({ profile: 'lively', persistent: false });
    completeFiniteActions(controller, hooks);
    vi.advanceTimersByTime(89000);
    controller.beginPhysical();
    controller.physicalStage('fall');
    vi.advanceTimersByTime(3000);
    expect(controller.snapshot.sleeping).toBe(false);
    controller.endPhysical();
    expect(controller.snapshot.sleeping).toBe(true);
    expect(calls('sleep')).toHaveLength(1);
    expect(controller.snapshot.animation).toBe('sleep');
  });

  it.each(['system reduced', 'settings off'] as const)('drops a pending physical scene when motion is disabled by %s', (source) => {
    const { controller, hooks, preferences } = setup({ profile: 'lively', scenes: true, persistent: false });
    vi.advanceTimersByTime(3500);
    controller.pet();
    vi.advanceTimersByTime(300);
    if (source === 'system reduced') controller.setEnvironment(false, true);
    else controller.setPreferences({ ...preferences, motion: 'off' }, false);
    controller.finishAnimation();
    vi.advanceTimersByTime(20000);
    expect(hooks.motion).not.toHaveBeenCalled();
    if (source === 'system reduced') controller.setEnvironment(false, false);
    else controller.setPreferences(preferences, false);
    expect(hooks.motion).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3799);
    expect(hooks.motion).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hooks.motion).toHaveBeenCalledTimes(1);
  });

  it.each(['system reduced', 'settings off'] as const)('starts a fresh deadline after motion was initially disabled by %s', (source) => {
    const { controller, hooks, preferences } = setup({
      profile: 'lively', scenes: true, persistent: false,
      ...(source === 'system reduced' ? { reduced: true } : { preferences: { motion: 'off' } }),
    });
    vi.advanceTimersByTime(20000);
    expect(hooks.motion).not.toHaveBeenCalled();
    if (source === 'system reduced') controller.setEnvironment(false, false);
    else controller.setPreferences({ ...preferences, motion: 'system' }, false);
    expect(hooks.motion).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3799);
    expect(hooks.motion).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hooks.motion).toHaveBeenCalledTimes(1);
  });

  it('clears a pending scene and all deadlines on destroy, including late animation completion', () => {
    const { controller, hooks } = setup({ profile: 'lively', scenes: true, persistent: false });
    vi.advanceTimersByTime(3500);
    controller.pet();
    vi.advanceTimersByTime(300);
    controller.destroy();
    expect(vi.getTimerCount()).toBe(0);
    controller.finishAnimation();
    vi.advanceTimersByTime(120000);
    expect(hooks.motion).not.toHaveBeenCalled();
  });

  it.each([
    ['stroll', 'walk', 4], ['wiggle', 'wiggle', 1], ['peek', 'walk', 3], ['climb', 'climb', 4], ['flip', 'flip', 1],
  ] as const)('combines explicit %s positioning with a finite %s sprite clip', (scene, animation, repetitions) => {
    const { controller, hooks } = setup({ profile: 'lively', scenes: true, persistent: false });
    controller.perform(scene);
    expect(hooks.motion).toHaveBeenCalledWith(scene);
    expect(hooks.animate).toHaveBeenCalledWith(animation, repetitions);
    expect(controller.snapshot.state).toBe('closed');
  });

  it('blocks physical scenes during scrolling, hidden pages and reduced motion', () => {
    const scrolling = setup({ profile: 'lively', scenes: true, persistent: false });
    scrolling.controller.activity(true);
    scrolling.controller.perform('stroll', false);
    expect(scrolling.hooks.motion).not.toHaveBeenCalled();
    expect(scrolling.controller.beginPhysical()).toBe(false);
    const hidden = setup({ profile: 'lively', scenes: true, persistent: false });
    hidden.controller.block('documentHidden', true);
    hidden.controller.perform('climb');
    vi.advanceTimersByTime(60_000);
    expect(hidden.hooks.motion).not.toHaveBeenCalled();
    const reduced = setup({ profile: 'lively', scenes: true, reduced: true, persistent: false });
    reduced.controller.perform('peek');
    vi.advanceTimersByTime(60_000);
    expect(reduced.hooks.motion).not.toHaveBeenCalled();
  });

  it('runs an explicitly selected scene immediately after scrolling and clears the scroll pause', () => {
    const { controller, hooks } = setup({ profile: 'lively', scenes: true, persistent: false });
    controller.activity(true);
    expect(controller.isScrolling).toBe(true);
    controller.perform('stroll');
    expect(controller.isScrolling).toBe(false);
    expect(hooks.motion).toHaveBeenCalledExactlyOnceWith('stroll');
    expect(hooks.animate).toHaveBeenCalledWith('walk', 4);
    vi.advanceTimersByTime(500);
    expect(controller.isScrolling).toBe(false);
    expect(controller.snapshot.animation).toBe('walk');
    expect(hooks.motion).toHaveBeenCalledTimes(1);
  });

  it('marks scrolling before callbacks can try to start a new automatic physical action', () => {
    const { controller, hooks } = setup({ profile: 'lively', scenes: true, persistent: false });
    const attempts: boolean[] = [];
    hooks.change.mockImplementation(() => { attempts.push(controller.beginPhysical()); });
    controller.activity(true);
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts.every((allowed) => !allowed)).toBe(true);
    expect(controller.interacting).toBe(false);
    hooks.change.mockReset();
    vi.advanceTimersByTime(500);
    expect(controller.beginPhysical()).toBe(true);
  });

  it('keeps the current physical action and its scene deadline when the route changes', () => {
    const { controller, hooks } = setup({ profile: 'lively', scenes: true, persistent: false });
    vi.advanceTimersByTime(3400);
    controller.context(context({ revision: 1, pageKey: '/product/one', pageType: 'product' }));
    vi.advanceTimersByTime(400);
    expect(hooks.motion).toHaveBeenCalledExactlyOnceWith('peek');
    controller.beginPhysical();
    controller.physicalStage('walk');
    controller.context(context({ revision: 2, pageKey: '/catalog/new' }));
    expect(controller.interacting).toBe(true);
    expect(controller.snapshot.animation).toBe('walk');
  });

  it('does not interrupt a carried or falling character with pointer, cart, idle or autonomous reactions', () => {
    const { controller, hooks } = setup({ profile: 'lively', scenes: true, persistent: false });
    expect(controller.beginPhysical(true)).toBe(true);
    controller.physicalStage('held');
    hooks.animate.mockClear();
    controller.react('pointer:near');
    controller.react('product:enter');
    expect(controller.cart(addition('while-carried'))).toBe(false);
    vi.advanceTimersByTime(20000);
    expect(hooks.animate).not.toHaveBeenCalled();
    expect(hooks.motion).not.toHaveBeenCalled();
    controller.physicalStage('fall');
    expect(controller.snapshot.animation).toBe('fall');
    controller.endPhysical();
    expect(controller.interacting).toBe(false);
    expect(controller.snapshot.animation).toBe('static');
  });

  it('answers repeated petting differently, with the navigation still closed', () => {
    const { controller } = setup({ profile: 'lively', persistent: false });
    const replies = new Set<string>();
    for (let index = 0; index < REPLIES.pet.length; index++) {
      controller.pet(); replies.add(controller.snapshot.greetingText);
      expect(controller.snapshot.state).toBe('closed');
    }
    expect(replies.size).toBe(REPLIES.pet.length);
  });
});

describe('explicit finite quiet scenes', () => {
  it.each(QUIET_GESTURES)('preserves selected %s and its pending Promise through passive hovers before scroll and after settle', async (scene) => {
    const { controller, hooks } = setup({ profile: 'lively', scenes: true, persistent: false });
    let settled = false;
    const result = controller.performQuiet(scene).then(() => { settled = true; });
    const calls = hooks.animate.mock.calls.length;
    controller.react('product:enter');
    controller.react('pointer:near');
    controller.activity(true);
    vi.advanceTimersByTime(500);
    expect(controller.isScrolling).toBe(false);
    controller.react('product:enter');
    controller.react('pointer:near');
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(controller.snapshot.animation).toBe(scene);
    expect(hooks.animate).toHaveBeenCalledTimes(calls);
    expect(hooks.motion).not.toHaveBeenCalled();
    controller.finishAnimation();
    await result;
  });

  it('still allows a confirmed cart error to interrupt a selected quiet gesture', async () => {
    const { controller } = setup({ profile: 'lively', persistent: false });
    const result = controller.performQuiet('ears');
    controller.react('cart:error');
    await result;
    expect(controller.snapshot.animation).toBe('static');
    expect(controller.snapshot.pose).toBe('sympathetic');
  });

  it.each(QUIET_GESTURES)('waits for actual %s completion rather than a guessed clip duration', async (scene) => {
    const { controller, calls } = setup({ profile: 'lively', persistent: false });
    let settled = false;
    const result = controller.performQuiet(scene).then(() => { settled = true; });
    expect(calls(scene)).toEqual([[scene, 1]]);
    expect(controller.snapshot.state).toBe('closed');
    vi.advanceTimersByTime(6000);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(controller.snapshot.animation).toBe(scene);
    controller.finishAnimation();
    await result;
    expect(settled).toBe(true);
    expect(controller.snapshot.animation).toBe('static');
  });

  it.each(QUIET_GESTURES)('keeps a selected %s running through scroll and completes while automatic motion stays paused', async (scene) => {
    const { controller, hooks, calls } = setup({ profile: 'lively', scenes: true, persistent: false });
    const result = controller.performQuiet(scene);
    for (let event = 0; event < 10; event++) {
      controller.activity(true);
      vi.advanceTimersByTime(100);
      expect(controller.snapshot.animation).toBe(scene);
    }
    expect(calls(scene)).toHaveLength(1);
    expect(hooks.pause).not.toHaveBeenCalled();
    expect(hooks.motion).not.toHaveBeenCalled();
    controller.finishAnimation();
    await result;
    expect(controller.isScrolling).toBe(true);
    expect(controller.snapshot.animation).toBe('static');
    vi.advanceTimersByTime(399);
    expect(hooks.motion).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(controller.isScrolling).toBe(false);
    expect(controller.snapshot.animation).toBe('static');
  });

  it.each(QUIET_GESTURES)('defers one expired automatic physical action until selected %s actually ends', async (scene) => {
    const { controller, hooks } = setup({ profile: 'lively', scenes: true, persistent: false });
    vi.advanceTimersByTime(3500);
    const result = controller.performQuiet(scene);
    vi.advanceTimersByTime(6000);
    expect(hooks.motion).not.toHaveBeenCalled();
    expect(controller.snapshot.animation).toBe(scene);
    controller.finishAnimation();
    await result;
    expect(hooks.motion).toHaveBeenCalledExactlyOnceWith('peek');
    expect(controller.snapshot.animation).toBe('walk');
    controller.finishAnimation();
    expect(hooks.motion).toHaveBeenCalledTimes(1);
  });

  it.each(['pet', 'physical', 'drag', 'hidden', 'off', 'reduced', 'blocked', 'destroy'] as const)(
    'settles a selected quiet scene when cancelled by %s', async (action) => {
      const { controller, preferences } = setup({ profile: 'lively', scenes: true, persistent: false });
      const result = controller.performQuiet('scratch');
      if (action === 'pet') controller.pet();
      else if (action === 'physical') controller.perform('stroll');
      else if (action === 'drag') controller.beginPhysical(true);
      else if (action === 'hidden') controller.setPreferences({ ...preferences, hidden: true }, false);
      else if (action === 'off') controller.setPreferences({ ...preferences, motion: 'off' }, false);
      else if (action === 'reduced') controller.setEnvironment(false, true);
      else if (action === 'blocked') controller.block('dialog', true);
      else controller.destroy();
      await result;
    },
  );

  it('settles a replaced quiet request without completing the new one', async () => {
    const { controller } = setup({ profile: 'lively', persistent: false });
    const previous = controller.performQuiet('sit');
    let currentDone = false;
    const current = controller.performQuiet('nose').then(() => { currentDone = true; });
    await previous;
    expect(currentDone).toBe(false);
    expect(controller.snapshot.animation).toBe('nose');
    controller.finishAnimation();
    await current;
    expect(currentDone).toBe(true);
  });

  it('starts a quiet action after cancelling physical ownership, so its onEnd can complete', async () => {
    const { controller } = setup({ profile: 'lively', scenes: true, persistent: false });
    controller.perform('stroll');
    expect(controller.interacting).toBe(true);
    const result = controller.performQuiet('ears');
    expect(controller.interacting).toBe(false);
    expect(controller.snapshot.animation).toBe('ears');
    controller.finishAnimation();
    await result;
  });

  it.each(['calm', 'off', 'reduced', 'hidden', 'blocked'] as const)(
    'leaves denied %s quiet actions static and immediately settled', async (reason) => {
      const { controller, calls, preferences } = setup({ profile: reason === 'calm' ? 'calm' : 'lively', persistent: false });
      if (reason === 'off') controller.setPreferences({ ...preferences, motion: 'off' }, false);
      if (reason === 'reduced') controller.setEnvironment(false, true);
      if (reason === 'hidden') controller.setPreferences({ ...preferences, hidden: true }, false);
      if (reason === 'blocked') controller.block('dialog', true);
      await controller.performQuiet('nose');
      expect(calls('nose')).toHaveLength(0);
      expect(controller.snapshot.animation).toBe('static');
    },
  );

  it('never repeats the last autonomous quiet scene even with idle clips between quiet choices', () => {
    vi.spyOn(PersonalityVariation.prototype, 'chance').mockImplementation((probability) => probability === .2);
    const { controller, hooks } = setup({ profile: 'lively', persistent: false });
    const trace = completeFiniteActions(controller, hooks);
    vi.advanceTimersByTime(35000);
    const quiet = trace.filter(({ state }) => QUIET_GESTURES.includes(state as typeof QUIET_GESTURES[number]));
    expect(quiet.length).toBeGreaterThanOrEqual(4);
    for (let index = 1; index < quiet.length; index++)
      expect(quiet[index]!.state).not.toBe(quiet[index - 1]!.state);
  });
});
