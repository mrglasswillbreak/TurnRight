import { openEditorSection } from './editor-navigation';
import { test, expect } from './coverage-fixture';
import type { MapEdit, Position } from '../../src/types';
import { browserCampus, setup } from './editor-fixture';
import { attachMap, position, focusCampus } from './editor-map-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test(
  'prepared public map reopens in 3D offline with its saved view preference',
  { tag: '@offline' },
  async ({ page, context }, testInfo) => {
    test.skip(
      !testInfo.config.configFile?.includes('pwa.config'),
      'Requires the production service worker configuration.',
    );
    await page.emulateMedia({ colorScheme: 'dark' });
    await setup(page);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.goto('/');
    await attachMap(page);
    await page
      .getByRole('button', { name: 'Expand card', exact: true })
      .click();
    await page.getByRole('button', { name: 'Offline', exact: true }).click();
    await page
      .getByRole('button', { name: 'Download campus map', exact: true })
      .click();
    await expect(
      page.getByText('Ready offline', { exact: true }).first(),
    ).toBeVisible();
    await context.setOffline(true);
    await page.goto('/');
    await attachMap(page);
    await page
      .getByRole('button', { name: 'Expand card', exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
      .toBe(45);
    expect(
      await page.evaluate(async () => {
        const data = (await (
          window.editorTestMap.getSource(
            'campus',
          ) as import('maplibre-gl').GeoJSONSource
        ).getData()) as import('geojson').FeatureCollection;
        return data.features.find(
          (f) => f.properties?.heightKind === 'illustrative',
        )?.properties?.displayHeight;
      }),
    ).toBe(6);
    await page
      .getByRole('button', { name: 'Switch to 2D', exact: true })
      .click();
    await page.reload();
    await attachMap(page);
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
      .toBe(0);
  },
);

test('published corrections leave Drafts and map highlights without losing saved edits', async ({
  page,
}) => {
  const correction: MapEdit = {
    id: 'library',
    kind: 'place',
    geometry: { type: 'Point', coordinates: [3.2001, 6.4601] },
    properties: { name: 'Published library' },
  };
  const server = await setup(page, false, false, {
    initialEdits: [correction],
    publishedEdits: [correction],
  });
  const draftIds = () =>
    page.evaluate(() => {
      const source = window.editorTestMap.getSource('editor-drafts');
      const data = source?.serialize().data as
        | { features?: { properties: { id: string } }[] }
        | undefined;
      return data?.features?.map((f) => f.properties.id) || [];
    });
  await page.getByRole('button', { name: 'Drafts', exact: true }).click();
  await expect(
    page.getByText('No unpublished changes. Published work stays on the map.'),
  ).toBeVisible();
  await expect.poll(draftIds).toEqual([]);
  expect(server.edits()).toHaveLength(1);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Search map features' })
    .fill('Published library');
  await page
    .locator('.editor-feature-list button')
    .filter({ hasText: 'Published library' })
    .click();
  await page.getByLabel('Name', { exact: true }).fill('Next library');
  await page.getByLabel('Name', { exact: true }).press('Tab');
  await expect
    .poll(() => server.edits()[0].properties.name)
    .toBe('Next library');
  await expect.poll(draftIds).toEqual(['library']);
  server.publish();
  await openEditorSection(page, 'Releases');
  await expect(
    page.getByText('0 unpublished corrections · Saved'),
  ).toBeVisible();
  await expect.poll(draftIds).toEqual([]);
  expect(server.edits()[0].properties.name).toBe('Next library');
});

test('path crossing controls persist automatic connection and bridge choices', async ({
  page,
}) => {
  const server = await setup(page, false, false, {
    initialEdits: [
      {
        id: 'crossing-test',
        kind: 'path',
        geometry: {
          type: 'LineString',
          coordinates: [
            [3.2005, 6.4598],
            [3.2005, 6.46015],
          ],
        },
        properties: {
          name: 'Crossing test',
          vertexIds: ['crossing-test:start', 'crossing-test:end'],
        },
      },
    ],
  });
  const selectPath = async () => {
    await focusCampus(page);
    const point = await position(page, [3.2005, 6.4601]);
    await page.mouse.click(point.x, point.y);
    await expect(
      page.getByRole('checkbox', { name: 'Connect crossings automatically' }),
    ).toBeVisible();
  };
  await selectPath();
  const automatic = page.getByRole('checkbox', {
    name: 'Connect crossings automatically',
  });
  await expect(automatic).toBeChecked();
  await automatic.uncheck();
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === 'crossing-test')?.properties
          .autoConnectCrossings,
    )
    .toBe(false);
  await page
    .getByRole('combobox', { name: 'Crossing level', exact: true })
    .selectOption('bridge');
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === 'crossing-test')?.properties
          .crossingLevel,
    )
    .toBe('bridge');
  await page.reload();
  await attachMap(page);
  await selectPath();
  await expect(automatic).not.toBeChecked();
  await expect(
    page.getByRole('combobox', { name: 'Crossing level', exact: true }),
  ).toHaveValue('bridge');
  await page.screenshot({ path: 'test-results/path-crossing-controls.png' });
  await automatic.check();
  await page
    .getByRole('combobox', { name: 'Crossing level', exact: true })
    .selectOption('ground');
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === 'crossing-test')?.properties
          .crossingLevel,
    )
    .toBe('ground');
  expect(
    server.edits().find((e) => e.id === 'crossing-test')?.properties
      .autoConnectCrossings,
  ).toBe(true);
});

