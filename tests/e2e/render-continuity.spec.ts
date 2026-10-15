import { test, expect, type Page, type TestInfo } from '@playwright/test';
import type { AtlasManifest } from '../../src/animation/manifest';

interface RenderSample {
  at: number;
  step: string;
  reason: string | null;
  alphaPixels: number;
  visibleAlphaPixels: number;
  pixelDifference: number;
  previousWeight: number;
  frame: string | undefined;
  sheet: string;
  mirrored: boolean;
  size: [number, number];
  launcherHidden: boolean;
  canvasHidden: boolean;
  motion: string;
  animation: string;
  state: string;
  pageKey: string;
  rect: { x: number; y: number; width: number; height: number };
  viewport: { left: number; top: number; width: number; height: number };
  pushContact?: number;
  pushPanelEdge?: { left: number; right: number };
  canvasPng?: string;
}
interface RenderReport {
  samples: number;
  sheets: string[];
  mirroredSamples: number;
  blendedSamples: number;
  sizes: string[];
  pageKeys: string[];
  rebases: number;
  intentionalOutsideSamples: number;
  intentionalPagePushSamples: number;
  curiousPeekSamples: number;
  firstFailure: RenderSample | null;
  recent: RenderSample[];
}
interface RenderProbe {
  mark(step: string): void;
  stop(): RenderReport;
}
type ProbeWindow = Window & { pikaRenderContinuity: RenderProbe };

const character = (page: Page) => page.locator('anime-shop-assistant');

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => !!window.pikaDemo?.assistant);
  await expect(character(page).locator('.pika-a-launcher')).toBeVisible();
  await page.waitForFunction(() => {
    const host = document.querySelector<HTMLElement>('anime-shop-assistant');
    const canvas = host?.shadowRoot?.querySelector('canvas');
    return host && !host.dataset.motion && canvas && !canvas.hidden && canvas.dataset.frame;
  });
}

async function finishMotion(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !document.querySelector<HTMLElement>('anime-shop-assistant')?.dataset.motion,
    null,
    { timeout: 30000 },
  );
}

