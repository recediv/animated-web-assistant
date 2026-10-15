import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => !!window.pikaDemo?.assistant);
}

test.describe('Bottom panels and cart keyboard navigation', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  for (const surface of ['page', 'drawer']) {
    test(`quantity changes and removal preserve focus: ${surface}`, async ({ page }) => {
      await ready(page, surface === 'page' ? '/cart' : '/');
      await page.evaluate(async () => {
        for (const id of ['forest-spirit', 'electric-sun', 'sky-dragon'])
          await window.pikaDemo.addProduct(id, { delay: 0 });
      });
      if (surface === 'drawer') await page.evaluate(() => window.pikaDemo.openDialog('cart'));
      const content = page.locator(
        surface === 'page' ? '.cart-page-content' : '#cart-dialog-content',
      );
      const plus = content.locator('[data-quantity="forest-spirit"][data-delta="1"]');
      const minus = content.locator('[data-quantity="forest-spirit"][data-delta="-1"]');
      const quantity = plus.locator('..').locator('[aria-label="Количество"]');

      await plus.focus();
      await page.keyboard.press('Enter');
      await expect(quantity).toHaveText('2');
      await expect(plus).toBeFocused();
      await page.keyboard.press('Space');
      await expect(quantity).toHaveText('3');
      await expect(plus).toBeFocused();

      await minus.focus();
      await page.keyboard.press('Enter');
      await expect(quantity).toHaveText('2');
      await expect(minus).toBeFocused();
      await page.keyboard.press('Space');
      await expect(quantity).toHaveText('1');
      await expect(minus).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(plus).toHaveCount(0);
      await expect(
        content.locator('[data-quantity="electric-sun"][data-delta="-1"]'),
      ).toBeFocused();

      await content.locator('[data-remove="sky-dragon"]').focus();
      await page.keyboard.press('Enter');
      await expect(content.locator('[data-remove="electric-sun"]')).toBeFocused();
      await page.keyboard.press('Space');
      await expect(content.locator('.empty-state a')).toBeFocused();
    });
  }

  for (const inset of [0, 34]) {
    test(`panels respect a ${inset}px safe area and viewport height changes`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      // Simulate a safe area without changing selectors or cascade order.
      await page.route('**/*.css', async (route) => {
        const response = await route.fetch();
        const css = (await response.text()).replace(
          /env\(safe-area-inset-bottom(?:,\s*0px)?\)/g,
          'var(--test-safe-area-bottom, 0px)',
        );
        await route.fulfill({
          response,
          body: `:root { --test-safe-area-bottom: ${inset}px; }\n${css}`,
        });
      });
      await ready(page, '/');

      const checkPanels = async (safeBottom: number): Promise<void> => {
        const nav = await page.locator('.mobile-bottom-nav').boundingBox();
        expect(nav!.height).toBeCloseTo(68 + safeBottom, 3);
        await expect
          .poll(() =>
            page.evaluate(() => {
              const nav = document.querySelector<HTMLElement>('.mobile-bottom-nav')!;
              const bar = document.querySelector<HTMLElement>('.sticky-buy')!;
              const occupied =
                nav.getBoundingClientRect().height +
                (bar.hidden ? 0 : bar.getBoundingClientRect().height);
              return Math.abs(window.pikaDemo.adapter.getContext().ui.bottomReservedPx - occupied);
            }),
          )
          .toBeLessThan(0.01);

        const bar = page.locator('.sticky-buy');
        const support = (await bar.isVisible()) ? (await bar.boundingBox())!.y : nav!.y;
        if (await bar.isVisible()) {
          const box = (await bar.boundingBox())!;
          const button = (await bar.locator('[data-add]').boundingBox())!;
          expect(Math.abs(box.y + box.height - nav!.y)).toBeLessThan(0.1);
          expect(button.y + button.height).toBeLessThanOrEqual(nav!.y);
        }
        await expect
          .poll(async () => {
            const actor = (await page
              .locator('anime-shop-assistant .pika-a-launcher')
              .boundingBox())!;
            return actor.y + (actor.height * 11) / 12 - support;
          })
          .toBeLessThanOrEqual(1);
      };

      for (const path of ['/', '/catalog', '/product/electric-sun']) {
        await page.evaluate((path) => window.pikaDemo.navigate(path), path);
        await checkPanels(inset);
      }
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--test-safe-area-bottom', '20px');
      });
      await expect
        .poll(() =>
          page.locator('.mobile-bottom-nav').evaluate((nav) => nav.getBoundingClientRect().height),
        )
        .toBe(88);
      await checkPanels(20);
      await page.setViewportSize({ width: 1366, height: 900 });
      await expect
        .poll(() => page.evaluate(() => window.pikaDemo.adapter.getContext().ui.bottomReservedPx))
        .toBe(84);
      await page.setViewportSize({ width: 390, height: 844 });
      await checkPanels(20);
      await page.locator('.sticky-buy').evaluate((bar) => {
        bar.style.minHeight = '110px';
      });
      await expect
        .poll(() => page.evaluate(() => window.pikaDemo.adapter.getContext().ui.bottomReservedPx))
        .toBe(198);
      await checkPanels(20);
    });
  }
});
