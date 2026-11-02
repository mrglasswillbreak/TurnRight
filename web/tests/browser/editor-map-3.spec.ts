import { collapseExplorer } from './editor-navigation';
import type { Map as MapInstance } from 'maplibre-gl';
import { test, expect, type Page } from './coverage-fixture';
import { setup } from './editor-fixture';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

type SlateMode = 'enhanced' | 'simple' | '2d';

async function setupSlate(page: Page, editor: boolean, phone: boolean) {
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (
      m.type() === 'error' &&
      /Campus map:|layers\.|Cannot|Error/.test(m.text())
    )
      errors.push(m.text());
  });
  // Enter the surface being tested directly: unloading an unrelated editor
  // mid-worker startup can emit WebKit transport errors before this journey.
  const state = await setup(page, true, true, { publicEntry: !editor });
  if (editor) {
    await collapseExplorer(page);
    await page
      .getByRole('button', { name: 'Switch to 3D', exact: true })
      .click();
  }
  const toggle = page.locator('.map-view-control');
  await expect(toggle).toHaveCount(1);
  await expect(page.locator('.map-rendering-options')).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { slateCanvas: HTMLCanvasElement }).slateCanvas =
      window.editorTestMap.getCanvas();
  });
  const paint = (layer: string, property: string) =>
    page.evaluate(
      ({ layer, property }) =>
        window.editorTestMap.getPaintProperty(
          layer,
          property as Parameters<MapInstance['getPaintProperty']>[1],
        ),
      { layer, property },
    );
  await expect
    .poll(() => paint('background', 'background-color'))
    .toBe('#293e52');
  expect(
    await page.evaluate(() => window.editorTestMap.hasImage('place-library')),
  ).toBe(true);
  const sources = await page.evaluate(() =>
    (
      window.editorTestMap.getSource(
        'campus',
      ) as import('maplibre-gl').GeoJSONSource
    ).getData(),
  );
  expect(
    (sources as import('geojson').FeatureCollection).features.some(
      (f) => f.properties?.landClass === 'water',
    ),
  ).toBe(true);
  return { state, errors, toggle, paint };
}

async function useSimpleSlateRenderer(page: Page, editor: boolean) {
  if (!editor)
    await page
      .getByRole('button', { name: 'Expand card', exact: true })
      .click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Simple', exact: true }).check();
  await page
    .getByRole('button', {
      name: editor ? 'Close settings' : 'Close',
      exact: true,
    })
    .click();
}

async function frameSlate(
  page: Page,
  mode: SlateMode,
  phone: boolean,
  zoom: number,
  latitude: number,
) {
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
  await page.evaluate(
    ({ zoom, latitude, phone, mode }) =>
      void window.editorTestMap.jumpTo({
        center: [3.19978, latitude],
        zoom,
        bearing: -12,
        pitch: mode === '2d' ? 0 : 50,
        padding: { top: 0, left: 0, right: 0, bottom: phone ? 270 : 0 },
      }),
    { zoom, latitude, phone, mode },
  );
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.loaded()), {
      timeout: 30_000,
    })
    .toBe(true);
  if (mode === 'enhanced' && zoom === 19) {
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
        ),
      )
      .toContain('arcgis');
  }
}

