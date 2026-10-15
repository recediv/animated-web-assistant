import { test, expect, type Page } from '@playwright/test';
import type { AssistantInstance, ShopContext, ShopEvent } from '../../src/config/types';
import { REPLIES } from '../../src/core/variation';

declare global {
  interface Window {
    pikaDemo: {
      assistant: AssistantInstance;
      adapter: {
        getContext(): ShopContext;
        subscriberCount: number;
        update(patch: unknown): void;
        subscribe(listener: (event: ShopEvent) => void): () => void;
      };
      navigate(href: string): Promise<void>;
      runScenario(name: string): Promise<void>;
      addProduct(id: string, options?: { fail?: boolean; delay?: number }): Promise<void>;
      openDialog(kind: string): void;
      closeDialog(kind: string): void;
      destroy(): Promise<void>;
    };
  }
}

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('anime-shop-assistant .pika-a-launcher')).toBeVisible();
  await page.waitForFunction(() => !!window.pikaDemo.assistant);
  await page.waitForFunction(
    () => !document.querySelector<HTMLElement>('anime-shop-assistant')?.dataset.motion,
  );
}
const character = (page: Page) => page.locator('anime-shop-assistant');
const launcher = (page: Page) => character(page).locator('.pika-a-launcher');
const speech = (page: Page) => character(page).locator('.pika-a-greeting');
async function finishMotion(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !document.querySelector<HTMLElement>('anime-shop-assistant')?.dataset.motion,
    null,
    { timeout: 30000 },
  );
}
async function recordMotion(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('anime-shop-assistant')!;
    const states: string[] = [];
    const geometry = { canopySamples: 0, groundSamples: 0, violations: [] as string[] };
    let frame = 0;
    const sample = (): void => {
      frame = 0;
      const phase = host.dataset.motion;
      const actor = host
        .shadowRoot!.querySelector<HTMLElement>('.pika-a-launcher')!
        .getBoundingClientRect();
      const viewport = window.visualViewport;
      const visible = {
        left: viewport?.offsetLeft ?? 0,
        top: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? window.innerWidth,
        height: viewport?.height ?? window.innerHeight,
      };
      if (phase === 'parachute') geometry.canopySamples++;
      if (phase === 'land' || phase === 'return') {
        geometry.groundSamples++;
        const floor =
          visible.top + visible.height - window.pikaDemo.adapter.getContext().ui.bottomReservedPx;
        if (Math.abs(actor.top + (actor.height * 11) / 12 - floor) > 1)
          geometry.violations.push('visible feet missed the viewport floor');
      }
      const bubble = host.shadowRoot!.querySelector<HTMLElement>('.pika-a-greeting')!;
      if (!bubble.hidden && getComputedStyle(bubble).visibility !== 'hidden') {
        const box = bubble.getBoundingClientRect();
        const canopy = host
          .shadowRoot!.querySelector<SVGElement>('.pika-a-parachute')!
          .getBoundingClientRect();
        const footprint = {
          left: phase === 'parachute' ? Math.min(actor.left, canopy.left) : actor.left,
          top: phase === 'parachute' ? Math.min(actor.top, canopy.top) : actor.top,
          right: phase === 'parachute' ? Math.max(actor.right, canopy.right) : actor.right,
          bottom: phase === 'parachute' ? Math.max(actor.bottom, canopy.bottom) : actor.bottom,
        };
        if (
          box.left < visible.left + 11 ||
          box.top < visible.top + 11 ||
          box.right > visible.left + visible.width - 11 ||
          box.bottom > visible.top + visible.height - 11
        )
          geometry.violations.push('speech escaped the visible viewport');
        if (
          !(
            box.right <= footprint.left - 11 ||
            box.left >= footprint.right + 11 ||
            box.bottom <= footprint.top - 11 ||
            box.top >= footprint.bottom + 11
          )
        )
          geometry.violations.push('speech covered the character or canopy');
      }
      if (phase) frame = requestAnimationFrame(sample);
    };
    Object.defineProperty(window, 'pikaMotionStates', { value: states, configurable: true });
    Object.defineProperty(window, 'pikaMotionGeometry', { value: geometry, configurable: true });
    const observer = new MutationObserver(() => {
      const state = host.dataset.motion ?? '';
      if (state && states.at(-1) !== state) states.push(state);
      if (!frame && state) frame = requestAnimationFrame(sample);
    });
    observer.observe(host, { attributes: true, attributeFilter: ['data-motion'] });
    Object.defineProperty(window, 'pikaMotionObserver', { value: observer, configurable: true });
    Object.defineProperty(window, 'pikaStopGeometry', {
      value: () => {
        if (frame) cancelAnimationFrame(frame);
      },
      configurable: true,
    });
  });
}
async function motionStates(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const testWindow = window as unknown as Window & {
      pikaMotionStates: string[];
      pikaMotionObserver: MutationObserver;
      pikaStopGeometry(): void;
    };
    testWindow.pikaMotionObserver.disconnect();
    testWindow.pikaStopGeometry();
    return testWindow.pikaMotionStates;
  });
}
async function expectMotionGeometry(page: Page): Promise<void> {
  const geometry = await page.evaluate(
    () =>
      (
        window as unknown as Window & {
          pikaMotionGeometry: {
            canopySamples: number;
            groundSamples: number;
            violations: string[];
          };
        }
      ).pikaMotionGeometry,
  );
  expect(geometry.canopySamples, 'real CSS canopy frames were sampled').toBeGreaterThan(2);
  expect(geometry.groundSamples, 'real landing/return frames were sampled').toBeGreaterThan(2);
  expect(geometry.violations).toEqual([]);
}
async function expectInsideViewport(page: Page): Promise<void> {
  const box = await launcher(page).boundingBox();
  const viewport = page.viewportSize()!;
  const reserved = await page.evaluate(
    () => window.pikaDemo.adapter.getContext().ui.bottomReservedPx,
  );
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + (box!.height * 11) / 12).toBeLessThanOrEqual(viewport.height - reserved + 1);
}

