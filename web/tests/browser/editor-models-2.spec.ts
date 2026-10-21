import { Color } from 'three';
import { test, expect } from './coverage-fixture';
import { createHash } from 'node:crypto';
import { createBuildingModel } from '../../src/building-model';
import { buildingRevision } from '../../src/building-visuals';
import type { BuildingVisual } from '../../src/visual-types';
import { setup } from './editor-fixture';
import {
  attachMap,
  position,
  clickMap,
  focusCampus,
} from './editor-map-helpers';
import { focusModels } from './editor-model-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

for (const editor of [false, true])
  test(`enhanced zoom restores visible facade detail on the ${editor ? 'editor' : 'public map'}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(150000);
    await page.emulateMedia({ colorScheme: 'dark' });
    const sectorUrl = '/packages/visual-abcdef/zoom-test.json';
    let sectorBody = '';
    let expectedColours: number[][] = [];
    await page
      .context()
      .route(`**${sectorUrl}`, (route) =>
        route.fulfill({ body: sectorBody, contentType: 'application/json' }),
      );
    await setup(page, false, false, {
      mutateCampus(data) {
        const feature = data.map.features.find(
          (f) => f.properties?.id === 'library',
        )!;
        const visual: BuildingVisual = {
          id: 'library',
          name: 'Library',
          geometryRevision: buildingRevision(feature),
          level: 'detailed',
          height: 15,
          heightKind: 'recorded',
          roofForm: 'hip',
          wallColour: '#ddccbb',
          roofColour: '#aa5533',
          confidence: 'inferred',
          sources: [],
          observed: [],
          inferred: [],
          needed: [],
          sectorId: 'zoom-test',
        };
        const model = createBuildingModel(
          feature as import('geojson').Feature<import('geojson').Polygon>,
          visual,
        );
        expectedColours = model.meshes.map((mesh) =>
          new Color(mesh.colour).toArray(),
        );
        // Exercise old packages without surface metadata as well as current meshes.
        if (!editor) for (const mesh of model.meshes) delete mesh.surfaces;
        sectorBody = JSON.stringify({
          schemaVersion: 1,
          id: 'zoom-test',
          models: [model],
        });
        const bytes = Buffer.byteLength(sectorBody);
        data.visuals = {
          schemaVersion: 1,
          revision: 'zoom-test',
          buildings: [visual],
          references: [],
          bytes,
          sectors: [
            {
              id: 'zoom-test',
              url: sectorUrl,
              bytes,
              sha256: createHash('sha256').update(sectorBody).digest('hex'),
              bounds: [
                [3.2001, 6.4602],
                [3.2004, 6.4604],
              ],
              buildingIds: ['library'],
            },
          ],
        };
      },
    });
    if (!editor) {
      await page.goto('/');
      await attachMap(page);
    } else
      await page
        .getByRole('button', { name: 'Switch to 3D', exact: true })
        .click();
    await page.evaluate(
      () =>
        void window.editorTestMap.jumpTo({
          center: [3.20025, 6.4603],
          zoom: 18,
          pitch: 50,
          bearing: 0,
          padding: { top: 0, bottom: 0, left: 0, right: 0 },
        }),
    );
    const rendered = () =>
      page.evaluate(() =>
        JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
      );
    await expect.poll(rendered).toContain('library');
    // Count actual Three.js draw calls, not merely the presence of a model ID.
    // Keep real camera gestures and WebGL; only simulate slow frame timing.
    await page.evaluate(() => {
      const map = window.editorTestMap;
      const layer = (
        map.getLayer('campus-models') as unknown as {
          implementation: import('maplibre-gl').CustomLayerInterface;
        }
      ).implementation;
      const render = layer.render;
      const stats = {
        calls: 0,
        indices: 0,
        moving: false,
        slow: false,
        reducedSeen: false,
        frameMs: [] as number[],
        collectColours: true,
        colours: [] as number[][],
      };
      (window as unknown as { zoomDetail: typeof stats }).zoomDetail = stats;
      let clock = performance.now();
      layer.render = function (gl, args) {
        const draw = gl.drawElements,
          now = performance.now;
        const started = now.call(performance);
        stats.calls = 0;
        stats.indices = 0;
        stats.moving = map.isMoving();
        const collectColours = stats.collectColours;
        if (collectColours) stats.colours = [];
        gl.drawElements = function (mode, count, type, offset) {
          stats.calls++;
          stats.indices += count;
          if (collectColours) {
            const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;
            const diffuse = gl.getUniformLocation(program, 'diffuse');
            if (diffuse)
              stats.colours.push(
                Array.from(gl.getUniform(program, diffuse) as Float32Array),
              );
          }
          return draw.call(this, mode, count, type, offset);
        };
        if (stats.slow && map.isMoving()) {
          clock += 70;
          performance.now = () => clock;
        }
        try {
          render.call(this, gl, args);
        } finally {
          gl.drawElements = draw;
          performance.now = now;
          if (!stats.slow && !collectColours)
            stats.frameMs.push(now.call(performance) - started);
          stats.collectColours = false;
        }
        if (
          document
            .querySelector('.map-detail-status')
            ?.textContent?.includes('Detail reduced')
        )
          stats.reducedSeen = true;
      };
      map.triggerRepaint();
    });
    const drawing = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              zoomDetail: {
                calls: number;
                indices: number;
                moving: boolean;
                reducedSeen: boolean;
                frameMs: number[];
                colours: number[][];
              };
            }
          ).zoomDetail,
      );
    await expect.poll(async () => (await drawing()).calls).toBeGreaterThan(2);
    const full = await drawing();
    const checkColours = async () => {
      const { colours } = await drawing();
      // Transparent DoubleSide materials draw front and back faces separately.
      expect(colours.length).toBeGreaterThanOrEqual(expectedColours.length);
      for (const colour of expectedColours)
        expect(colours).toContainEqual(
          colour.map((channel) => expect.closeTo(channel, 5)),
        );
      for (const colour of colours)
        expect(expectedColours).toContainEqual(
          colour.map((channel) => expect.closeTo(channel, 5)),
        );
    };
    // Read the actual shader's diffuse values: walls, roofs, windows and trim
    // must retain their source RGB, rather than merely retaining saved swatches.
    await checkColours();
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator('html')).toHaveClass(
        colorScheme === 'dark' ? /dark/ : /^(?!.*dark)/,
      );
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.editorTestMap.getPaintProperty(
              'background',
              'background-color',
            ),
          ),
        )
        .toBe(colorScheme === 'dark' ? '#293e52' : '#eee9dc');
      await page.evaluate(() => {
        const stats = (
          window as unknown as {
            zoomDetail: { collectColours: boolean; colours: number[][] };
          }
        ).zoomDetail;
        stats.colours = [];
        stats.collectColours = true;
        window.editorTestMap.triggerRepaint();
      });
      await expect
        .poll(async () => (await drawing()).colours.length)
        .toBeGreaterThanOrEqual(expectedColours.length);
      await checkColours();
      expect((await drawing()).indices).toBe(full.indices);
    }
    await page.evaluate(() => {
      (window as unknown as { zoomDetail: { slow: boolean } }).zoomDetail.slow =
        true;
      // Software-rendered CI can produce too few frames in a fixed five-second
      // gesture. Keep moving until the slow-frame response is observed, then
      // end the real gesture and verify that its moveend restores full detail.
      window.editorTestMap.easeTo({ zoom: 18.5, duration: 30000 });
    });
    await expect
      .poll(async () => (await drawing()).reducedSeen, { timeout: 30000 })
      .toBe(true);
    await page.evaluate(() => void window.editorTestMap.stop());
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
      .toBe(false);
    await expect(
      page.getByText('Detail reduced for smoother movement'),
    ).toHaveCount(0);
    await expect.poll(async () => (await drawing()).indices).toBe(full.indices);
    await page.evaluate(() => {
      (window as unknown as { zoomDetail: { slow: boolean } }).zoomDetail.slow =
        false;
    });
    // Cross both LOD boundaries repeatedly without touching the view toggle.
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.evaluate(
        () => void window.editorTestMap.jumpTo({ zoom: 14.9 }),
      );
      await expect.poll(rendered).not.toContain('library');
      await page.evaluate(() => void window.editorTestMap.jumpTo({ zoom: 16 }));
      await expect.poll(rendered).toContain('library');
      await expect
        .poll(async () => (await drawing()).indices)
        .toBeLessThan(full.indices);
      await page.evaluate(() => void window.editorTestMap.jumpTo({ zoom: 18 }));
      await expect
        .poll(async () => (await drawing()).indices)
        .toBe(full.indices);
    }
    const measured = await drawing();
    const durations = measured.frameMs.slice().sort((a, b) => a - b);
    await testInfo.attach('renderer-performance', {
      body: JSON.stringify({
        calls: full.calls,
        indices: full.indices,
        samples: durations.length,
        medianMs: durations[Math.floor(durations.length / 2)],
        p95Ms: durations[Math.floor(durations.length * 0.95)],
      }),
      contentType: 'application/json',
    });
    await page.screenshot({
      path: `test-results/zoom-detail-${editor ? 'editor' : 'public'}-${page.viewportSize()?.width}.png`,
    });
  });

test('miniature models fall back for unavailable sectors and keep drawing unobstructed', async ({
  page,
}) => {
  test.setTimeout(120000);
  const { campus } = await setup(page, true, true);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await focusModels(page);
  const roof = await position(page, [3.19978, 6.47109]);
  await page.mouse.click(roof.x, roof.y - 12);
  await expect(
    page.getByRole('complementary', { name: 'Feature properties' }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Name', exact: true }),
  ).toHaveValue('LASU Senate Building');
  await page.getByRole('button', { name: 'Close properties' }).click();
  await page.getByRole('button', { name: 'Draw path', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
      ),
    )
    .not.toContain('arcgis:University_Property:120');
  await expect(
    page.getByRole('button', { name: 'Finish', exact: true }),
  ).toBeDisabled();
  await clickMap(page, [3.19945, 6.47115]);
  await expect(page.locator('.drawing-progress')).toContainText('1');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await focusModels(page);
  for (const sector of campus.visuals!.sectors)
    await page.route(`**${sector.url}`, (route) =>
      route.fulfill({ status: 503, body: 'Unavailable' }),
    );
  await page.reload();
  await attachMap(page);
  await page.evaluate(
    () =>
      void window.editorTestMap.jumpTo({
        center: [3.19978, 6.47109],
        zoom: 18,
        pitch: 50,
      }),
  );
  await expect(
    page.getByRole('button', { name: 'Switch to 2D', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
      ),
    )
    .not.toContain('arcgis:University_Property:120');
});

test('public map defaults to 3D, frames campus and opens building details', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Campus map:'))
      errors.push(message.text());
  });
  await setup(page);
  await page.goto('/');
  await attachMap(page);
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
    .toBe(45);
  const heights = await page.evaluate(async () => {
    const source = window.editorTestMap.getSource(
      'campus',
    ) as import('maplibre-gl').GeoJSONSource;
    const data =
      (await source.getData()) as import('geojson').FeatureCollection;
    return data.features
      .filter((f) => f.properties?.kind === 'building')
      .map((f) => [
        f.properties?.id,
        f.properties?.displayHeight,
        f.properties?.heightKind,
      ]);
  });
  expect(heights).toContainEqual(['unknown-building', 6, 'illustrative']);
  expect(heights).toContainEqual(['library', 15, 'recorded']);
  await page.getByRole('button', { name: 'Switch to 2D', exact: true }).click();
  await page.reload();
  await attachMap(page);
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
    .toBe(0);
  await focusCampus(page);
  await clickMap(page, [3.20012, 6.46022]);
  await expect(page.getByText('15 m · recorded height')).toBeVisible();
  await page.evaluate(
    () =>
      void window.editorTestMap.jumpTo({
        center: [3.2007, 6.4603],
        zoom: 19,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
  );
  await clickMap(page, [3.2007, 6.4603]);
  await expect(page.getByRole('dialog')).toContainText(
    'Height unknown · illustrative 6 m block',
  );
  await expect(
    page.getByRole('button', { name: 'Report building details' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