test.describe('phone editor reliability', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('phone editor reliability: guided entrance repair is previewed before saving', async ({
    page,
  }, testInfo) => {
    const point = browserCampus().graph.nodes.find(
      (n) => n.id === 'b',
    )!.coordinates;
    const initial: MapEdit = {
      id: 'door-repair',
      kind: 'entrance',
      geometry: { type: 'Point', coordinates: point },
      properties: {
        name: 'Repair door',
        placeId: '',
        connection: { type: 'node', nodeId: 'b', coordinates: point },
      },
      updated_at: '2026-09-11T10:00:00Z',
    };
    const server = await setup(page, false, false, { initialEdits: [initial] });
    await openEditorSection(page, 'Releases');
    await page
      .getByRole('button', { name: 'Choose entrance’s place' })
      .first()
      .tap();
    await expect(
      page.getByLabel('Entrance place', { exact: true }),
    ).toBeFocused();
    await page
      .getByLabel('Entrance place', { exact: true })
      .selectOption(server.campus.places[0].id);
    await expect(
      page.getByRole('complementary', { name: 'Review proposed repair' }),
    ).toBeVisible();
    expect(server.edits()[0].properties.placeId).toBe('');
    await expect(
      page.getByRole('button', { name: 'Draw path', exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: testInfo.outputPath('phone-repair-preview.png'),
    });
    await page.getByRole('button', { name: 'Cancel repair' }).tap();
    expect(server.edits()[0].properties.placeId).toBe('');
    await page
      .getByLabel('Entrance place', { exact: true })
      .selectOption(server.campus.places[0].id);
    await page.getByRole('button', { name: 'Apply reviewed repair' }).tap();
    await expect
      .poll(() => server.edits()[0].properties.placeId)
      .toBe(server.campus.places[0].id);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});

test('public initial camera includes the northern campus', async ({ page }) => {
  const { campus } = await setup(page, true);
  await page.goto('/');
  await attachMap(page);
  const corners = await page.evaluate((bounds) => {
    const map = window.editorTestMap;
    return [
      bounds[0],
      bounds[1],
      [bounds[0][0], bounds[1][1]],
      [bounds[1][0], bounds[0][1]],
    ].map((p) => map.project(p as Position));
  }, campus.bounds);
  for (const point of corners) {
    expect(point.x).toBeGreaterThan(450);
    expect(point.x).toBeLessThan(1440);
    expect(point.y).toBeGreaterThan(0);
    expect(point.y).toBeLessThan(1000);
  }
  await page.screenshot({ path: 'test-results/public-campus-3d-light.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTestMap.getPaintProperty('background', 'background-color'),
      ),
    )
    .toBe('#293e52');
  await page.screenshot({ path: 'test-results/public-campus-3d-dark.png' });
});

test('public phone starts at 40 degrees and frames campus in both preferences', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5183',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    const { campus } = await setup(page, true);
    await page.goto('/');
    await attachMap(page);
    await page
      .getByRole('button', { name: 'Expand card', exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
      .toBe(40);
    await page
      .getByRole('button', { name: 'Switch to 2D', exact: true })
      .click();
    await page.reload();
    await attachMap(page);
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
      .toBe(0);
    const points = await page.evaluate(
      (bounds) =>
        [bounds[0], bounds[1]].map((p) => window.editorTestMap.project(p)),
      campus.bounds,
    );
    for (const p of points) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(390);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(844);
    }
  } finally {
    await context.close();
  }
});
