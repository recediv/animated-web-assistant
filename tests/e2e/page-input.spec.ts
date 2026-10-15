import { test, expect } from '@playwright/test';

test('page snapshot blocks covered controls until the transition ends', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/product/forest-spirit');
  await page.waitForFunction(() => !!window.pikaDemo?.assistant);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => !document.querySelector<HTMLElement>('anime-shop-assistant')?.dataset.motion,
  );
  await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('#app')!;
    let clicks = 0;
    app.dataset.receivedClicks = '0';
    app.addEventListener('click', () => {
      app.dataset.receivedClicks = String(++clicks);
    });
    // Hold the opaque snapshot at its first frame so native hit testing can be checked.
    window.pikaDemo.assistant!.preparePagePush = async () => false;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      if (this.matches('.page-push-panel')) {
        Element.prototype.animate = animate;
        animation.pause();
        animation.currentTime = 0;
      }
      return animation;
    };
    void window.pikaDemo.navigate('/product/electric-sun');
  });

  const app = page.locator('#app:not([data-page-push-snapshot])');
  await expect(page.locator('.page-push[data-stage="slide"]')).toHaveCount(1);
  const transition = await page.evaluate(async () => {
    const animation = document.querySelector('.page-push-panel')!.getAnimations()[0]!;
    await animation.ready;
    return { state: animation.playState, time: animation.currentTime };
  });
  expect(transition).toEqual({ state: 'paused', time: 0 });
  await expect(app).toHaveAttribute('inert', '');
  const button = app.locator('.sticky-buy [data-add="electric-sun"]');
  const link = app.locator('.desktop-nav a[href="/catalog"]');
  for (const control of [button, link]) {
    const box = (await control.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await control.evaluate((element: HTMLElement) => element.focus());
    await expect(control).not.toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(app).toHaveAttribute('data-received-clicks', '0');
  expect(await page.evaluate(() => window.pikaDemo.adapter.getContext().cartCount)).toBe(0);
  await expect(page).toHaveURL(/\/product\/electric-sun$/);

  await page.evaluate(() => {
    document.querySelector('.page-push-panel')!.getAnimations()[0]!.finish();
  });
  await expect(page.locator('.page-push')).toHaveCount(0);
  await expect(app).not.toHaveAttribute('inert');
  await expect(page.locator('#main')).toBeFocused();
  await button.click();
  await expect
    .poll(() => page.evaluate(() => window.pikaDemo.adapter.getContext().cartCount))
    .toBe(1);
});