async function assertSlateContinuity(
  page: Page,
  editor: boolean,
  state: Awaited<ReturnType<typeof setup>>,
  errors: string[],
) {
  expect(
    await page.evaluate(
      () =>
        window.editorTestMap.getCanvas() ===
        (window as unknown as { slateCanvas: HTMLCanvasElement }).slateCanvas,
    ),
  ).toBe(true);
  for (const button of await page
    .locator(
      editor
        ? '.editor-view-controls > button:visible'
        : '.map-controls button:visible',
    )
    .all()) {
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(state.edits()).toHaveLength(0);
  expect(errors).toEqual([]);
}

for (const editor of [false, true])
  for (const phone of [false, true]) {
    const surface = `slate map ${editor ? 'editor' : 'public'} ${phone ? 'phone' : 'desktop'}`;
    for (const mode of ['enhanced', 'simple', '2d'] as const) {
      test(`${surface}: ${mode} scales`, async ({ page }, testInfo) => {
        test.setTimeout(210000);
        const { state, errors, toggle } = await setupSlate(page, editor, phone);
        if (mode !== 'enhanced') await useSimpleSlateRenderer(page, editor);
        if (mode === '2d') await toggle.press('Enter');
        for (const [name, zoom, latitude] of [
          ['campus', 15.2, 6.466],
          ['neighbourhood', 17, 6.471],
          ['building', 19, 6.47109],
        ] as const) {
          await frameSlate(page, mode, phone, zoom, latitude);
          await page.screenshot({
            path: testInfo.outputPath(`${mode}-${name}.png`),
          });
        }
        await assertSlateContinuity(page, editor, state, errors);
      });
    }
    test(`${surface}: renderer and theme continuity`, async ({ page }) => {
      test.setTimeout(210000);
      const { state, errors, toggle, paint } = await setupSlate(
        page,
        editor,
        phone,
      );
      await frameSlate(page, 'enhanced', phone, 19, 6.47109);
      await useSimpleSlateRenderer(page, editor);
      await frameSlate(page, 'simple', phone, 19, 6.47109);
      await toggle.press('Enter');
      await frameSlate(page, '2d', phone, 19, 6.47109);
      const camera = await page.evaluate(() => [
        window.editorTestMap.getCenter().toArray(),
        window.editorTestMap.getZoom(),
        window.editorTestMap.getPitch(),
        window.editorTestMap.getBearing(),
      ]);
      await page.emulateMedia({ colorScheme: 'light' });
      await expect
        .poll(() => paint('background', 'background-color'))
        .toBe('#eee9dc');
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect
        .poll(() => paint('background', 'background-color'))
        .toBe('#293e52');
      expect(
        await page.evaluate(() => [
          window.editorTestMap.getCenter().toArray(),
          window.editorTestMap.getZoom(),
          window.editorTestMap.getPitch(),
          window.editorTestMap.getBearing(),
        ]),
      ).toEqual(camera);
      await assertSlateContinuity(page, editor, state, errors);
    });
  }

test('road display source excludes unrelated campus geometry without hiding editor paths', async ({
  page,
}) => {
  await setup(page);
  const sources = await page.evaluate(async () => {
    const map = window.editorTestMap;
    const roads = (await (
      map.getSource('road-display') as import('maplibre-gl').GeoJSONSource
    ).getData()) as import('geojson').FeatureCollection;
    const campus = (await (
      map.getSource('campus') as import('maplibre-gl').GeoJSONSource
    ).getData()) as import('geojson').FeatureCollection;
    return {
      kinds: roads.features.map((f) => f.properties?.kind),
      paths: campus.features.filter((f) => f.properties?.kind === 'path')
        .length,
    };
  });
  expect(sources.kinds.length).toBeGreaterThan(0);
  expect(sources.kinds.every((kind) => kind === 'path')).toBe(true);
  expect(sources.paths).toBeGreaterThan(0);
});

test('covered paths remain selectable through the overlap chooser', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page, false, false, {
    mutateCampus: (data) => {
      const path = data.map.features.find(
        (f) => f.properties?.kind === 'path',
      )!;
      if (path.geometry.type !== 'LineString')
        throw Error('Expected test path');
      const [x, y] = path.geometry.coordinates[1];
      data.map.features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [x - 0.0002, y - 0.0002],
              [x + 0.0002, y - 0.0002],
              [x + 0.0002, y + 0.0002],
              [x - 0.0002, y + 0.0002],
              [x - 0.0002, y - 0.0002],
            ],
          ],
        },
        properties: {
          id: 'surface:96',
          sourceId: '96',
          kind: 'land',
          name: 'Tarred road',
          landClass: 'road',
          source: 'survey',
        },
      });
    },
  });
  await page.evaluate(() => {
    const source = window.editorTestMap.getSource(
      'editor-path-hits',
    ) as unknown as {
      getData: () => Promise<{
        features: { geometry: { coordinates: number[][] } }[];
      }>;
    };
    return source.getData().then(
      (data) =>
        void window.editorTestMap.jumpTo({
          center: data.features[0].geometry.coordinates[1] as [number, number],
          zoom: 19,
        }),
    );
  });
  const position = await page.evaluate(() =>
    window.editorTestMap.project(window.editorTestMap.getCenter()),
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const map = window.editorTestMap;
        const layers = map
          .queryRenderedFeatures(map.project(map.getCenter()), {
            layers: ['editor-path-hits', 'land'],
          })
          .map((f) => f.layer.id);
        return layers.includes('editor-path-hits') && layers.includes('land');
      }),
    )
    .toBe(true);
  const map = await page.locator('.maplibregl-canvas').boundingBox();
  await page.mouse.click(map!.x + position.x, map!.y + position.y);
  const chooser = page.getByRole('dialog', {
    name: 'Choose overlapping feature',
  });
  await expect(chooser).toBeVisible();
  await chooser
    .getByRole('button', { name: /Routing path/ })
    .first()
    .click();
  await expect(
    page.getByText('Routing path', { exact: true }).first(),
  ).toBeVisible();
});
