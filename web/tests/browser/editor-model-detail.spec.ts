import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect } from './coverage-fixture';
import { unifiedModelFixture } from './editor-model-helpers';
import type { CampusPhoto } from '../../src/types';

async function photographicMesh(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1200 });
  const photo = JSON.parse(
    readFileSync(
      new URL('../../../data/photos/catalogue.json', import.meta.url),
      'utf8',
    ),
  )[0] as CampusPhoto;
  await page.route(`**${photo.url}`, (route) =>
    route.fulfill({
      body: readFileSync(
        new URL(`../../../data/photos/${photo.sha256}.webp`, import.meta.url),
      ),
      contentType: 'image/webp',
    }),
  );
  const { dialog, server } = await unifiedModelFixture(page, {
    prepareWall: false,
    properties: { photos: [{ ...photo, buildingId: 'library' }] },
  });
  const doc = () =>
    server.edits().find((e) => e.id === 'library')?.properties.modelDocument;
  await dialog.getByRole('button', { name: 'Mesh', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Add primitive', exact: true })
    .click();
  await expect.poll(() => doc()?.objects.length).toBe(1);
  await dialog
    .getByRole('combobox', { name: /^Mesh selection/ })
    .selectOption('face');
  await dialog
    .getByRole('combobox', { name: /^Mesh component/ })
    .selectOption({ index: 1 });
  await dialog
    .getByRole('combobox', { name: /^Distance detail/ })
    .selectOption('facade');
  await expect.poll(() => doc()?.objects[0].detailTier).toBe('facade');
  return { dialog, doc, photo };
}

test('model file workers photographic projection preserves cancellation and source evidence', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const { dialog, doc, photo } = await photographicMesh(page);
  const before = JSON.stringify(doc());
  await dialog.getByLabel('Top left X', { exact: true }).fill('0.1');
  await dialog
    .getByRole('button', { name: 'Preview texture', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Apply texture', exact: true }),
  ).toBeEnabled();
  expect(JSON.stringify(doc())).toBe(before);
  await dialog
    .getByRole('button', { name: 'Cancel texture', exact: true })
    .click();
  expect(JSON.stringify(doc())).toBe(before);
  await dialog.getByLabel('Top left X', { exact: true }).fill('0.1');
  await dialog
    .getByRole('button', { name: 'Preview texture', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Apply texture', exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole('group', { name: 'Photograph on selected faces', exact: true })
    .evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({
    path: info.outputPath('mesh-photograph-preview.png'),
  });
  await dialog
    .getByRole('button', { name: 'Apply texture', exact: true })
    .click();
  await expect.poll(() => doc()?.images[0]?.evidence?.photoId).toBe(photo.id);
  expect(doc()!.images[0].evidence?.corners[0]).toEqual([0.1, 0]);
  expect(
    doc()!.objects[0].faces.some((f) => f.corners.every((c) => c.uv)),
  ).toBe(true);
});

test('model file workers GLB and building renders preserve undo and photographic evidence', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const { dialog, doc, photo } = await photographicMesh(page);
  await dialog.getByLabel('Top left X', { exact: true }).fill('0.1');
  await dialog
    .getByRole('button', { name: 'Preview texture', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Apply texture', exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole('button', { name: 'Apply texture', exact: true })
    .click();
  await expect.poll(() => doc()?.images[0]?.evidence?.photoId).toBe(photo.id);
  expect(doc()!.images[0].evidence?.corners[0]).toEqual([0.1, 0]);
  expect(
    doc()!.objects[0].faces.some((f) => f.corners.every((c) => c.uv)),
  ).toBe(true);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => doc()?.images.length).toBe(0);
  await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(() => doc()?.images.length).toBe(1);
  await dialog.getByText('Import and export', { exact: true }).click();
  await dialog
    .getByRole('combobox', { name: /^Export format/ })
    .selectOption('glb');
  await dialog
    .getByRole('button', { name: 'Prepare export', exact: true })
    .click();
  await expect(
    dialog.getByRole('link', { name: /Download .*glb/ }),
  ).toBeVisible({ timeout: 30_000 });
  await dialog
    .getByRole('combobox', { name: /^Image width/ })
    .selectOption('1024');
  await dialog
    .getByRole('button', { name: 'Prepare PNG', exact: true })
    .click();
  const download = dialog.getByRole('link', {
    name: 'Download building render',
    exact: true,
  });
  // The retained CI trace was still rendering after the generic 10-second
  // assertion budget. Software WebGL under V8 coverage needs an export budget.
  await expect(
    dialog
      .getByRole('group', { name: 'Building render', exact: true })
      .getByRole('button', { name: 'Prepare PNG', exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(
    dialog
      .getByRole('group', { name: 'Building render', exact: true })
      .getByRole('alert'),
  ).toHaveCount(0);
  await expect(download).toBeVisible();
  const dimensions = await download.evaluate(async (link) => {
    const image = await createImageBitmap(
      await (await fetch((link as HTMLAnchorElement).href)).blob(),
    );
    const result = [image.width, image.height];
    image.close();
    return result;
  });
  expect(dimensions).toEqual([1024, 768]);
  await download.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('building-render-export.png'),
  });
  await dialog
    .getByRole('combobox', { name: /^Image width/ })
    .selectOption('2400');
  await expect(download).toHaveCount(0);
});
