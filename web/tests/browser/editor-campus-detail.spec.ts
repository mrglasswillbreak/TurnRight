import { test, expect } from './coverage-fixture';
import { setup } from './editor-fixture';
import { attachMap, position, focusCampus } from './editor-map-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('campus detail palette preview cancels cleanly and commits as one undo step', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const state = await setup(page, false, false, { startupTimeout: 30000 });
  await focusCampus(page);
  const shownRoof = () =>
    page.evaluate(async () => {
      const source = window.editorTestMap.getSource(
        'campus',
      ) as import('maplibre-gl').GeoJSONSource;
      const collection = (await source.getData()) as GeoJSON.FeatureCollection;
      return collection.features.find(
        (f) =>
          f.properties?.id === 'library' && f.properties.kind === 'building',
      )?.properties?.appearance?.roofColour;
    });
  const originalRoof = await shownRoof();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const workspace = page.getByRole('region', { name: 'Campus layers' });
  await workspace.getByRole('tab', { name: /^Features/ }).click();
  const attributes = page.getByRole('region', {
    name: 'Layer attributes',
    exact: true,
  });
  await attributes.getByLabel('Search layer features').fill('Library');
  await attributes
    .getByRole('row', { name: /Select Library library.*building/ })
    .getByRole('checkbox', { name: 'Select Library library', exact: true })
    .check();
  await attributes.getByLabel('Building palette').selectOption('terracotta');
  await attributes
    .getByRole('button', { name: 'Preview appearance', exact: true })
    .click();
  await expect(page.getByLabel('Proposed building colours')).toBeVisible();
  await expect.poll(shownRoof).toBe('#9b6753');
  await page.screenshot({ path: testInfo.outputPath('palette-preview.png') });
  expect(state.edits()).toHaveLength(0);
  await page
    .locator('.layer-preview')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(page.getByLabel('Proposed building colours')).toHaveCount(0);
  await expect.poll(shownRoof).toBe(originalRoof);
  expect(state.edits()).toHaveLength(0);
  await attributes
    .getByRole('button', { name: 'Preview appearance', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Apply changes', exact: true })
    .click();
  await expect
    .poll(
      () =>
        state.edits().find((e) => e.kind === 'building' && e.id === 'library')
          ?.properties.appearance?.roofColour,
    )
    .toBe('#9b6753');
  await page
    .getByRole('button', { name: 'Collapse table and activity', exact: true })
    .click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(
      () =>
        state
          .edits()
          .find(
            (e) => e.id === 'library' && e.kind === 'building' && !e.deleted,
          )?.properties.appearance?.roofColour,
    )
    .toBe(originalRoof);
  await expect.poll(shownRoof).toBe(originalRoof);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(shownRoof).toBe('#9b6753');
});

for (const touch of [false, true])
  test(`campus detail precision rectangle, recovery and undo with ${touch ? 'touch' : 'mouse'}`, async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:5183',
      viewport: touch
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      hasTouch: touch,
      isMobile: touch,
    });
    const page = await context.newPage();
    try {
      const state = await setup(page, false, false, { startupTimeout: 30000 });
      await focusCampus(page);
      await page
        .getByRole('button', { name: 'Draw building', exact: true })
        .click();
      const point = await position(page, [3.2005, 6.4603]);
      if (touch) await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
      await expect(page.locator('.drawing-progress')).toContainText(
        '1 point placed',
      );
      await page
        .getByRole('button', { name: 'Precision drawing', exact: true })
        .click();
      await page.getByLabel('Length / width (m)').fill('12');
      await page.getByLabel('Rectangle depth (m)').fill('8');
      await page
        .getByRole('button', { name: 'Construct rectangle from first point' })
        .click();
      await expect(page.locator('.drawing-progress')).toContainText('4');
      await page.screenshot({
        path: testInfo.outputPath('precision-rectangle-preview.png'),
      });
      await page
        .getByRole('button', { name: 'Close precision drawing' })
        .click();
      await page.getByRole('button', { name: 'Finish', exact: true }).click();
      await expect
        .poll(
          () =>
            state.edits().filter((e) => e.kind === 'building' && !e.deleted)
              .length,
        )
        .toBe(1);
      const created = state.edits().find((e) => e.kind === 'building')!;
      expect(created.geometry.type).toBe('Polygon');
      const ring = (created.geometry as GeoJSON.Polygon).coordinates[0];
      expect(ring).toHaveLength(5);
      const lengths = ring
        .slice(1)
        .map(
          (b, i) =>
            Math.hypot(
              (b[0] - ring[i][0]) * Math.cos((6.46 * Math.PI) / 180),
              b[1] - ring[i][1],
            ) * 111195,
        )
        .sort((a, b) => a - b);
      expect(lengths.map((n) => Math.round(n * 10) / 10)).toEqual([
        8, 8, 12, 12,
      ]);
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect
        .poll(
          () =>
            state.edits().filter((e) => e.kind === 'building' && !e.deleted)
              .length,
        )
        .toBe(0);
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      await expect
        .poll(() => state.edits().some((e) => e.id === created.id))
        .toBe(true);
      await page.reload();
      await attachMap(page);
      expect(state.edits().find((e) => e.id === created.id)?.geometry).toEqual(
        created.geometry,
      );
    } finally {
      await context.close();
    }
  });

test('campus detail landmark points offer a 3D area view without a building association', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const server = await setup(page, false, false, {
    mutateCampus(data) {
      data.places.push({
        ...data.places[0],
        id: 'landmark-point',
        sourceId: 'landmark-point',
        name: 'Library landmark point',
        coordinates: [3.2008, 6.4608],
        buildingId: undefined,
        landmark: true,
      });
    },
  });
  await page.goto('/');
  await attachMap(page);
  await page.getByRole('button', { name: 'Switch to 2D', exact: true }).click();
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  await page.getByRole('button', { name: 'Landmarks', exact: true }).click();
  await page.getByRole('button', { name: /Library landmark point/ }).click();
  await page
    .getByRole('button', { name: 'View area in 3D', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Switch to 2D', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.getZoom()))
    .toBeLessThanOrEqual(18.001);
  expect(
    server.campus.places.find((p) => p.id === 'landmark-point')?.buildingId,
  ).toBeUndefined();
  expect(server.edits()).toEqual([]);
});