test.describe('Lively companion', () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test('animates autonomously and responds to petting without opening the shop menu', async ({ page }) => {
    await ready(page);
    await page.waitForFunction(() => {
      const canvas = document
        .querySelector('anime-shop-assistant')
        ?.shadowRoot?.querySelector('canvas');
      return canvas && !canvas.hidden && Number(canvas.dataset.frame) > 0;
    });
    const before = await page.evaluate(() => history.length);
    await launcher(page).click();
    await expect(speech(page)).toBeVisible();
    await expect(speech(page)).toContainText(/\S/);
    await expect(character(page).locator('dialog')).not.toHaveAttribute('open');
    expect(await page.evaluate(() => history.length)).toBe(before);
    await expect(character(page).locator('input,textarea')).toHaveCount(0);
  });

  test('changes poses after arrival and keeps moving during scroll', async ({
    page,
  }) => {
    test.setTimeout(45000);
    await ready(page);
    const arrivedAt = await page.evaluate(() => performance.now());
    const historyBefore = await page.evaluate(() => history.length);
    await expect(character(page)).toHaveAttribute('data-animation', 'idle', {
      timeout: 2500,
    });
    const microClip = await character(page).getAttribute('data-animation');
    const firstFrame = await character(page).locator('canvas').getAttribute('data-frame');
    await expect(character(page).locator('canvas')).not.toHaveAttribute('data-frame', firstFrame!, {
      timeout: 2000,
    });
    await expect(character(page)).toHaveAttribute('data-animation', 'static', { timeout: 3000 });
    await expect(character(page)).toHaveAttribute('data-motion', /stroll|climb|peek|wiggle|flip/, {
      timeout: 15000,
    });
    expect((await page.evaluate(() => performance.now())) - arrivedAt).toBeLessThanOrEqual(15000);
    expect(await character(page).getAttribute('data-animation')).not.toBe(microClip);
    // Use a walk to check both position and frame changes during scroll.
    await finishMotion(page);
    await page.evaluate(() => {
      void window.pikaDemo.assistant.perform?.('stroll');
    });
    await expect(character(page)).toHaveAttribute('data-motion', 'stroll');
    await page.waitForTimeout(250);
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(60);
    const movingPosition = await launcher(page).evaluate((element) => element.style.transform);
    const movingFrame = await character(page).locator('canvas').getAttribute('data-frame');
    await page.waitForTimeout(200);
    expect(await launcher(page).evaluate((element) => element.style.transform)).not.toBe(
      movingPosition,
    );
    expect(await character(page).locator('canvas').getAttribute('data-frame')).not.toBe(
      movingFrame,
    );
    await finishMotion(page);
    await expectInsideViewport(page);
    expect(await page.evaluate(() => history.length)).toBe(historyBefore);
    expect(await page.evaluate(() => window.pikaDemo.adapter.getContext().cartCount)).toBe(0);
    await expect(character(page).locator('dialog')).not.toHaveAttribute('open');
  });

  test('looks up only while choosing a scene and resets on closing the menu', async ({ page }) => {
    await page.addInitScript(() => { Math.random = () => .5; });
    await ready(page);
    await page.evaluate(async () => {
      await window.pikaDemo.assistant.setMotion?.('off');
      await window.pikaDemo.assistant.setMotion?.('system');
      window.pikaDemo.assistant.setInteractionHold?.(true);
    });
    const box = (await launcher(page).boundingBox())!;
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const canvas = character(page).locator('canvas');
    const palette = page.locator('.companion-skills');
    const manifest = await (await page.request.get('/assistant/1.0.0/atlas.json')).json();
    for (const sign of [-1, 1]) {
      await page.mouse.move(center.x + sign * box.width * .85, center.y);
      await page.waitForTimeout(40);
      await expect(palette).toBeHidden();
      await expect(canvas).toHaveAttribute('data-frame', String(manifest.neutralFrame));
    }
    await page.mouse.move(center.x, box.y + box.height * .65);
    await expect(palette).toBeVisible();
    await expect(canvas).toHaveAttribute('data-frame', String(manifest.poses.up));
    for (const index of [0, 3, 6]) {
      const button = (await palette.locator('button').nth(index).boundingBox())!;
      const point = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
      await page.mouse.move(point.x, point.y);
      const dx = point.x - center.x, dy = Math.min(point.y - center.y, -box.height / 2);
      const pose = Math.abs(dx) > Math.abs(dy) * .35 ? (dx < 0 ? 'up-left' : 'up-right') : 'up';
      await expect(canvas).toHaveAttribute('data-frame', String(manifest.poses[pose]));
    }
    await page.mouse.move(0, 0);
    await expect(palette).toBeHidden();
    await expect(canvas).toHaveAttribute('data-frame', String(manifest.neutralFrame));
    await page.mouse.move(center.x - box.width * .85, center.y);
    await expect(palette).toBeHidden();
    await page.waitForTimeout(100);
    await expect(canvas).toHaveAttribute('data-frame', String(manifest.neutralFrame));
  });

  test('reacts to product hover and a failed cart update', async ({ page }) => {
    await ready(page);
    const card = page.locator('.product-card').first();
    await card.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    // Let hover-induced scrolling settle before emitting product entry.
    await page.waitForTimeout(550);
    await finishMotion(page);
    await page.evaluate(async () => {
      await window.pikaDemo.assistant.setMotion?.('off');
      await window.pikaDemo.assistant.setMotion?.('system');
    });
    await card.hover();
    const manifest = await (await page.request.get('/assistant/1.0.0/atlas.json')).json();
    await expect(character(page).locator('canvas')).toHaveAttribute(
      'data-frame',
      String(manifest.poses.curious),
    );
    const before = await page.evaluate(() => window.pikaDemo.adapter.getContext().cartCount);
    await page.evaluate(() =>
      window.pikaDemo.addProduct('electric-sun', { fail: true, delay: 20 }),
    );
    expect(REPLIES.error).toContain(await speech(page).innerText());
    expect(await page.evaluate(() => window.pikaDemo.adapter.getContext().cartCount)).toBe(before);
  });

  test('celebrates a confirmed cart update and ignores duplicate events', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => window.pikaDemo.addProduct('electric-sun', { delay: 20 }));
    await expect(speech(page)).toBeVisible();
    await expect(speech(page)).toContainText(/\S/);
    await expect(character(page)).toHaveAttribute('data-animation', 'happy');
    await page.evaluate(() => window.pikaDemo.runScenario('duplicate'));
    expect(await page.evaluate(() => window.pikaDemo.adapter.getContext().cartCount)).toBe(1);
  });

  test('yields the page to independent blockers and payment', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => window.pikaDemo.runScenario('blockers'));
    await expect(launcher(page)).toBeHidden();
    await page.evaluate(() => window.pikaDemo.runScenario('unblock-one'));
    await expect(launcher(page)).toBeHidden();
    await page.evaluate(() => window.pikaDemo.runScenario('unblock-all'));
    await expect(launcher(page)).toBeVisible();
    await page.evaluate(() => window.pikaDemo.navigate('/payment'));
    await expect(launcher(page)).toBeHidden();
    await expect(page.locator('[data-restore]').first()).toBeHidden();
    expect(
      await page.evaluate(() =>
        document.documentElement.classList.contains('anime-assistant-scroll-locked'),
      ),
    ).toBe(false);
  });

  test('stays visible at checkout while the cart and form remain usable', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => window.pikaDemo.addProduct('electric-sun', { delay: 20 }));
    await page.evaluate(() => window.pikaDemo.navigate('/checkout'));
    await expect(launcher(page)).toBeVisible();
    await expect(page.locator('[data-restore]').first()).toBeVisible();
    expect(await page.evaluate(() => window.pikaDemo.adapter.getContext().cartCount)).toBe(1);
    await expect(page.locator('.checkout-summary')).toContainText('1 книга');
    expect(
      await page
        .locator('#checkout-form')
        .evaluate((form) => (form as HTMLFormElement).checkValidity()),
    ).toBe(false);
    await page.locator('#checkout-form [name="name"]').fill('Test User');
    await page.locator('#checkout-form [name="email"]').fill('demo@example.com');
    await page.locator('#checkout-form [name="city"]').fill('Test City');
    await expect(launcher(page)).toBeVisible();
    await page.locator('#checkout-form [type="submit"]').click();
    await expect(page).toHaveURL(/\/payment$/);
    await expect(launcher(page)).toBeHidden();
    expect(await page.evaluate(() => window.pikaDemo.adapter.getContext().cartCount)).toBe(1);
  });

  test('persists hiding and restores without opening the navigation panel', async ({
    page,
  }) => {
    await ready(page);
    await page.evaluate(() => window.pikaDemo.assistant.hide());
    await expect(launcher(page)).toBeHidden();
    await page.reload();
    await page.waitForFunction(() => !!window.pikaDemo.assistant);
    await expect(launcher(page)).toBeHidden();
    await page.evaluate(() => window.pikaDemo.assistant.restore());
    await expect(launcher(page)).toBeVisible();
    await expect(speech(page)).toBeVisible();
    await expect(character(page).locator('dialog')).not.toHaveAttribute('open');
  });

  test('keeps walking during scroll and stops playback when motion is disabled', async ({
    page,
  }) => {
    await ready(page);
    await page.evaluate(() => {
      void window.pikaDemo.assistant.perform?.('stroll');
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(50);
    const frame = await character(page).locator('canvas').getAttribute('data-frame');
    const transform = await launcher(page).evaluate((element) => element.style.transform);
    await page.waitForTimeout(250);
    expect(await character(page).locator('canvas').getAttribute('data-frame')).not.toBe(frame);
    expect(await launcher(page).evaluate((element) => element.style.transform)).not.toBe(transform);
    await finishMotion(page);
    const manifest = await (await page.request.get('/assistant/1.0.0/atlas.json')).json();
    await expect(character(page).locator('canvas')).toHaveAttribute('data-sheet', 'main');
    await expect(character(page).locator('canvas')).toHaveAttribute(
      'data-frame',
      String(manifest.neutralFrame),
    );
    await page.evaluate(() => window.pikaDemo.assistant.setMotion?.('off'));
    const staticFrame = await character(page).locator('canvas').getAttribute('data-frame');
    await page.waitForTimeout(700);
    expect(await character(page).locator('canvas').getAttribute('data-frame')).toBe(staticFrame);
  });

  test('retains one instance and subscription after twenty navigations and repeated init', async ({ page }) => {
    await ready(page);
    await page.evaluate(async () => {
      const demo = window.pikaDemo;
      for (let index = 0; index < 20; index++) {
        await demo.navigate(index % 2 ? '/catalog?category=listolesye' : '/catalog');
        await demo.runScenario('reinit');
      }
    });
    await expect(character(page)).toHaveCount(1);
    expect(await page.evaluate(() => window.pikaDemo.adapter.subscriberCount)).toBe(1);
  });

  test('updates support during arrival without restarting it', async ({
    page,
  }) => {
    await ready(page);
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(60);
    await page.evaluate(() => {
      void window.pikaDemo.assistant.perform?.('arrival');
    });
    await page.waitForTimeout(150);
    const entry = await character(page).getAttribute('data-entry');
    expect(await character(page).getAttribute('data-motion')).not.toBe('');
    const contexts = await page.evaluate(async () => {
      const values: ShopContext[] = [];
      const unsubscribe = window.pikaDemo.adapter.subscribe((event) => {
        if (event.type === 'context') values.push(event.context);
      });
      try {
        await window.pikaDemo.navigate('/product/electric-sun');
      } finally {
        unsubscribe();
      }
      return values;
    });
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.pageType).toBe('product');
    expect(contexts[0]?.ui.bottomReservedPx).toBe(84);
    await page.waitForTimeout(620);
    await finishMotion(page);
    await expect(character(page)).toHaveAttribute('data-entry', entry!);
    await expectInsideViewport(page);
    const actor = await launcher(page).boundingBox();
    const panel = await page.locator('.sticky-buy').boundingBox();
    expect(Math.abs(actor!.y + (actor!.height * 11) / 12 - panel!.y)).toBeLessThan(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator('#main')).toBeFocused();
    await expect(character(page)).toHaveCount(1);
    expect(await page.evaluate(() => window.pikaDemo.adapter.subscriberCount)).toBe(1);
  });

  test('arrives from a different side after reload and completes the entrance', async ({ page }) => {
    test.setTimeout(30000);
    await ready(page);
    const first = await character(page).getAttribute('data-entry');
    expect(['left', 'right', 'top', 'bottom']).toContain(first);
    await page.reload();
    await page.waitForFunction(() => !!window.pikaDemo.assistant);
    await finishMotion(page);
    const second = await character(page).getAttribute('data-entry');
    expect(['left', 'right', 'top', 'bottom']).toContain(second);
    expect(second).not.toBe(first);
    await expectInsideViewport(page);
    await expect(character(page).locator('dialog')).not.toHaveAttribute('open');
  });

  test('offers seven nearby scenes and runs a flip without a button', async ({
    page,
  }) => {
    test.setTimeout(30000);
    await ready(page);
    const pickScene = async (name: string) => {
      await launcher(page).hover();
      await expect(page.locator('.companion-skills')).toBeVisible();
      await page.locator(`[data-companion-skill="${name}"]`).click();
    };
    await expect(page.locator('.companion-skill')).toHaveCount(7);
    await expect(page.locator('[data-companion-skill="stroll"],[data-companion-skill="arrival"],[data-companion-skill="grab"],[data-companion-skill="flip"]')).toHaveCount(0);
    await pickScene('wiggle');
    await expect(character(page)).toHaveAttribute('data-motion', 'wiggle');
    await expect(character(page).locator('canvas')).toHaveAttribute('data-sheet', 'personality');
    await finishMotion(page);
    await page.mouse.move(0, 0);
    await page.evaluate(() => { void window.pikaDemo.assistant.perform?.('flip'); });
    await expect(character(page)).toHaveAttribute('data-motion', 'flip');
    await expect(character(page).locator('canvas')).toHaveAttribute('data-sheet', 'personality');
    await finishMotion(page);
    await expectInsideViewport(page);
    await pickScene('nose');
    await expect(character(page).locator('canvas')).toHaveAttribute('data-sheet', 'leisure');
    await expect(character(page).locator('dialog')).not.toHaveAttribute('open');
  });

  test('plays the complete guitar scene from its button and releases the interaction hold', async ({ page }) => {
    test.setTimeout(35000);
    await page.addInitScript(() => { Math.random = () => 0.5; });
    await ready(page);
    const guitarRequests: string[] = [];
    page.on('request', (request) => { if (request.url().endsWith('/guitar.webp')) guitarRequests.push(request.url()); });
    await launcher(page).hover();
    const button = page.locator('[data-companion-skill="guitar"]');
    await expect(button).toHaveAccessibleName('Лесной рок');
    await expect(button.locator('svg')).toBeVisible();
    await button.click();
    await expect(character(page)).toHaveAttribute('data-animation', 'guitar');
    await expect(character(page).locator('canvas')).toHaveAttribute('data-sheet', 'guitar');
    await expect(character(page).locator('dialog')).not.toHaveAttribute('open');
    await page.waitForFunction(() => {
      const canvas = document.querySelector('anime-shop-assistant')?.shadowRoot?.querySelector('canvas');
      return canvas?.dataset.sheet === 'guitar' && Number(canvas.dataset.frame) >= 46;
    });
    await expect(character(page)).toHaveAttribute('data-animation', 'guitar');
    await expect(character(page)).toHaveAttribute('data-animation', 'static', { timeout: 8000 });
    await expect(character(page).locator('canvas')).toHaveAttribute('data-sheet', 'main');
    expect(guitarRequests).toHaveLength(1);
    await expectInsideViewport(page);
    await page.mouse.move(0, 0);
    await expect(page.locator('.companion-skills')).toBeHidden();
    await launcher(page).hover();
    await page.locator('[data-companion-skill="nose"]').click();
    await expect(character(page)).toHaveAttribute('data-animation', 'nose');
    await expect(character(page).locator('canvas')).toHaveAttribute('data-sheet', 'leisure');
  });

  test('supports mouse dragging and treats a short press as petting', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Math.random = () => 0.5;
    });
    await ready(page);
    const box = await launcher(page).boundingBox();
    const center = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    const historyBefore = await page.evaluate(() => history.length);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await expect(launcher(page)).toHaveCSS('cursor', 'grabbing');
    await expect(character(page).locator('.pika-a-hit-area path')).toHaveCSS('cursor', 'grabbing');
    await page.mouse.move(center.x + 2, center.y - 2);
    expect(await character(page).getAttribute('data-dragging')).not.toBe('true');
    await page.mouse.up();
    await expect(launcher(page)).toHaveCSS('cursor', 'grab');
    await expect(speech(page)).toBeVisible();
    await page.evaluate(() => window.pikaDemo.assistant.setMotion?.('off'));
    await page.evaluate(() => window.pikaDemo.assistant.setMotion?.('system'));
    await recordMotion(page);
    const current = await launcher(page).boundingBox();
    await page.mouse.move(current!.x + current!.width / 2, current!.y + current!.height / 2);
    await page.mouse.down();
    await page.mouse.move(Math.max(80, current!.x - 180), 120, { steps: 12 });
    await expect(character(page)).toHaveAttribute('data-motion', 'drag');
    await page.waitForTimeout(650);
    const heldFrame = await character(page).locator('canvas').getAttribute('data-frame');
    await page.waitForTimeout(150);
    expect(await character(page).locator('canvas').getAttribute('data-frame')).toBe(heldFrame);
    const dropBox = await launcher(page).boundingBox();
    await page.mouse.up();
    await finishMotion(page);
    const states = await motionStates(page);
    expect(states).toContain('drag');
    expect(states.some((state) => state === 'fall' || state === 'parachute')).toBe(true);
    expect(states).toContain('land');
    expect(states).not.toContain('return');
    expect(states).not.toContain('hide');
    expect(Math.abs((await launcher(page).boundingBox())!.x - dropBox!.x)).toBeLessThan(1);
    await expectMotionGeometry(page);
    await expectInsideViewport(page);
    expect(await page.evaluate(() => history.length)).toBe(historyBefore);
    await expect(character(page).locator('dialog')).not.toHaveAttribute('open');
  });

  test('supports mouse dragging after waking a sleeping character', async ({ page }) => {
    await page.addInitScript(() => { Math.random = () => .5; });
    await page.route('**/demo/assistant.config.json', async (route) => {
      const response = await route.fetch();
      const config = await response.json();
      await route.fulfill({ response, json: { ...config, timings: { ...config.timings, sleepAfterMs: 100 } } });
    });
    await ready(page);
    const box = await launcher(page).boundingBox();
    const press = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    await page.mouse.move(press.x, press.y);
    await expect(character(page)).toHaveAttribute('data-animation', 'sleep');
    await page.mouse.down();
    await expect(character(page)).not.toHaveAttribute('data-motion', 'drag');
    await page.mouse.move(press.x + 80, press.y - 180, { steps: 8 });
    await expect(character(page)).toHaveAttribute('data-motion', 'drag');
    await expect(character(page)).toHaveAttribute('data-animation', 'held');
    const held = await launcher(page).boundingBox();
    await page.mouse.move(press.x + 40, press.y - 220, { steps: 4 });
    const moved = await launcher(page).boundingBox();
    expect(moved!.x).toBeCloseTo(held!.x - 40, 0);
    expect(moved!.y).toBeCloseTo(held!.y - 40, 0);
    await page.mouse.up();
    await expect(character(page)).toHaveAttribute('data-dragging', 'false');
    await finishMotion(page);
    await expect(character(page)).toHaveAttribute('data-motion', '');
    await expectInsideViewport(page);
  });

  test('supports mouse dragging and clicking when the browser refuses pixel reads', async ({ page }) => {
    await page.addInitScript(() => {
      Math.random = () => .5;
      let blockedReads = 0;
      Object.defineProperty(window, 'pikaUnreadableReads', { get: () => blockedReads });
      CanvasRenderingContext2D.prototype.getImageData = function () {
        blockedReads++;
        throw new DOMException('Blocked by image origin', 'SecurityError');
      };
    });
    await ready(page);
    await page.evaluate(async () => {
      await window.pikaDemo.assistant.setMotion?.('off');
      await window.pikaDemo.assistant.setMotion?.('system');
      window.pikaDemo.assistant.setInteractionHold?.(true);
    });
    expect(await page.evaluate(() => Number(Reflect.get(window, 'pikaUnreadableReads')))).toBeGreaterThan(0);
    await launcher(page).click();
    await expect(speech(page)).toBeVisible();
    const box = (await launcher(page).boundingBox())!;
    const press = { x: box.x + box.width / 2, y: box.y + box.height * .65 };
    await page.mouse.move(press.x, press.y); await page.mouse.down();
    await page.mouse.move(press.x + 30, press.y - 160, { steps: 6 });
    await expect(character(page)).toHaveAttribute('data-motion', 'drag');
    await page.mouse.up(); await finishMotion(page);
    await expectInsideViewport(page);
  });

  test('supports dragging only from visible fur and keeps gaze idle outside scene selection', async ({ page }) => {
    await page.addInitScript(() => { Math.random = () => .5; });
    await ready(page);
    await page.evaluate(async () => {
      await window.pikaDemo.assistant.setMotion?.('off');
      await window.pikaDemo.assistant.setMotion?.('system');
      window.pikaDemo.assistant.setInteractionHold?.(true);
    });
    const box = (await launcher(page).boundingBox())!;
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const manifest = await (await page.request.get('/assistant/1.0.0/atlas.json')).json();
    await page.mouse.move(Math.max(0, center.x - box.width * .85), center.y);
    await expect(character(page).locator('canvas')).toHaveAttribute('data-frame', String(manifest.neutralFrame));
    await expect(page.locator('.companion-skills')).toBeHidden();
    await page.mouse.move(center.x > 400 ? center.x - 400 : center.x + 400, center.y);
    await expect(character(page).locator('canvas')).toHaveAttribute('data-frame', String(manifest.neutralFrame));
    const air = { x: box.x + 4, y: center.y };
    await page.evaluate((point) => {
      const control = document.createElement('button');
      control.id = 'under-transparent-fur';
      Object.assign(control.style, { position: 'fixed', left: `${point.x - 3}px`, top: `${point.y - 3}px`,
        width: '8px', height: '8px', padding: '0', zIndex: '99' });
      control.addEventListener('click', () => { control.dataset.clicked = 'true'; });
      document.body.append(control);
    }, air);
    await page.mouse.move(air.x, air.y);
    await expect(page.locator('.companion-skills')).toBeHidden();
    await page.mouse.click(air.x, air.y);
    await expect(page.locator('#under-transparent-fur')).toHaveAttribute('data-clicked', 'true');
    await page.mouse.down();
    await page.mouse.move(air.x, air.y - 80, { steps: 4 });
    await expect(character(page)).not.toHaveAttribute('data-motion', 'drag');
    await expect(page.locator('.companion-skills')).toBeHidden();
    await page.mouse.up();
    await page.mouse.move(center.x, box.y + box.height * .65);
    await expect(page.locator('.companion-skills')).toBeVisible();
    await page.mouse.down();
    await page.mouse.move(center.x + 30, center.y - 160, { steps: 6 });
    await expect(character(page)).toHaveAttribute('data-motion', 'drag');
    await page.mouse.up();
    await finishMotion(page);
    await page.evaluate(() => window.pikaDemo.assistant.setInteractionHold?.(false));
  });
});

