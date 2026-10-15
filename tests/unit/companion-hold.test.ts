import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenarioController } from '../../src/core/scenarios';
import { PersonalityVariation } from '../../src/core/variation';
import { validateConfig } from '../../src/config/validate';
import configFixture from '../../demo/assistant.config.json';

const controllers: ScenarioController[] = [];
function setup() {
  const validated = validateConfig(configFixture, 'https://shop.example');
  if (!validated.config) throw new Error('Invalid fixture');
  const preferences = { hidden: false, motion: 'system' as const, lastGreetingAt: null };
  const hooks = { change: vi.fn(), animate: vi.fn(), greeted: vi.fn(), motion: vi.fn() };
  const controller = new ScenarioController(validated.config, preferences, hooks,
    new PersonalityVariation({ storage: null, random: () => .4 }));
  controllers.push(controller);
  controller.setPreferences(preferences, false);
  controller.context({ revision: 0, pageKey: '/', pageType: 'home', cartCount: 0,
    ui: { floatingAllowed: true, bottomReservedPx: 0, blockers: [] },
    permissions: { persistentSettings: false, analytics: false } });
  return { controller, hooks, preferences };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T12:00:00Z')); });
afterEach(() => { controllers.splice(0).forEach((controller) => controller.destroy()); vi.clearAllTimers(); vi.useRealTimers(); });

describe('companion interaction hold', () => {
  it.each(['pointer', 'menu'] as const)('keeps automatic actions paused until both holds end, releasing %s first', (first) => {
    const { controller, hooks } = setup();
    vi.advanceTimersByTime(200);
    controller.setPointerHold(true); controller.setInteractionHold(true);
    vi.advanceTimersByTime(12000);
    if (first === 'pointer') controller.setPointerHold(false); else controller.setInteractionHold(false);
    vi.advanceTimersByTime(12000);
    expect(hooks.animate.mock.calls.every(([state]) => state === 'static')).toBe(true);
    expect(hooks.motion).not.toHaveBeenCalled();
    if (first === 'pointer') controller.setInteractionHold(false); else controller.setPointerHold(false);
    vi.advanceTimersByTime(439); expect(controller.snapshot.animation).toBe('static');
    vi.advanceTimersByTime(1); expect(controller.snapshot.animation).toBe('idle');
  });

  it('keeps the current quiet clip running while a press delays automatic and shop reactions', async () => {
    const { controller, hooks } = setup();
    const quiet = controller.performQuiet('guitar');
    controller.setPointerHold(true);
    const calls = hooks.animate.mock.calls.length;
    controller.react('pointer:near'); controller.react('cart:error');
    expect(controller.cart({ type: 'cart:added', id: 'during-press', quantity: 1, occurredAt: Date.now() })).toBe(false);
    vi.advanceTimersByTime(20000);
    expect(controller.snapshot.animation).toBe('guitar');
    expect(hooks.animate).toHaveBeenCalledTimes(calls);
    controller.finishAnimation(); await quiet;
    expect(hooks.motion).not.toHaveBeenCalled();
    controller.setPointerHold(false); vi.advanceTimersByTime(10000);
    expect(hooks.motion).toHaveBeenCalledOnce();
  });

  it('pauses automatic deadlines without hiding the character, then resumes their remaining time', () => {
    const { controller, hooks } = setup();
    vi.advanceTimersByTime(200); controller.setInteractionHold(true);
    vi.advanceTimersByTime(12000);
    expect(controller.snapshot.state).toBe('closed'); expect(controller.available).toBe(true);
    expect(hooks.motion).not.toHaveBeenCalled();
    expect(hooks.animate.mock.calls.some(([state]) => state !== 'static')).toBe(false);
    controller.setInteractionHold(false);
    vi.advanceTimersByTime(438); expect(controller.snapshot.animation).toBe('static');
    vi.advanceTimersByTime(2); expect(controller.snapshot.animation).toBe('idle');
    controller.finishAnimation(); vi.advanceTimersByTime(4000);
    expect(hooks.motion).toHaveBeenCalledOnce();
  });
  it('does not cut a quiet clip on hover and does not start a pending route when that clip ends', async () => {
    const { controller, hooks } = setup(); let finished = false;
    const quiet = controller.performQuiet('nose').then(() => { finished = true; });
    controller.setInteractionHold(true);
    controller.react('pointer:near'); controller.react('product:enter');
    vi.advanceTimersByTime(12000);
    expect(finished).toBe(false); expect(controller.snapshot.animation).toBe('nose');
    controller.finishAnimation(); await quiet;
    expect(finished).toBe(true); expect(controller.snapshot.animation).toBe('static');
    vi.advanceTimersByTime(10000); expect(hooks.motion).not.toHaveBeenCalled();
    controller.setInteractionHold(false); vi.advanceTimersByTime(10000);
    expect(hooks.motion).toHaveBeenCalledOnce();
  });
  it('allows a direct chosen quiet scene immediately even while held, and resolves the replaced quiet promise', async () => {
    const { controller } = setup();
    const first = controller.performQuiet('sit'); controller.setInteractionHold(true);
    let done = false; const selected = controller.performQuiet('nose').then(() => { done = true; });
    await first; expect(controller.snapshot.animation).toBe('nose'); expect(done).toBe(false);
    controller.finishAnimation(); await selected; expect(done).toBe(true);
  });
  it('keeps a held pending route paused throughout explicit quiet and physical choices until the session is closed', async () => {
    const { controller, hooks } = setup();
    const sitting = controller.performQuiet('sit');
    controller.perform('peek', false);
    controller.setInteractionHold(true); controller.finishAnimation(); await sitting;
    expect(hooks.motion).not.toHaveBeenCalled();
    const selected = controller.performQuiet('nose');
    expect(controller.snapshot.animation).toBe('nose'); expect(hooks.motion).not.toHaveBeenCalled();
    controller.finishAnimation(); await selected;
    expect(controller.interactionOnHold).toBe(true); expect(hooks.motion).not.toHaveBeenCalled();
    controller.perform('flip'); expect(hooks.motion).toHaveBeenCalledExactlyOnceWith('flip');
    expect(controller.interactionOnHold).toBe(true); controller.endPhysical();
    vi.advanceTimersByTime(20000); expect(hooks.motion).toHaveBeenCalledOnce();
    for (const scene of ['sit', 'scratch', 'ears', 'stretch', 'nose'] as const) {
      const quiet = controller.performQuiet(scene); controller.finishAnimation(); await quiet;
      expect(controller.interactionOnHold).toBe(true);
    }
    expect(hooks.motion).toHaveBeenCalledOnce();
    controller.setInteractionHold(false); vi.advanceTimersByTime(10000);
    expect(hooks.motion).toHaveBeenCalledTimes(2);
  });
  it('gives held eye direction priority over an idle curiosity pose only after the finite clip ends', () => {
    const { controller, hooks } = setup(); controller.react('product:enter');
    expect(controller.snapshot.pose).toBe('curious'); expect(controller.snapshot.animation).toBe('idle');
    controller.setInteractionHold(true); const played = hooks.animate.mock.calls.length;
    controller.clearPoseForLook(); expect(controller.snapshot.pose).toBe('curious');
    controller.finishAnimation(); controller.clearPoseForLook();
    expect(controller.snapshot.pose).toBeNull(); expect(controller.snapshot.animation).toBe('static');
    expect(hooks.animate.mock.calls.length).toBe(played);
    vi.advanceTimersByTime(12000); expect(hooks.motion).not.toHaveBeenCalled();
  });
  it.each(['hidden', 'blocker', 'off', 'reduced', 'destroy'] as const)('clears a hold on %s with no leftover automatic timers', (reason) => {
    const { controller, hooks, preferences } = setup(); controller.setInteractionHold(true);
    if (reason === 'hidden') controller.setPreferences({ ...preferences, hidden: true }, false);
    if (reason === 'blocker') controller.block('shop-modal', true);
    if (reason === 'off') controller.setPreferences({ ...preferences, motion: 'off' }, false);
    if (reason === 'reduced') controller.setEnvironment(false, true);
    if (reason === 'destroy') controller.destroy();
    expect(controller.interactionOnHold).toBe(false);
    vi.advanceTimersByTime(12000); expect(hooks.motion).not.toHaveBeenCalled();
  });
});
