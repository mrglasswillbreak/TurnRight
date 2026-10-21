import { collapseExplorer } from './editor-navigation';
import { test, expect } from './coverage-fixture';
import { readFileSync } from 'node:fs';
import type { CampusPhoto, MapEdit } from '../../src/types';
import { browserCampus, setup } from './editor-fixture';
import { attachMap, clickMap, focusCampus } from './editor-map-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

for (const width of [320, 390, 768, 1440])
  for (const dark of [false, true])
    test(`photo model workspace ${width}px ${dark ? 'dark' : 'light'}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 850 });
      await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
      const sample = JSON.parse(
        readFileSync(
          new URL('../../../data/photos/catalogue.json', import.meta.url),
          'utf8',
        ),
      )[0] as CampusPhoto;
      const building = browserCampus().map.features.find(
        (f) => f.properties?.id === 'library',
      )!;
      const edit: MapEdit = {
        id: 'library',
        kind: 'building',
        geometry: building.geometry,
        properties: {
          ...building.properties,
          photos: [{ ...sample, buildingId: 'library' }],
        },
      };
      await page.route(`**${sample.url}`, (r) =>
        r.fulfill({
          body: readFileSync(
            new URL(
              `../../../data/photos/${sample.sha256}.webp`,
              import.meta.url,
            ),
          ),
          contentType: 'image/webp',
        }),
      );
      const server = await setup(page, false, false, { initialEdits: [edit] });
      await focusCampus(page);
      await collapseExplorer(page);
      await clickMap(page, [3.20012, 6.46022]);
      const trigger = page.getByRole('button', {
        name: /^Edit model$/,
        exact: true,
      });
      await trigger.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      if (width <= 900) {
        await dialog
          .getByRole('button', { name: 'Choose wall', exact: true })
          .click();
        await dialog.locator('[data-model-wall="library:wall:0:0:0"]').click();
        await dialog.getByRole('button', { name: 'More', exact: true }).click();
      } else
        await dialog
          .getByLabel('Mapped wall')
          .selectOption('library:wall:0:0:0');
      await dialog
        .getByRole('button', { name: 'Preview editable layout', exact: true })
        .click();
      await dialog
        .getByRole('button', { name: 'Use editable layout', exact: true })
        .click();
      if (width <= 900)
        await dialog.getByRole('button', { name: 'Add', exact: true }).click();
      await dialog
        .getByRole('button', { name: 'Add window', exact: true })
        .click();
      if (width <= 900)
        await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
      await dialog.getByLabel('Width (m)', { exact: true }).fill('1.8');
      await dialog.getByLabel('Width (m)', { exact: true }).press('Enter');
      await expect
        .poll(
          () =>
            server
              .edits()
              .find((e) => e.id === 'library')
              ?.properties.appearance?.facades?.[
                'library:wall:0:0:0'
              ]?.elements.at(-1)?.width,
        )
        .toBe(1.8);
      if (width <= 900)
        await dialog.getByRole('button', { name: 'More', exact: true }).click();
      await dialog.getByText('Evidence & wall review', { exact: true }).click();
      await dialog
        .getByLabel('Evidence and measurement provenance')
        .fill('Illustrative visible window; dimensions estimated.');
      await dialog
        .getByLabel('Evidence and measurement provenance')
        .press('Enter');
      await dialog
        .getByRole('button', { name: 'Mark this wall reviewed', exact: true })
        .click();
      await dialog.getByRole('button', { name: 'Orbit', exact: true }).click();
      await expect(dialog.locator('canvas')).toBeVisible();
      await expect(
        dialog.getByText('Estimated dimensions · selected wall outlined'),
      ).toBeVisible();
      const canvas = await dialog.locator('canvas').elementHandle();
      await expect
        .poll(() =>
          dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        )
        .toBe(true);
      await expect
        .poll(() => canvas!.evaluate((el) => el.isConnected))
        .toBe(true);
      await page.screenshot({ path: info.outputPath('photo-model.png') });
      await expect(dialog.getByText(/Saved to map draft/)).toBeVisible();
      await dialog
        .getByRole('button', {
          name: /^(Close workspace|Back to map)$/,
          exact: true,
        })
        .click();
      await expect(trigger).toBeFocused();
    });

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`offline image editor controls, recovery and progress at ${viewport.width}px`, async ({
    page,
  }, info) => {
    test.setTimeout(150000);
    await page.setViewportSize(viewport);
    await setup(page);
    let uploads = 0;
    await page.route('**/api/admin', async (route) => {
      const { action } = route.request().postDataJSON();
      if (action === 'media-begin') uploads++;
      if (action === 'process-status')
        return route.fulfill({
          json: {
            jobs: [
              {
                id: 'inspection-test',
                kind: 'import',
                status: 'running',
                message: 'Inspecting buildings: 3 of 5 files',
                created_at: new Date().toISOString(),
              },
            ],
            releases: [],
            imports: [],
          },
        });
      return route.fallback();
    });
    await focusCampus(page);
    const collapse = page.getByRole('button', { name: 'Collapse explorer' });
    if (await collapse.isVisible()) await collapse.click();
    await clickMap(page, [3.20012, 6.46022]);
    await page.getByRole('button', { name: /Manage photos/ }).click();
    const gallery = page.getByRole('dialog', { name: 'Photos · Library' });
    const sample = JSON.parse(
      readFileSync(
        new URL('../../../data/photos/catalogue.json', import.meta.url),
        'utf8',
      ),
    )[0];
    await gallery.getByLabel('Add photos', { exact: true }).setInputFiles({
      name: 'building.webp',
      mimeType: 'image/webp',
      buffer: readFileSync(
        new URL(`../../../data/photos/${sample.sha256}.webp`, import.meta.url),
      ),
    });
    const editor = page.getByRole('dialog', { name: 'Edit & optimise photos' });
    await expect(
      editor.getByRole('button', {
        name: 'Download edited image',
        exact: true,
      }),
    ).toBeEnabled({ timeout: 30000 });
    const imageSettings = editor.getByRole('button', {
      name: 'Image settings',
      exact: true,
    });
    if ((await imageSettings.getAttribute('aria-pressed')) === 'false')
      await imageSettings.click();
    await editor.getByText('Resize', { exact: true }).click();
    await editor.getByLabel('Longest edge (px)', { exact: true }).fill('800');
    await editor
      .getByRole('button', { name: 'Preview changes', exact: true })
      .click();
    await expect(
      editor.getByRole('button', {
        name: 'Download edited image',
        exact: true,
      }),
    ).toBeEnabled();
    const imagePreview = editor.getByAltText('Edited photograph preview');
    const originalAspect = await imagePreview.evaluate(
      (el) =>
        (el as HTMLImageElement).naturalWidth /
        (el as HTMLImageElement).naturalHeight,
    );
    await page.screenshot({
      path: info.outputPath(`photo-compression-${viewport.width}.png`),
    });
    expect(uploads).toBe(0);
    await editor.getByText('Crop & orientation', { exact: true }).click();
    await editor
      .getByRole('button', { name: 'Rotate right', exact: true })
      .click();
    await expect(editor.getByLabel('Straighten', { exact: true })).toHaveValue(
      '90',
    );
    await editor.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(editor.getByLabel('Straighten', { exact: true })).toHaveValue(
      '0',
    );
    await editor.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(editor.getByLabel('Straighten', { exact: true })).toHaveValue(
      '90',
    );
    await editor
      .getByRole('button', { name: 'Preview changes', exact: true })
      .click();
    await expect(
      editor.getByRole('button', {
        name: 'Download edited image',
        exact: true,
      }),
    ).toBeEnabled();
    await editor.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect
      .poll(() =>
        imagePreview.evaluate(
          (el) =>
            (el as HTMLImageElement).naturalWidth /
            (el as HTMLImageElement).naturalHeight,
        ),
      )
      .toBeCloseTo(originalAspect, 2);
    await editor.getByRole('button', { name: 'Redo', exact: true }).click();
    await editor
      .getByRole('button', { name: 'Preview changes', exact: true })
      .click();
    await expect(
      editor.getByRole('button', {
        name: 'Download edited image',
        exact: true,
      }),
    ).toBeEnabled();
    await editor.getByRole('button', { name: 'Close image editor' }).click();
    await gallery.getByRole('button', { name: 'Gallery', exact: true }).click();
    await gallery
      .getByRole('button', { name: 'Local image drafts · edit offline' })
      .click();
    // Wait for the saved file to load before reading the panel state; querying
    // absent form content during loading used to toggle an already-open panel shut.
    await expect(
      editor.getByRole('button', {
        name: 'Download edited image',
        exact: true,
      }),
    ).toBeEnabled();
    if ((await imageSettings.getAttribute('aria-pressed')) === 'false')
      await imageSettings.click();
    await editor.getByText('Resize', { exact: true }).click();
    await editor.getByText('Crop & orientation', { exact: true }).click();
    await expect(
      editor.getByLabel('Longest edge (px)', { exact: true }),
    ).toHaveValue('800');
    await expect(editor.getByLabel('Straighten', { exact: true })).toHaveValue(
      '90',
    );
    const bounds = await editor.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.screenshot({
      path: info.outputPath(`photo-optimise-${viewport.width}.png`),
    });
    await editor.getByRole('button', { name: 'Close image editor' }).click();
    await gallery.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: /Activity/ }).click();
    await expect(
      page.getByText('Inspecting buildings: 3 of 5 files', { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath('activity-monitor.png') });
    expect(uploads).toBe(0);
  });
}

test('prepared offline image tools reload originals and recipes and queue without uploading', async ({
  page,
  context,
}, info) => {
  test.skip(
    !info.config.configFile?.includes('photos.pwa.config'),
    'Requires production service worker.',
  );
  test.setTimeout(180000);
  await setup(page);
  let offline = false;
  let uploads = 0;
  await page.route('**/api/admin', async (route) => {
    if (offline) return route.abort('internetdisconnected');
    if (route.request().postDataJSON()?.action === 'media-begin') uploads++;
    return route.fallback();
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.getByRole('button', { name: 'Survey', exact: true }).click();
  await page
    .getByRole('button', { name: 'Prepare for offline survey', exact: true })
    .click();
  await expect(page.getByText(/Ready for offline surveying/)).toBeVisible();
  await page.getByRole('button', { name: 'Close survey', exact: true }).click();
  await focusCampus(page);
  await collapseExplorer(page);
  await clickMap(page, [3.20012, 6.46022]);
  await page.getByRole('button', { name: /Manage photos/ }).click();
  const gallery = page.getByRole('dialog', { name: 'Photos · Library' });
  const editor = page.getByRole('dialog', { name: 'Edit & optimise photos' });
  const sample = JSON.parse(
    readFileSync(
      new URL('../../../data/photos/catalogue.json', import.meta.url),
      'utf8',
    ),
  )[0];
  await gallery.getByLabel('Add photos', { exact: true }).setInputFiles({
    name: 'offline-building.webp',
    mimeType: 'image/webp',
    buffer: readFileSync(
      new URL(`../../../data/photos/${sample.sha256}.webp`, import.meta.url),
    ),
  });
  await editor
    .getByRole('button', { name: 'Local image drafts', exact: true })
    .click();
  await editor
    .getByRole('button', { name: 'Prepare for offline use', exact: true })
    .click();
  await expect(
    editor.getByRole('button', { name: 'Ready offline', exact: true }),
  ).toBeVisible({
    timeout: 30000,
  });
  expect(
    await page.evaluate(
      async () =>
        (await (await caches.open('turnright-assets-v1')).keys()).filter((r) =>
          new URL(r.url).pathname.startsWith('/photo-codecs/'),
        ).length,
    ),
  ).toBe(8);
  offline = true;
  await context.setOffline(true);
  await editor
    .getByRole('button', { name: 'Image settings', exact: true })
    .click();
  await editor.getByText('Resize', { exact: true }).click();
  await editor.getByLabel('Longest edge (px)', { exact: true }).fill('640');
  await editor
    .getByRole('button', { name: 'Preview changes', exact: true })
    .click();
  await expect(
    editor.getByRole('button', { name: 'Download edited image', exact: true }),
  ).toBeEnabled();
  const download = page.waitForEvent('download');
  await editor
    .getByRole('button', { name: 'Download edited image', exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/webp$/);
  await editor.getByRole('button', { name: 'Close image editor' }).click();
  await page.reload();
  await attachMap(page);
  await focusCampus(page);
  const collapse = page.getByRole('button', { name: 'Collapse explorer' });
  if (await collapse.isVisible()) await collapse.click();
  await clickMap(page, [3.20012, 6.46022]);
  await page.getByRole('button', { name: /Manage photos/ }).click();
  await gallery
    .getByRole('button', { name: 'Local image drafts · edit offline' })
    .click();
  await editor.getByText('Resize', { exact: true }).click();
  await expect(
    editor.getByLabel('Longest edge (px)', { exact: true }),
  ).toHaveValue('640');
  await editor
    .getByRole('button', { name: 'Preview changes', exact: true })
    .click();
  await expect(
    editor.getByRole('button', { name: 'Download edited image', exact: true }),
  ).toBeEnabled();
  await page.screenshot({ path: info.outputPath('photo-editing-offline.png') });
  await editor
    .getByRole('button', { name: 'Use for map', exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await expect(gallery.getByText('queued', { exact: true })).toBeVisible();
  await gallery.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await attachMap(page);
  await focusCampus(page);
  if (await collapse.isVisible()) await collapse.click();
  await clickMap(page, [3.20012, 6.46022]);
  await page.getByRole('button', { name: /Manage photos/ }).click();
  await gallery.getByRole('button', { name: /Review uploads/ }).click();
  await expect(gallery.getByText('queued', { exact: true })).toBeVisible();
  expect(uploads).toBe(0);
});
