import { test, expect } from './coverage-fixture';
import { readFileSync } from 'node:fs';
import type { CampusData, CampusPackage } from '../../src/types';
import { setup } from './editor-fixture';
import { attachMap } from './editor-map-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test(
  'redesign documentation gallery: public, editor and model layouts',
  { tag: '@documentation' },
  async ({ page }, info) => {
    test.skip(
      !info.config.configFile?.includes('redesign-docs.config'),
      'Explicit documentation capture only',
    );
    const manifest = JSON.parse(
      readFileSync(
        new URL(
          '../../work/docs-fixture/public/packages/latest.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as CampusPackage;
    const data = JSON.parse(
      readFileSync(
        new URL(
          `../../work/docs-fixture/public${manifest.dataUrl}`,
          import.meta.url,
        ),
        'utf8',
      ),
    ) as CampusData;
    for (const asset of manifest.assets)
      await page.context().route(`**${asset.url}`, (route) =>
        route.fulfill({
          body: readFileSync(
            new URL(
              `../../work/docs-fixture/public${asset.url}`,
              import.meta.url,
            ),
          ),
          contentType: asset.url.endsWith('.webp')
            ? 'image/webp'
            : asset.url.endsWith('.json')
              ? 'application/json'
              : 'application/octet-stream',
        }),
      );
    const shot = async (name: string) => {
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
        .toBe(false);
      await page.waitForTimeout(700);
      await page.screenshot({
        path: (
          await import('./documentation-capture')
        ).documentationCapturePath(name),
      });
    };
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: 'light' });
    await setup(page, false, false, { snapshot: { data, manifest } });
    await page.evaluate(
      () =>
        void window.editorTestMap.jumpTo({
          center: [3.1998, 6.471],
          zoom: 17.3,
          pitch: 45,
        }),
    );
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByLabel('Search map features').fill('Senate');
    await page
      .locator('.editor-feature-list button')
      .filter({
        has: page.locator('.editor-feature-icon.building'),
        hasText: 'Senate',
      })
      .first()
      .click();
    await expect(
      page.getByRole('button', { name: 'Edit model', exact: true }),
    ).toBeVisible();
    await shot('editor-desktop');
    await page
      .getByRole('button', { name: 'Close map legend', exact: true })
      .click();
    await shot('legend-collapsed');
    await page.getByRole('button', { name: /^Activity/ }).click();
    await shot('activity-expanded');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot('editor-mobile');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Edit model', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.photo-model-canvas canvas')).toBeVisible();
    await expect(dialog.locator('.photo-model-preview > output')).toContainText(
      'Estimated dimensions',
    );
    await dialog
      .getByRole('button', { name: 'Reference split', exact: true })
      .click();
    await expect(dialog.locator('.model-photo-view img').first()).toBeVisible();
    await shot('model-desktop');
    await dialog
      .getByRole('button', { name: 'Reference split', exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog
      .getByRole('button', { name: 'Fit selection', exact: true })
      .click();
    await shot('model-portrait');
    await page.setViewportSize({ width: 844, height: 390 });
    await dialog
      .getByRole('button', { name: 'Fit selection', exact: true })
      .click();
    await shot('model-landscape');
    await page.goto('/');
    await attachMap(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(
      () =>
        void window.editorTestMap.jumpTo({
          center: [3.1998, 6.471],
          zoom: 17.6,
          pitch: 45,
        }),
    );
    await page.getByLabel('Search campus').fill('Senate');
    await page
      .getByRole('button', { name: /LASU Senate Building/ })
      .first()
      .click();
    await shot('public-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot('public-mobile');
    await page
      .getByRole('button', { name: /Offline maps|Offline/ })
      .first()
      .click();
    await page
      .getByRole('slider', { name: 'Resize dialog', exact: true })
      .press('End');
    await shot('offline');
    await page.keyboard.press('Escape');
    await page.goto('/');
    await attachMap(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(
      () =>
        void window.editorTestMap.jumpTo({
          center: [14, 12],
          zoom: 1.65,
          pitch: 0,
          bearing: 0,
        }),
    );
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.areTilesLoaded()))
      .toBe(true);
    await shot('globe');
    if (process.env.TURNRIGHT_SCREENSHOT_PREFIX) {
      const signedOut = await page
        .context()
        .browser()!
        .newContext({
          baseURL: info.project.use.baseURL,
          viewport: { width: 1440, height: 1000 },
          colorScheme: 'light',
        });
      try {
        const entry = await signedOut.newPage();
        await entry.goto('/admin');
        await expect(
          entry.getByRole('button', { name: /GitHub/ }),
        ).toBeVisible();
        await entry.evaluate(() => document.fonts.ready);
        await entry.screenshot({
          path: (
            await import('./documentation-capture')
          ).documentationCapturePath('signin'),
        });
      } finally {
        await signedOut.close();
      }
    }
  },
);