async function startProbe(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const host = document.querySelector<HTMLElement>('anime-shop-assistant')!;
    const launcher = host.shadowRoot!.querySelector<HTMLButtonElement>('.pika-a-launcher')!;
    const canvas = host.shadowRoot!.querySelector<HTMLCanvasElement>('canvas')!;
    const poster = host.shadowRoot!.querySelector<HTMLImageElement>('img')!;
    const context = canvas.getContext('2d')!;
    const manifestUrl = new URL('/assistant/1.0.0/atlas.json', location.href);
    const manifest = (await (await fetch(manifestUrl)).json()) as AtlasManifest;
    const images = new Map<string, HTMLImageElement>();
    await Promise.all(
      [
        ['main', new URL('atlas.webp', manifestUrl).href],
        ...Object.entries(manifest.atlases ?? {}).map(([name, geometry]) => [
          name,
          new URL(geometry.file, manifestUrl).href,
        ]),
      ].map(async ([sheet, src]) => {
        const image = new Image();
        image.src = src!;
        await image.decode();
        images.set(sheet!, image);
      }),
    );
    const reference = document.createElement('canvas');
    const referenceContext = reference.getContext('2d')!;
    let expectedPixels: Uint8ClampedArray<ArrayBufferLike> | null = null;
    let expectedKey = '';
    let previousLayer: HTMLCanvasElement | null = null;
    let previousWeight = 0;
    let previousId = 0;
    const layerIds = new WeakMap<HTMLCanvasElement, number>();
    const actualDrawImage = context.drawImage;
    // Observe the blend source and alpha without trusting the rendered output.
    // The new layer is still checked against the declared atlas crop/facing.
    context.drawImage = function (image: CanvasImageSource, ...dimensions: number[]): void {
      Reflect.apply(actualDrawImage, this, [image, ...dimensions]);
      previousLayer = this.globalCompositeOperation === 'lighter' && image instanceof HTMLCanvasElement ? image : null;
      previousWeight = previousLayer ? this.globalAlpha : 0;
      if (previousLayer && !layerIds.has(previousLayer)) layerIds.set(previousLayer, ++previousId);
    };
    let raf = 0;
    let step = 'after arrival';
    let previousBase = `${launcher.style.left}:${launcher.style.top}`;
    let peekJourney = false;
    const sheets = new Set<string>();
    const sizes = new Set<string>();
    const pageKeys = new Set<string>();
    const report: RenderReport = {
      samples: 0,
      sheets: [],
      mirroredSamples: 0,
      blendedSamples: 0,
      sizes: [],
      pageKeys: [],
      rebases: 0,
      intentionalOutsideSamples: 0,
      intentionalPagePushSamples: 0,
      curiousPeekSamples: 0,
      firstFailure: null,
      recent: [],
    };
    const sample = (): void => {
      raf = 0;
      const rect = launcher.getBoundingClientRect();
      const viewport = {
        left: window.visualViewport?.offsetLeft ?? 0,
        top: window.visualViewport?.offsetTop ?? 0,
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
      };
      const style = getComputedStyle(launcher);
      const sheet = canvas.dataset.sheet ?? 'main';
      const mirrored = poster.style.transform === 'scaleX(-1)';
      const pageKey = window.pikaDemo.adapter.getContext().pageKey;
      const motion = host.dataset.motion ?? '';
      if (motion === 'peek' || motion === 'hide') peekJourney = true;
      else if (!motion || !['peek', 'hide', 'return'].includes(motion)) peekJourney = false;
      const intentionalPeekOutside =
        peekJourney &&
        ['peek', 'hide', 'return'].includes(motion) &&
        rect.bottom > viewport.top &&
        rect.top < viewport.top + viewport.height &&
        (rect.right <= viewport.left + 48 || rect.left >= viewport.left + viewport.width - 48);
      const pagePush = document.querySelector<HTMLElement>(
        '.page-push',
      );
      const pushPanel = pagePush?.querySelector<HTMLElement>('.page-push-panel');
      const pushSide = pagePush?.dataset.side;
      const pushContact = rect.left + rect.width * (pushSide === 'left' ? 170 : 22) / 192;
      const panelEdge = pushPanel?.getBoundingClientRect();
      const approaching = pagePush?.dataset.stage === 'prepare' &&
        sheet === 'personality' && host.dataset.animation === 'walk';
      const pushing = sheet === 'push' &&
        host.dataset.animation === (pushSide === 'left' ? 'push-right' : 'push-left') &&
        (pagePush?.dataset.stage === 'prepare' || pagePush?.dataset.companion === 'true');
      // The final approach frame and push pose can extend past the contact edge.
      const intentionalPushOutside =
        motion === 'page-push' && (approaching || pushing) && !!panelEdge &&
        ['left', 'right'].includes(pushSide ?? '') &&
        rect.bottom > viewport.top && rect.top < viewport.top + viewport.height &&
        Math.abs(pushContact - (pushSide === 'left' ? viewport.left : viewport.left + viewport.width)) <= 1 &&
        Math.abs(pushContact - (pushSide === 'left' ? panelEdge.left : panelEdge.right)) <= 1;
      const intentionalOutside = intentionalPeekOutside || intentionalPushOutside;
      let reason: string | null = null;
      let alphaPixels = 0;
      let visibleAlphaPixels = 0;
      let pixelDifference = 0;
      const currentHost = document.querySelector('anime-shop-assistant');
      if (currentHost !== host || !host.isConnected) reason = 'SPA replaced or removed the host';
      else if (
        launcher.hidden ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0
      )
        reason = 'launcher became hidden after arrival';
      else if (canvas.hidden || getComputedStyle(canvas).display === 'none')
        reason = 'loaded canvas became hidden';
      try {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index]! <= 8) continue;
          alphaPixels++;
          const pixel = (index - 3) / 4;
          const x = rect.left + (((pixel % canvas.width) + 0.5) * rect.width) / canvas.width;
          const y =
            rect.top + ((Math.floor(pixel / canvas.width) + 0.5) * rect.height) / canvas.height;
          if (
            x >= viewport.left &&
            x < viewport.left + viewport.width &&
            y >= viewport.top &&
            y < viewport.top + viewport.height
          )
            visibleAlphaPixels++;
        }
        if (!alphaPixels) reason ??= 'canvas contains no character pixels';
        else if (!visibleAlphaPixels && !intentionalOutside)
          reason ??= 'all character pixels escaped the visible viewport';
        else if (!visibleAlphaPixels && intentionalOutside) {
          if (intentionalPushOutside) report.intentionalPagePushSamples++;
          else report.intentionalOutsideSamples++;
        }
        const visibleCanvasWidth = Math.max(
          0,
          Math.min(rect.right, viewport.left + viewport.width) - Math.max(rect.left, viewport.left),
        );
        if (
          peekJourney &&
          motion === 'peek' &&
          sheet === 'main' &&
          Number(canvas.dataset.frame) === manifest.poses?.curious &&
          Math.abs(visibleCanvasWidth - 48) <= 1
        )
          report.curiousPeekSamples++;
        const frame = Number(canvas.dataset.frame);
        const atlas = sheet === 'main' ? manifest.atlas : manifest.atlases?.[sheet];
        const image = images.get(sheet);
        if (!atlas || !image || !Number.isInteger(frame)) reason ??= 'invalid sheet or frame';
        else {
          const key = `${sheet}:${frame}:${mirrored}:${canvas.width}:${canvas.height}:${previousLayer ? layerIds.get(previousLayer) : 0}:${previousWeight}`;
          if (key !== expectedKey) {
            reference.width = canvas.width;
            reference.height = canvas.height;
            referenceContext.save();
            if (mirrored) {
              referenceContext.translate(reference.width, 0);
              referenceContext.scale(-1, 1);
            }
            referenceContext.globalCompositeOperation = 'copy';
            referenceContext.globalAlpha = 1 - previousWeight;
            referenceContext.drawImage(
              image,
              (frame % atlas.columns) * manifest.cell.width,
              Math.floor(frame / atlas.columns) * manifest.cell.height,
              manifest.cell.width,
              manifest.cell.height,
              0,
              0,
              reference.width,
              reference.height,
            );
            referenceContext.restore();
            if (previousLayer) {
              referenceContext.globalCompositeOperation = 'lighter';
              referenceContext.globalAlpha = previousWeight;
              referenceContext.drawImage(previousLayer, 0, 0, reference.width, reference.height);
              referenceContext.globalCompositeOperation = 'source-over';
              referenceContext.globalAlpha = 1;
            }
            expectedPixels = referenceContext.getImageData(
              0,
              0,
              reference.width,
              reference.height,
            ).data;
            expectedKey = key;
          }
          for (let index = 0; index < pixels.length; index++)
            pixelDifference += Math.abs(pixels[index]! - expectedPixels![index]!);
          pixelDifference /= pixels.length;
          // Allow minor alpha rounding with identical native scaling.
          if (pixelDifference > 2)
            reason ??= 'pixels differ from the expected crop/facing after resize or sheet change';
        }
      } catch (error) {
        reason ??= `pixel read failed: ${String(error)}`;
      }
      const observation: RenderSample = {
        at: performance.now(),
        step,
        reason,
        alphaPixels,
        visibleAlphaPixels,
        pixelDifference,
        previousWeight,
        frame: canvas.dataset.frame,
        sheet,
        mirrored,
        size: [canvas.width, canvas.height],
        launcherHidden: launcher.hidden,
        canvasHidden: canvas.hidden,
        motion: host.dataset.motion ?? '',
        animation: host.dataset.animation ?? '',
        state: host.dataset.state ?? '',
        pageKey,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        viewport,
        ...(pagePush ? { pushContact, pushPanelEdge: panelEdge ? { left: panelEdge.left, right: panelEdge.right } : undefined } : {}),
      };
      report.samples++;
      if (previousLayer) report.blendedSamples++;
      sheets.add(sheet);
      sizes.add(`${canvas.width}x${canvas.height}`);
      pageKeys.add(pageKey);
      if (mirrored && sheet === 'personality') report.mirroredSamples++;
      const base = `${launcher.style.left}:${launcher.style.top}`;
      if (base !== previousBase) {
        report.rebases++;
        previousBase = base;
      }
      if (reason && !report.firstFailure) {
        try {
          observation.canvasPng = canvas.toDataURL('image/png');
        } catch {
          /* Keep metadata even if the canvas is unreadable. */
        }
        report.firstFailure = observation;
      }
      report.recent.push(observation);
      if (report.recent.length > 60) report.recent.shift();
      raf = requestAnimationFrame(sample);
    };
    (window as unknown as ProbeWindow).pikaRenderContinuity = {
      mark(value) {
        step = value;
      },
      stop() {
        if (raf) cancelAnimationFrame(raf);
        context.drawImage = actualDrawImage;
        report.sheets = [...sheets];
        report.sizes = [...sizes];
        report.pageKeys = [...pageKeys];
        return report;
      },
    };
    sample();
  });
}

