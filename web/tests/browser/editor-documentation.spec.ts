import { collapseExplorer, openEditorSection } from './editor-navigation';
import { fileURLToPath } from 'node:url';
import { test, expect } from './coverage-fixture';
import { readFileSync } from 'node:fs';
import type { CampusData, CampusPackage } from '../../src/types';
import { setup } from './editor-fixture';
import { attachMap } from './editor-map-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test(
  'documentation current gallery: published campus and isolated owner workflow',
  { tag: '@documentation' },
  async ({ page }, info) => {
    test.skip(
      !info.config.configFile?.includes('docs.config'),
      'Explicit production documentation project only.',
    );
    const manifest = JSON.parse(
      readFileSync(
        new URL(
          '../../work/model-benchmark/public/packages/latest.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as CampusPackage;
    const data = JSON.parse(
      readFileSync(
        new URL(
          `../../work/model-benchmark/public${manifest.dataUrl}`,
          import.meta.url,
        ),
        'utf8',
      ),
    ) as CampusData;
    for (const a of manifest.assets)
      await page.context().route(`**${a.url}`, (r) =>
        r.fulfill({
          body: readFileSync(
            new URL(
              `../../work/model-benchmark/public${a.url}`,
              import.meta.url,
            ),
          ),
          contentType: a.url.endsWith('.webp')
            ? 'image/webp'
            : a.url.endsWith('.json')
              ? 'application/json'
              : 'application/octet-stream',
        }),
      );
    const shot = async (name: string) => {
      await page.evaluate(() => document.fonts.ready);
      // Allow the model worker and projected-handle paint to settle for the capture.
      await page.waitForTimeout(400);
      await expect
        .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
        .toBe(false);
      await expect(async () => {
        await page.screenshot({
          path: fileURLToPath(
            new URL(
              `../../../docs/assets/screenshots/${name}-2026-09-26.png`,
              import.meta.url,
            ),
          ),
        });
      }).toPass({ timeout: 20000 });
    };
    await page.emulateMedia({ colorScheme: 'dark' });
    await setup(page, false, false, { snapshot: { data, manifest } });
    if (!process.env.TURNRIGHT_DOCS_ROUTES_ONLY) {
      const three = page.getByRole('button', {
        name: 'Switch to 3D',
        exact: true,
      });
      if (await three.isVisible()) await three.click();
      await page.evaluate(
        () =>
          void window.editorTestMap.jumpTo({
            center: [3.1998, 6.471],
            zoom: 17.3,
            pitch: 45,
          }),
      );
      await expect
        .poll(() => page.evaluate(() => window.editorTestMap.areTilesLoaded()))
        .toBe(true);
      await shot('editor-workspace-current');
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
      await collapseExplorer(page);
      await shot('editor-building-current');
      await page.setViewportSize({ width: 390, height: 844 });
      await shot('editor-building-mobile-current');
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await shot('editor-settings-mobile-current');
      await page
        .getByRole('button', { name: 'Close settings', exact: true })
        .click();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole('button', { name: /Manage photos/ }).click();
      await expect(
        page.getByRole('heading', { name: /Photos ·/ }),
      ).toBeVisible();
      await shot('editor-photos-current');
      await page.keyboard.press('Escape');
      await page
        .getByRole('button', {
          name: /^Edit model$/,
          exact: true,
        })
        .click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.locator('.photo-model-canvas canvas')).toBeVisible();
      await expect(
        dialog.locator('.photo-model-preview > output'),
      ).toContainText('Estimated dimensions');
      await shot('unified-model-desktop');
      await page.setViewportSize({ width: 1920, height: 1080 });
      await dialog
        .getByRole('button', { name: 'Reference split', exact: true })
        .click();
      await expect(dialog.locator('.model-view-columns')).toHaveAttribute(
        'data-reference-split',
        'true',
      );
      await expect(
        dialog.locator('.model-photo-view img').first(),
      ).toBeVisible();
      await shot('reference-editing');
      await dialog
        .getByRole('button', { name: 'Reference split', exact: true })
        .click();
      await page.setViewportSize({ width: 1440, height: 1000 });
      const treeRow = (name: string) =>
        dialog
          .getByRole('treeitem', { name, exact: true })
          .first()
          .locator(':scope > .model-tree-row');
      await treeRow('Roof').click();
      await dialog
        .getByRole('button', { name: 'Edit surface', exact: true })
        .click();
      const editRoof = dialog.getByRole('button', {
        name: 'Edit custom roof',
        exact: true,
      });
      if (await editRoof.isVisible()) await editRoof.click();
      await shot('editor-roof-current');
      await dialog
        .getByRole('button', { name: 'Add roof text', exact: true })
        .click();
      await dialog
        .getByLabel('Roof surface text', { exact: true })
        .fill('LASU SENATE');
      await dialog
        .getByLabel('Roof surface text', { exact: true })
        .press('Enter');
      await dialog.getByLabel('Text width (m)', { exact: true }).fill('12');
      await dialog.getByLabel('Text width (m)', { exact: true }).press('Enter');
      await dialog.getByLabel('Text height (m)', { exact: true }).fill('2');
      await dialog
        .getByLabel('Text height (m)', { exact: true })
        .press('Enter');
      await shot('editor-model-roof-text');
      const doneRoof = dialog.getByRole('button', {
        name: 'Done editing roof',
        exact: true,
      });
      if (await doneRoof.isVisible()) await doneRoof.click();
      await treeRow('Footprint').click();
      await shot('editor-outline-current');
      await dialog
        .getByRole('button', { name: 'Details', exact: true })
        .click();
      await dialog
        .getByRole('button', { name: 'Add text', exact: true })
        .click();
      await dialog
        .getByLabel('Surface text', { exact: true })
        .fill('LASU SENATE');
      await dialog.getByLabel('Surface text', { exact: true }).press('Enter');
      await dialog
        .getByRole('button', { name: 'Edit surface', exact: true })
        .click();
      await dialog.getByLabel('Width (m)', { exact: true }).fill('12');
      await dialog.getByLabel('Width (m)', { exact: true }).press('Enter');
      await dialog.getByLabel('Height (m)', { exact: true }).fill('1.8');
      await dialog.getByLabel('Height (m)', { exact: true }).press('Enter');
      await dialog
        .getByRole('button', { name: 'Fit selection', exact: true })
        .click();
      await dialog.getByLabel('Projection (m)', { exact: true }).fill('0.2');
      await dialog.getByLabel('Projection (m)', { exact: true }).press('Enter');
      await shot('editor-model-wall-text');
      await dialog.getByLabel('Find model parts').fill('Window');
      await dialog.locator('[data-tree-key*="~instance:"]').first().click();
      await dialog.getByLabel('Find model parts').fill('');
      await dialog
        .getByRole('button', { name: 'Edit surface', exact: true })
        .click();
      await dialog.getByLabel('Width (m)', { exact: true }).fill('1.25');
      await dialog.getByLabel('Width (m)', { exact: true }).press('Enter');
      await dialog
        .getByRole('button', { name: 'Fit selection', exact: true })
        .click();
      for (let i = 0; i < 3; i++)
        await dialog
          .getByRole('button', { name: 'Zoom out', exact: true })
          .click();
      await dialog
        .getByLabel('Width (m)', { exact: true })
        .scrollIntoViewIfNeeded();
      await shot('editor-model-window-instance');
      await dialog
        .getByRole('button', { name: 'Reset view', exact: true })
        .click();
      await dialog
        .getByRole('button', { name: 'Add window', exact: true })
        .click();
      await dialog
        .getByText('Groups, patterns & presets', { exact: true })
        .click();
      await dialog
        .getByRole('button', { name: 'Group selection', exact: true })
        .click();
      await dialog
        .getByRole('button', { name: /^Collapse Details/ })
        .first()
        .click();
      await dialog
        .getByRole('button', { name: 'Expand Groups', exact: true })
        .first()
        .click();
      await dialog
        .getByRole('complementary', { name: 'Building hierarchy' })
        .evaluate((el) => (el.scrollTop = 0));
      await shot('editor-model-tree-actions');
      await dialog.getByRole('button', { name: 'Orbit', exact: true }).click();
      await dialog
        .getByRole('button', { name: 'Reset view', exact: true })
        .click();
      await shot('editor-model-orbit-current');
      await page.setViewportSize({ width: 844, height: 390 });
      await dialog
        .getByRole('button', { name: 'Edit surface', exact: true })
        .click();
      await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
      await shot('editor-model-landscape');
      await page.setViewportSize({ width: 390, height: 844 });
      const done = dialog.getByRole('button', { name: 'Done', exact: true });
      if (await done.isVisible()) await done.click();
      await dialog
        .getByRole('button', { name: 'Edit surface', exact: true })
        .click();
      await dialog
        .getByRole('button', { name: 'Fit selection', exact: true })
        .click();
      await shot('editor-model-canvas-mobile');
      await dialog
        .getByRole('button', { name: 'Selected detail actions', exact: true })
        .click();
      await shot('editor-model-actions-mobile');
      await page.keyboard.press('Escape');
      await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
      await dialog.getByLabel('Width (m)', { exact: true }).focus();
      await shot('editor-model-properties-mobile');
      await dialog.getByLabel('Model editing mode').selectOption('appearance');
      await dialog
        .getByLabel('Building or wing', { exact: true })
        .selectOption('');
      await dialog
        .getByRole('spinbutton', { name: 'Building height (m)', exact: true })
        .focus();
      await shot('editor-model-height-mobile');
      await dialog.getByLabel('Model editing mode').selectOption('roof');
      await dialog
        .getByLabel('Building or wing', { exact: true })
        .selectOption({ label: 'Wing 1' });
      if (await editRoof.isVisible()) await editRoof.click();
      await dialog
        .getByRole('button', { name: 'Edit surface', exact: true })
        .click();
      await shot('editor-model-roof-mobile');
      await dialog.getByLabel('Model editing mode').selectOption('outline');
      await dialog
        .getByRole('button', { name: 'Edit surface', exact: true })
        .click();
      await page.emulateMedia({ colorScheme: 'light' });
      await shot('editor-model-outline-mobile');
      await dialog.getByRole('button', { name: 'Photo', exact: true }).click();
      await shot('editor-model-photo-mobile');
      await dialog.getByLabel('Model editing mode').selectOption('review');
      await shot('editor-model-review-mobile');
      await page.setViewportSize({ width: 1440, height: 1000 });
      await shot('editor-model-bulk-review');
      await dialog
        .getByRole('button', { name: 'Back to map', exact: true })
        .click();
      await openEditorSection(page, 'Sources');
      await shot('editor-sources-current');
      await openEditorSection(page, 'Releases');
      await shot('editor-releases-current');
      await openEditorSection(page, 'Edit');
      await page.getByRole('button', { name: 'Survey', exact: true }).click();
      await shot('editor-survey-current');
      if (process.env.TURNRIGHT_DOCS_EDITOR_ONLY) return;
      await page.goto('/');
      await attachMap(page);
      await page.emulateMedia({ colorScheme: 'light' });
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
      await shot('public-place-desktop-current');
      await page
        .getByRole('group', { name: 'Place actions', exact: true })
        .evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await shot('public-building-actions');
      await page.getByRole('link', { name: 'Editor', exact: true }).click();
      await attachMap(page);
      await expect(
        page.getByRole('button', { name: 'Edit model', exact: true }),
      ).toBeVisible();
      await shot('editor-public-building-handoff');
      const publicSenate = data.places.find(
        (place) => place.name === 'LASU Senate Building',
      )!;
      await page.goto('/?place=' + encodeURIComponent(publicSenate.id));
      await attachMap(page);
      const handle = page.getByRole('slider', { name: 'Resize search panel' });
      await handle.focus();
      await handle.press('Home');
      await shot('public-panel-resized-current');
      await page.setViewportSize({ width: 390, height: 844 });
      await handle.press('End');
      await shot('public-place-mobile-current');
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await shot('public-settings-mobile-current');
      await page.keyboard.press('Escape');
      await page
        .getByRole('button', { name: /Offline maps|Offline/, exact: false })
        .first()
        .click();
      await shot('public-offline-mobile-current');
      await page.keyboard.press('Escape');
      const close = page.getByRole('button', {
        name: 'Close place details',
        exact: true,
      });
      if (await close.isVisible()) await close.click();
      const clear = page.getByRole('button', {
        name: 'Clear search',
        exact: true,
      });
      if (await clear.isVisible()) await clear.click();
      const collapse = page.getByRole('button', {
        name: 'Collapse card',
        exact: true,
      });
      if (await collapse.isVisible()) await collapse.click();
      await shot('public-map-mobile-current');
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.evaluate(
        () =>
          void window.editorTestMap.jumpTo({
            center: [14, 12],
            zoom: -0.7,
            pitch: 0,
            bearing: 0,
          }),
      );
      await expect
        .poll(() => page.evaluate(() => window.editorTestMap.areTilesLoaded()))
        .toBe(true);
      await shot('public-globe-mobile-current');
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: 'light' });
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
      await shot('public-globe-desktop-current');
    }
    await page.goto('/');
    await attachMap(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.getByLabel('Search campus').fill('Senate');
    await page
      .getByRole('button', { name: /LASU Senate Building/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Directions', exact: true }).click();
    await page
      .getByLabel('Starting place')
      .selectOption('arcgis:University_Property:129');
    await expect(
      page.getByRole('button', { name: 'Start walking', exact: true }),
    ).toBeVisible();
    const flat = page.getByRole('button', {
      name: 'Switch to 2D',
      exact: true,
    });
    if (await flat.isVisible()) await flat.click();
    const frameRoute = async (mobile: boolean) =>
      page.evaluate(async (mobile) => {
        const map = window.editorTestMap;
        const lines = (await (
          map.getSource('routes') as import('maplibre-gl').GeoJSONSource
        ).getData()) as import('geojson').FeatureCollection<
          import('geojson').LineString
        >;
        const points = lines.features.flatMap((f) => f.geometry.coordinates);
        map.fitBounds(
          [
            [
              Math.min(...points.map((p) => p[0])),
              Math.min(...points.map((p) => p[1])),
            ],
            [
              Math.max(...points.map((p) => p[0])),
              Math.max(...points.map((p) => p[1])),
            ],
          ],
          {
            padding: mobile
              ? { top: 110, bottom: 430, left: 35, right: 35 }
              : { top: 60, bottom: 60, left: 510, right: 60 },
            pitch: 0,
            duration: 0,
          },
        );
      }, mobile);
    await frameRoute(false);
    await shot('public-route-desktop-current');
    await page.setViewportSize({ width: 390, height: 844 });
    const routeHandle = page.getByRole('slider', {
      name: 'Resize search panel',
    });
    await routeHandle.press('Home');
    for (let i = 0; i < 9; i++) await routeHandle.press('ArrowUp');
    await page
      .getByRole('button', { name: 'Start walking', exact: true })
      .scrollIntoViewIfNeeded();
    await frameRoute(true);
    await shot('public-route-mobile-current');
  },
);