test.describe('Short landscape companion', () => {
  test.use({ viewport: { width:667,height:375 }, hasTouch:true });
  for (const side of ['left','right'] as const) {
    test(`keeps seven scene buttons reachable at the ${side} edge of a short landscape viewport`, async ({ page },testInfo) => {
      await page.addInitScript(() => { Math.random = () => .5; });
      await ready(page);
      const reserved = await page.evaluate(() => window.pikaDemo.adapter.getContext().ui.bottomReservedPx);
      // Set up the edge position through the drag handlers; use native taps for the menu below.
      const box = await launcher(page).boundingBox();
      const pointer = { pointerId:1,pointerType:'mouse',isPrimary:true,button:0,bubbles:true,composed:true };
      const target = { clientX:side === 'left' ? 40 : 627,clientY:375-reserved-32 };
      await launcher(page).dispatchEvent('pointerdown',{
        ...pointer,buttons:1,clientX:box!.x+box!.width/2,clientY:box!.y+box!.height/2,
      });
      await expect(character(page)).not.toHaveAttribute('data-motion','drag');
      await launcher(page).dispatchEvent('pointermove',{ ...pointer,...target,buttons:1 });
      await expect(character(page)).toHaveAttribute('data-motion','drag');
      await expect(character(page)).toHaveAttribute('data-dragging','true');
      await launcher(page).dispatchEvent('pointerup',{ ...pointer,...target,buttons:0 });
      await finishMotion(page);
      await page.mouse.move(333,0);
      const actor = await launcher(page).boundingBox();
      expect(side === 'left' ? actor!.x+32 < 132 : actor!.x+32 > 535).toBe(true);
      await launcher(page).tap();
      await expect(page.locator('.companion-skills')).toBeVisible();
      const buttons = page.locator('.companion-skill');
      await expect(buttons).toHaveCount(7);
      const rectangles = await buttons.evaluateAll((elements) => elements.map((element) => {
        const { x,y,width,height } = element.getBoundingClientRect();
        return { x,y,width,height };
      }));
      expect(new Set(rectangles.map((rect) => Math.round(rect.x))).size).toBe(2);
      rectangles.forEach((rect,index) => {
        expect(rect.width).toBe(40); expect(rect.height).toBe(40);
        expect(rect.x).toBeGreaterThanOrEqual(12);
        expect(rect.y).toBeGreaterThanOrEqual(12);
        expect(rect.x+rect.width).toBeLessThanOrEqual(655);
        expect(rect.y+rect.height).toBeLessThanOrEqual(375-reserved-12);
        rectangles.slice(index+1).forEach((other) => {
          expect(Math.abs(rect.x-other.x) >= 40 || Math.abs(rect.y-other.y) >= 40).toBe(true);
        });
      });
      await page.screenshot({ path:testInfo.outputPath('landscape-menu.png') });
      await page.locator('[data-companion-skill="guitar"]').tap();
      await expect(character(page)).toHaveAttribute('data-animation','guitar');
      await expect(character(page).locator('canvas')).toHaveAttribute('data-sheet','guitar');
      await buttons.first().focus();
      for (let index = 0; index < 7; index++) {
        await expect(buttons.nth(index)).toBeFocused();
        await page.keyboard.press('ArrowDown');
      }
      await expect(buttons.first()).toBeFocused();
    });
  }
});