async function mark(page: Page, step: string): Promise<void> {
  await page.evaluate(
    (value) => (window as unknown as ProbeWindow).pikaRenderContinuity.mark(value),
    step,
  );
}

async function saveReport(page: Page, testInfo: TestInfo): Promise<RenderReport> {
  const report = await page.evaluate(() =>
    (window as unknown as ProbeWindow).pikaRenderContinuity.stop(),
  );
  const canvasPng = report.firstFailure?.canvasPng;
  if (report.firstFailure) delete report.firstFailure.canvasPng;
  for (const sample of report.recent) delete sample.canvasPng;
  await testInfo.attach('render-continuity.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  if (canvasPng)
    await testInfo.attach('first-empty-or-invalid-canvas.png', {
      body: Buffer.from(canvasPng.split(',')[1]!, 'base64'),
      contentType: 'image/png',
    });
  return report;
}

for (const profile of [
  { name: 'desktop', viewport: { width: 1366, height: 900 }, resizedWidth: 720, hasTouch: false },
  { name: 'compact', viewport: { width: 390, height: 844 }, resizedWidth: 820, hasTouch: false },
]) {
  test.describe(`Render continuity: ${profile.name}`, () => {
    test.use({ viewport: profile.viewport, hasTouch: profile.hasTouch });
    test('keeps visible pixels across sheet changes, mirroring, rebase, resize and SPA navigation', async ({
      page,
    }, testInfo) => {
      test.setTimeout(60000);
      await page.addInitScript(() => {
        Math.random = () => 0.5;
      });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await ready(page);
      await page.evaluate(async () => {
        await window.pikaDemo.assistant.setMotion?.('off');
        await window.pikaDemo.assistant.setMotion?.('system');
        window.pikaDemo.assistant.setInteractionHold?.(true);
      });
      const manifest = await (await page.request.get('/assistant/1.0.0/atlas.json')).json() as AtlasManifest;
      await startProbe(page);
      let report: RenderReport;
      try {
        await mark(page, 'pet wink');
        await page.evaluate(() => window.pikaDemo.assistant.open());
        await expect(character(page)).toHaveAttribute('data-animation', 'wink');
        await expect(character(page).locator('canvas')).toHaveAttribute('data-sheet', manifest.clips.wink!.sheet ?? 'main');

        await mark(page, 'personality: walk left');
        await page.evaluate(() => window.pikaDemo.assistant.perform!('stroll'));
        await mark(page, 'personality: walk right');
        await page.evaluate(() => window.pikaDemo.assistant.perform!('stroll'));
        await mark(page, 'personality to main: turn and wink');
        await page.evaluate(() => window.pikaDemo.runScenario('wiggle'));
        await mark(page, 'peek: hide, peek and return to the edge');
        await page.evaluate(() => window.pikaDemo.runScenario('peek'));
        const peekBox = await character(page).locator('.pika-a-launcher').boundingBox();
        const viewport = page.viewportSize()!;
        expect(peekBox!.x).toBeGreaterThanOrEqual(3);
        expect(peekBox!.x + peekBox!.width).toBeLessThanOrEqual(viewport.width - 3);
        expect(
          Math.min(
            Math.abs(peekBox!.x - 4),
            Math.abs(peekBox!.x + peekBox!.width - viewport.width + 4),
          ),
        ).toBeLessThan(1);

        await mark(page, 'rebase: sticky buy panel');
        await page.evaluate(() => window.pikaDemo.runScenario('sticky'));
        await finishMotion(page);
        await mark(page, 'resize: compact/desktop switch');
        await page.setViewportSize({
          width: profile.resizedWidth,
          height: profile.viewport.height,
        });
        await expect(character(page).locator('.pika-a-launcher')).toHaveCSS(
          'width',
          profile.resizedWidth < 768 ? '64px' : '96px',
        );
        await finishMotion(page);

        await mark(page, 'SPA navigation during a walk');
        await page.evaluate(() => {
          void window.pikaDemo.assistant.perform!('stroll');
        });
        await expect(character(page)).toHaveAttribute('data-motion', 'stroll');
        await page.evaluate(() => window.pikaDemo.navigate('/product/electric-sun'));
        await finishMotion(page);
        await mark(page, 'SPA: catalog and new floor height');
        await page.evaluate(() => window.pikaDemo.navigate('/catalog'));
        await finishMotion(page);
        await page.setViewportSize(profile.viewport);
        await finishMotion(page);
        await mark(page, 'main after all transitions');
        await page.evaluate(() => window.pikaDemo.assistant.open());
        await page.waitForFunction(
          () =>
            document.querySelector<HTMLElement>('anime-shop-assistant')?.dataset.animation ===
            'static',
        );
        await expect(character(page).locator('canvas')).toHaveAttribute('data-sheet', 'main');
      } finally {
        report = await saveReport(page, testInfo);
      }
      expect(report.firstFailure, JSON.stringify(report.firstFailure, null, 2)).toBeNull();
      expect(report.samples, 'native canvas was read throughout finite scenes').toBeGreaterThan(
        100,
      );
      expect(report.sheets).toEqual(expect.arrayContaining(['main', 'personality']));
      expect(report.blendedSamples, 'mixed transition pixels were compared with both layers').toBeGreaterThan(0);
      expect(
        report.intentionalOutsideSamples,
        'complete intended hiding still retains nonempty reference-matching canvas pixels',
      ).toBeGreaterThan(5);
      expect(
        report.curiousPeekSamples,
        '48px curious pose is held long enough to read',
      ).toBeGreaterThan(10);
      expect(
        report.mirroredSamples,
        'actual mirrored personality pixels were compared',
      ).toBeGreaterThan(2);
      expect(report.sizes.length, 'both 64px and 96px canvas sizes were sampled').toBeGreaterThan(
        1,
      );
      expect(
        report.pageKeys.length,
        'sampling continued across SPA page contexts',
      ).toBeGreaterThanOrEqual(3);
      expect(report.rebases, 'CSS position bases changed while sampling').toBeGreaterThan(1);
    });
  });
}

for (const damage of ['empty', 'damaged'] as const) {
  test(`detects ${damage} pixels during a blended transition`, async ({ page }, testInfo) => {
    await page.addInitScript(() => { Math.random = () => .5; });
    await ready(page);
    await page.evaluate(async () => {
      await window.pikaDemo.assistant.setMotion?.('off');
      await window.pikaDemo.assistant.setMotion?.('system');
      window.pikaDemo.assistant.setInteractionHold?.(true);
    });
    await startProbe(page);
    await page.evaluate((failure) => {
      const host = document.querySelector<HTMLElement>('anime-shop-assistant')!;
      const launcher = host.shadowRoot!.querySelector<HTMLButtonElement>('.pika-a-launcher')!;
      const canvas = host.shadowRoot!.querySelector('canvas')!;
      const context = canvas.getContext('2d')!;
      const draw = context.drawImage;
      context.drawImage = function (image: CanvasImageSource, ...dimensions: number[]): void {
        Reflect.apply(draw, this, [image, ...dimensions]);
        if (this.globalCompositeOperation !== 'lighter') return;
        this.save();
        this.globalAlpha = 1;
        this.globalCompositeOperation = 'copy';
        if (failure === 'empty') this.clearRect(0, 0, canvas.width, canvas.height);
        else { this.fillStyle = '#ff00ff'; this.fillRect(0, 0, canvas.width, canvas.height); }
        this.restore();
      };
      const box = launcher.getBoundingClientRect();
      const pointer = (type: string, y: number) => launcher.dispatchEvent(new PointerEvent(type, {
        bubbles: true, pointerId: 7, isPrimary: true, button: 0, clientX: box.x + box.width / 2, clientY: y,
      }));
      pointer('pointerdown', box.y + box.height / 2);
      pointer('pointermove', box.y + box.height / 2 - 160);
    }, damage);
    await page.waitForTimeout(200);
    const report = await saveReport(page, testInfo);
    expect(report.firstFailure).not.toBeNull();
    expect(report.firstFailure!.previousWeight).toBeGreaterThan(0);
    expect(report.firstFailure!.reason).toContain(damage === 'empty' ? 'no character pixels' : 'pixels differ');
  });
}
