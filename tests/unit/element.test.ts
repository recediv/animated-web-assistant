import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAssistantElement } from '../../src/ui/element';
import { validateConfig } from '../../src/config/validate';
import { PersonalityMotion } from '../../src/positioning/personality';
import type { ScenarioSnapshot } from '../../src/core/scenarios';
import configFixture from '../../demo/assistant.config.json';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('speech visibility and character movement', () => {
  it.each(['security', 'empty', 'short-data', 'no-context', 'context-error', 'no-reader'])(
    'keeps a torso input target when the first hit-region update fails: %s', (failure) => {
      const view = createAssistantElement();
      const path = view.shadow.querySelector('.pika-a-hit-area path')!;
      const fallback = path.getAttribute('d');
      expect(fallback).toBeTruthy();
      const context = { clearRect: vi.fn(), drawImage: vi.fn(),
        ...(failure === 'no-reader' ? {} : { getImageData: vi.fn(() => {
          if (failure === 'empty' || failure === 'short-data') return { data: new Uint8ClampedArray(failure === 'empty' ? 96 * 96 * 4 : 4) };
          throw new DOMException('Blocked', 'SecurityError');
        }) }) };
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
        if (failure === 'context-error') throw new Error('Context unavailable');
        return failure === 'no-context' ? null : context as unknown as CanvasRenderingContext2D;
      });
      expect(() => view.updateHitRegion()).not.toThrow();
      expect(path.getAttribute('d')).toBe(fallback);
      view.destroy();
    },
  );

  it('recovers from an unreadable first frame and keeps its last valid input outline after a later failure', () => {
    const view = createAssistantElement();
    const path = view.shadow.querySelector('.pika-a-hit-area path')!;
    const fallback = path.getAttribute('d');
    const data = new Uint8ClampedArray(96 * 96 * 4);
    for (let y = 43; y < 75; y++) for (let x = 34; x < 62; x++) data[(y * 96 + x) * 4 + 3] = 255;
    const getImageData = vi.fn(() => ({ data })).mockImplementationOnce(() => { throw new DOMException('Blocked', 'SecurityError'); });
    const context = { clearRect: vi.fn(), drawImage: vi.fn(), getImageData };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    view.updateHitRegion(); expect(path.getAttribute('d')).toBe(fallback);
    view.updateHitRegion();
    const outline = path.getAttribute('d');
    expect(outline).toBeTruthy(); expect(outline).not.toBe(fallback);
    getImageData.mockImplementationOnce(() => { throw new Error('Read failed'); });
    view.updateHitRegion(); expect(path.getAttribute('d')).toBe(outline);
    view.destroy();
  });

  it.each([0, 20, 34, 80])('keeps moving feet and dragging inside safe edges with %i reserved pixels', async (reserved) => {
    const viewport = { offsetLeft: 17, offsetTop: 23, width: 390, height: 844 };
    const safe = { left: 24, right: 10, top: 20, bottom: 34 };
    vi.stubGlobal('visualViewport', viewport);
    const view = createAssistantElement();
    document.body.append(view);
    view.setCompact(true);
    const safeProbe = view.shadow.querySelector<HTMLElement>('.pika-a-safe')!;
    safeProbe.style.padding = `${safe.top}px ${safe.right}px ${safe.bottom}px ${safe.left}px`;
    const motion = new PersonalityMotion(view.launcher, vi.fn());
    try {
      const placement = view.position(reserved, 'right');
      motion.updateBase(placement, placement.motionViewport, 64, 'right');
      motion.spawn();
      const floor = viewport.offsetTop + viewport.height - Math.max(safe.bottom, reserved);
      const feet = () => placement.launcherTop + motion.offset.y + 64 * 11 / 12;
      expect(feet()).toBeCloseTo(floor);

      expect(motion.beginDrag()).toBe(true);
      motion.dragTo({ x: -10000, y: -10000 });
      expect(placement.launcherLeft + motion.offset.x).toBe(viewport.offsetLeft + safe.left + 4);
      expect(placement.launcherTop + motion.offset.y).toBe(viewport.offsetTop + safe.top + 4);
      motion.dragTo({ x: 10000, y: -10000 });
      expect(placement.launcherLeft + motion.offset.x + 64).toBe(viewport.offsetLeft + viewport.width - safe.right - 4);
      await motion.release({ reducedMotion: true });
      expect(feet()).toBeCloseTo(floor);
    } finally {
      motion.destroy();
      view.destroy();
    }
  });

  it('cancels pending stylesheet setup and clears its deadline on destruction', async () => {
    vi.useFakeTimers();
    const view = createAssistantElement();
    const config = validateConfig(configFixture, 'https://shop.example').config!;
    const ready = view.setup(config, {
      toggle: vi.fn(), close: vi.fn(), screen: vi.fn(), navigate: vi.fn(), cart: vi.fn(),
      motion: vi.fn(), hide: vi.fn(), holdGreeting: vi.fn(),
    });
    const stylesheet = view.shadow.querySelector<HTMLLinkElement>('link')!;
    expect(vi.getTimerCount()).toBe(1);
    view.destroy();
    await expect(ready).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(stylesheet.onload).toBe(null);
    expect(stylesheet.onerror).toBe(null);
  });

  it('reuses the prepared poster and hides the whole assistant after a late poster error', async () => {
    const config = validateConfig(configFixture, 'https://shop.example').config!;
    const poster = document.createElement('img');
    poster.src = config.assets.poster;
    const assignSource = vi.spyOn(poster, 'src', 'set');
    const view = createAssistantElement(poster);
    document.body.append(view);
    const graphicsFailed = vi.fn();
    const raf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    const ready = view.setup(config, {
      toggle: vi.fn(), close: vi.fn(), screen: vi.fn(), navigate: vi.fn(), cart: vi.fn(),
      motion: vi.fn(), hide: vi.fn(), holdGreeting: vi.fn(), graphicsFailed,
    });
    view.shadow.querySelector<HTMLLinkElement>('link')!.dispatchEvent(new Event('load'));
    await expect(ready).resolves.toBe(true);
    const snapshot: ScenarioSnapshot = {
      state: 'closed', screen: 'home', animation: 'static', sleeping: false,
      greetingVisible: true, greetingText: 'Hello!', pose: null, context: null,
    };
    const preferences = {
      schemaVersion: 1 as const, hidden: false, motion: 'system' as const, lastGreetingAt: null,
    };
    view.render(snapshot, preferences, false);
    const root = view.shadow.querySelector<HTMLElement>('.pika-a-root')!;
    const greeting = view.shadow.querySelector<HTMLElement>('.pika-a-greeting')!;
    const artwork = [...view.launcher.children];
    const close = vi.fn(() => { view.dialog.open = false; });
    Object.defineProperty(view.dialog, 'close', { configurable: true, value: close });
    view.dialog.open = true;
    expect(view.poster).toBe(poster);
    expect(assignSource).not.toHaveBeenCalled();
    expect(root.hidden).toBe(false);
    expect(view.launcher.hidden).toBe(false);
    expect(greeting.hidden).toBe(false);

    try {
      poster.dispatchEvent(new Event('error'));
      expect(graphicsFailed).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
      expect(view.dialog.open).toBe(false);
      expect(root.hidden).toBe(true);
      expect(view.launcher.hidden).toBe(true);
      expect(greeting.hidden).toBe(true);
      expect([...view.launcher.children]).toEqual(artwork);
      expect(view.shadow.querySelectorAll('img')).toHaveLength(1);
      expect(raf).not.toHaveBeenCalled();

      // A later render/load must not reveal failed art or a replacement launcher.
      view.render(snapshot, preferences, false);
      poster.dispatchEvent(new Event('load'));
      expect(root.hidden).toBe(true);
      expect(assignSource).not.toHaveBeenCalled();
    } finally {
      view.destroy();
    }
    poster.dispatchEvent(new Event('error'));
    expect(graphicsFailed).toHaveBeenCalledTimes(1);
  });

  it('leaves hidden speech alone, then positions new speech at the current actor and viewport', async () => {
    vi.stubGlobal('visualViewport', { offsetLeft: 0, offsetTop: 0, width: 160, height: 150 });
    const view = createAssistantElement();
    document.body.append(view);
    const config = validateConfig(configFixture, 'https://shop.example').config!;
    const ready = view.setup(config, {
      toggle: vi.fn(),
      close: vi.fn(),
      screen: vi.fn(),
      navigate: vi.fn(),
      cart: vi.fn(),
      motion: vi.fn(),
      hide: vi.fn(),
      holdGreeting: vi.fn(),
    });
    view.shadow.querySelector<HTMLLinkElement>('link')!.dispatchEvent(new Event('load'));
    await ready;
    const greeting = view.shadow.querySelector<HTMLElement>('.pika-a-greeting')!;
    Object.defineProperty(greeting, 'offsetHeight', { configurable: true, get: () => 60 });
    const snapshot: ScenarioSnapshot = {
      state: 'closed',
      screen: 'home',
      animation: 'static',
      sleeping: false,
      greetingVisible: true,
      greetingText: 'Hello!',
      pose: null,
      context: null,
    };
    const preferences = {
      schemaVersion: 1 as const,
      hidden: false,
      motion: 'system' as const,
      lastGreetingAt: null,
    };
    try {
      view.render(snapshot, preferences, false);
      view.position(0, 'left');
      view.setMotionOffset({ x: 0, y: 0 });
      expect(greeting.style.visibility).toBe('hidden');

      view.render({ ...snapshot, greetingVisible: false }, preferences, false);
      vi.stubGlobal('visualViewport', { offsetLeft: 40, offsetTop: 80, width: 800, height: 600 });
      view.position(0, 'left');
      const hiddenStyle = greeting.style.cssText;
      const offset = { x: 250, y: -200 };
      view.setMotionOffset(offset);
      expect(greeting.hidden).toBe(true);
      expect(greeting.style.cssText).toBe(hiddenStyle);

      // This is the runtime's render→offset sequence when speech appears again.
      view.render(snapshot, preferences, false);
      view.setMotionOffset(offset);
      expect(greeting.hidden).toBe(false);
      expect(greeting.style.visibility).toBe('');
      expect(greeting.style.cssText).not.toBe(hiddenStyle);
      const transform = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px,/.exec(greeting.style.transform)!;
      const left = parseFloat(greeting.style.left) + Number(transform[1]);
      const top = parseFloat(greeting.style.top) + Number(transform[2]) - greeting.offsetHeight;
      const width = parseFloat(greeting.style.width);
      const actorTop = parseFloat(view.launcher.style.top) + offset.y;
      expect(left).toBeGreaterThanOrEqual(52);
      expect(left + width).toBeLessThanOrEqual(828);
      expect(top).toBeGreaterThanOrEqual(92);
      expect(top + greeting.offsetHeight).toBeLessThanOrEqual(actorTop - 12);
    } finally {
      view.destroy();
    }
  });
});