test.describe('Compact companion', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('responds to taps and yields to shop and buy panels', async ({ page }) => {
    await ready(page);
    await expect(launcher(page)).toHaveCSS('width', '64px');
    await launcher(page).tap();
    await expect(speech(page)).toBeVisible();
    await expect(character(page).locator('dialog')).not.toHaveAttribute('open');
    await page.evaluate(() => window.pikaDemo.navigate('/product/electric-sun'));
    // Wait for the climb onto the buy bar after the page push.
    await finishMotion(page);
    const mascot = await launcher(page).boundingBox();
    const purchase = await page.locator('.sticky-buy').boundingBox();
    expect(mascot!.y + (mascot!.height * 11) / 12).toBeLessThanOrEqual(purchase!.y + 1);
    await page.evaluate(() => window.pikaDemo.openDialog('search'));
    await expect(launcher(page)).toBeHidden();
    await expect(page.locator('#search-dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Закрыть поиск', exact: true }).click();
    await expect(launcher(page)).toBeVisible();
  });
  test('supports touch dragging without scrolling the page', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Native touch move is dispatched through Chromium CDP.');
    await page.addInitScript(() => {
      Math.random = () => 0.5;
    });
    await ready(page);
    await page.evaluate(() => window.pikaDemo.assistant.setMotion?.('off'));
    await page.evaluate(() => window.pikaDemo.assistant.setMotion?.('system'));
    await recordMotion(page);
    const box = await launcher(page).boundingBox();
    const center = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...center, id: 1 }],
    });
    await page.waitForTimeout(3000);
    await expect(character(page)).not.toHaveAttribute('data-motion', 'drag');
    await expect(character(page)).toHaveAttribute('data-animation', 'static');
    for (let step = 1; step <= 8; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: center.x - step * 18, y: center.y - step * 55, id: 1 }],
      });
    }
    await expect(character(page)).toHaveAttribute('data-motion', 'drag');
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    const dropBox = await launcher(page).boundingBox();
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await finishMotion(page);
    await session.detach();
    const states = await motionStates(page);
    expect(states).toContain('drag');
    expect(states).toContain('land');
    expect(states).not.toContain('return');
    expect(states).not.toContain('hide');
    expect(Math.abs((await launcher(page).boundingBox())!.x - dropBox!.x)).toBeLessThan(1);
    await expectMotionGeometry(page);
    await expectInsideViewport(page);
    await expect(character(page).locator('dialog')).not.toHaveAttribute('open');
  });
});

for (const size of [
  [320, 568],
  [360, 800],
  [412, 915],
  [768, 1024],
  [1920, 1080],
  [844, 390],
]) {
  test(`fits a ${size[0]}×${size[1]} viewport without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: size[0]!, height: size[1]! });
    await ready(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const box = await launcher(page).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(size[0]!);
    expect(box!.y + (box!.height * 11) / 12).toBeLessThanOrEqual(size[1]! + 1);
  });
}

test('reduced motion loads core artwork without optional sheets or walking', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await ready(page);
  const manifest = await page.request
    .get('/assistant/1.0.0/atlas.json')
    .then((response) => response.json());
  await page.waitForTimeout(2500);
  await expect(character(page)).toHaveAttribute('data-animation', 'static');
  await expect(character(page)).toHaveAttribute('data-motion', '');
  await launcher(page).click();
  await expect(speech(page)).toBeVisible();
  for (const name of ['atlas.json', 'atlas.webp', 'poster.webp'])
    expect(requested.filter((href) => href.endsWith(`/${name}`)), `${name} is checked once before runtime`).toHaveLength(1);
  await expect(character(page).locator('canvas')).toBeVisible();
  await expect(character(page).locator('canvas')).toHaveAttribute('data-frame', String(manifest.neutralFrame));
  await page.evaluate(() => {
    // A draggable page image under the press point must not take over when
    // the custom pointer handler moves the character out of its original box.
    const background = document.createElement('img');
    background.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="white"/></svg>';
    background.draggable = true;
    Object.assign(background.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '50', opacity: '.01' });
    document.body.append(background);
  });
  const box = await launcher(page).boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(Math.max(50, box!.x - 100), Math.max(80, box!.y - 180));
  await page.waitForTimeout(100);
  await expect(character(page)).toHaveAttribute('data-motion', 'drag');
  await expect(character(page)).toHaveAttribute('data-animation', 'static');
  await page.mouse.up();
  await finishMotion(page);
  await expect(character(page)).toHaveAttribute('data-animation', 'static');
  await expect(character(page).locator('canvas')).toHaveAttribute('data-frame', String(manifest.neutralFrame));
  await expectInsideViewport(page);
  const sheetNames = [
    ...Object.values(manifest.atlases ?? {}).map((geometry) => (geometry as { file: string }).file),
  ];
  expect(
    requested.some(
      (href) => sheetNames.some((name) => href.endsWith('/' + name)),
    ),
  ).toBe(false);
});

test('artwork failure disables the companion and keeps the shop usable', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(new URL(request.url()).pathname));
  await page.route('**/assistant/1.0.0/*.webp', (route) => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => !!window.pikaDemo.assistant);
  await expect(character(page)).toHaveCount(0);
  await expect(page.locator('.companion-skills')).toHaveCount(0);
  expect(requested.some((path) => /\/src\/core\/runtime(?:\.ts)?$/.test(path))).toBe(false);
  expect(await page.evaluate(() => window.pikaDemo.adapter.subscriberCount)).toBe(0);
  await page.locator('.product-card [data-add]').first().click();
  await expect.poll(() => page.evaluate(() => window.pikaDemo.adapter.getContext().cartCount)).toBe(1);
  await page.locator('.product-card .product-art-link').first().click();
  await expect(page).toHaveURL(/\/product\/electric-sun$/);
  await expect(character(page)).toHaveCount(0);
  await expect(page.locator('.companion-skills')).toHaveCount(0);
});
