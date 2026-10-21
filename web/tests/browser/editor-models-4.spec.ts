import { collapseExplorer } from './editor-navigation';
import { test, expect } from './coverage-fixture';
import { setup } from './editor-fixture';
import { clickMap, focusCampus } from './editor-map-helpers';
import {
  openBuildingModel,
  closeBuildingModel,
  unifiedModelFixture,
} from './editor-model-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('enhanced editing keeps models through slow frames, map editing and renderer retry', async ({
  page,
}) => {
  test.setTimeout(100000);
  await setup(page);
  await focusCampus(page);
  await collapseExplorer(page);
  await clickMap(page, [3.20012, 6.46022]);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  const rendered = () =>
    page.evaluate(() =>
      JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
    );
  await expect.poll(rendered).toContain('library');
  let camera = await page.evaluate(() => [
    window.editorTestMap.getCenter().toArray(),
    window.editorTestMap.getZoom(),
    window.editorTestMap.getPitch(),
    window.editorTestMap.getBearing(),
  ]);
  // Exercise the actual renderer with 32 consecutive 70 ms frame intervals.
  // Only the timing/movement observation is controlled, not WebGL or meshes.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const map = window.editorTestMap;
        const layer = (
          map.getLayer('campus-models') as unknown as {
            implementation: import('maplibre-gl').CustomLayerInterface;
          }
        ).implementation;
        const render = layer.render;
        let frame = 0,
          clock = performance.now();
        layer.render = function (gl, args) {
          const now = performance.now,
            moving = map.isMoving;
          clock += 70;
          performance.now = () => clock;
          map.isMoving = () => true;
          try {
            render.call(this, gl, args);
          } finally {
            performance.now = now;
            map.isMoving = moving;
          }
          if (++frame < 32) map.triggerRepaint();
          else {
            layer.render = render;
            resolve();
          }
        };
        map.triggerRepaint();
      }),
  );
  await expect(
    page.getByText('Detail reduced for smoother movement'),
  ).toBeVisible();
  await expect.poll(rendered).toContain('library');
  await page.getByRole('button', { name: 'Draw path', exact: true }).click();
  await expect.poll(rendered).not.toContain('library');
  await expect(
    page.getByText('Enhanced models paused for map editing'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await clickMap(page, [3.20012, 6.46022]);
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
  camera = await page.evaluate(() => [
    window.editorTestMap.getCenter().toArray(),
    window.editorTestMap.getZoom(),
    window.editorTestMap.getPitch(),
    window.editorTestMap.getBearing(),
  ]);
  await expect.poll(rendered).toContain('library');
  await openBuildingModel(page);
  await page.getByLabel('Wall colour', { exact: true }).fill('#996633');
  await closeBuildingModel(page);
  await expect(page.getByText('Updating 3D preview…')).toHaveCount(0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const map = window.editorTestMap;
        const layer = (
          map.getLayer('campus-models') as unknown as {
            implementation: import('maplibre-gl').CustomLayerInterface;
          }
        ).implementation;
        const render = layer.render;
        layer.render = function (gl, args) {
          layer.render = render;
          const draw = gl.drawElements;
          gl.drawElements = () => {
            throw new Error('Injected enhanced render failure');
          };
          try {
            render.call(this, gl, args);
          } finally {
            gl.drawElements = draw;
            resolve();
          }
        };
        map.triggerRepaint();
      }),
  );
  await expect(
    page.getByText('Enhanced 3D is unavailable', { exact: true }),
  ).toBeVisible();
  await expect.poll(rendered).not.toContain('library');
  await page
    .getByRole('button', { name: 'Retry enhanced 3D', exact: true })
    .click();
  await expect.poll(rendered).toContain('library');
  await expect(
    page.getByText('Enhanced 3D is unavailable', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Detail reduced for smoother movement'),
  ).toHaveCount(0);
  await openBuildingModel(page);
  await expect(page.getByLabel('Wall colour', { exact: true })).toHaveValue(
    '#996633',
  );
  expect(
    await page.evaluate(() => [
      window.editorTestMap.getCenter().toArray(),
      window.editorTestMap.getZoom(),
      window.editorTestMap.getPitch(),
      window.editorTestMap.getBearing(),
    ]),
  ).toEqual(camera);
  await page.screenshot({
    path: 'test-results/building-renderer-recovery.png',
  });
});

test.describe('building roof touch editing', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('building appearance phone: ridge drawing, invalid elevations and opacity', async ({
    page,
  }) => {
    test.setTimeout(150000);
    const state = await setup(page);
    await focusCampus(page);
    const collapse = page.getByRole('button', { name: 'Collapse explorer' });
    if (await collapse.isVisible()) await collapse.click();
    await clickMap(page, [3.20012, 6.46022]);
    await page
      .getByRole('button', { name: 'Switch to 3D', exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
        ),
      )
      .toContain('library');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Building opacity', { exact: true }).fill('0.25');
    await page
      .getByRole('button', { name: 'Close settings', exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
        ),
      )
      .toContain('library');
    const model = await openBuildingModel(page, 'roof');
    await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
    await page.getByRole('button', { name: 'Create custom roof' }).click();
    await model
      .getByRole('button', { name: 'Edit surface', exact: true })
      .click();
    await model.getByRole('button', { name: 'Edit roof', exact: true }).click();
    await page.getByRole('button', { name: 'Draw ridge', exact: true }).click();
    const plan = page.getByLabel('Roof plan drawing', { exact: true });
    for (const [x, y] of [
      [140, 150],
      [140, 240],
    ]) {
      await plan.scrollIntoViewIfNeeded();
      const point = await plan.evaluate(
        (element, [x, y]) => {
          const matrix = (element as SVGSVGElement).getScreenCTM()!;
          const point = new DOMPoint(x, y).matrixTransform(matrix);
          return { x: point.x, y: point.y };
        },
        [x, y],
      );
      await page.touchscreen.tap(point.x, point.y);
    }
    await model.getByRole('button', { name: 'Edit roof', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Remove ridge 1' }),
    ).toBeVisible();
    await page.getByLabel('Point elevation (m)', { exact: true }).fill('50');
    await page
      .getByLabel('Point elevation (m)', { exact: true })
      .press('Enter');
    await expect(
      page.getByLabel('Point elevation (m)', { exact: true }),
    ).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Point elevation (m)', { exact: true }).fill('14.5');
    await page
      .getByLabel('Point elevation (m)', { exact: true })
      .press('Enter');
    await expect(
      page.getByLabel('Point elevation (m)', { exact: true }),
    ).toHaveAttribute('aria-invalid', 'false');
    await expect
      .poll(
        () =>
          state.edits().find((e) => e.id === 'library')?.properties.appearance
            ?.roofs?.['library:wing:0']?.lines.length,
      )
      .toBe(1);
    await page
      .getByLabel('Roof surface', { exact: true })
      .selectOption({ index: 1 });
    await page
      .getByRole('button', { name: 'Done editing roof', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Edit custom roof', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: 'test-results/building-phone-roof.png' });
  });
});

test('model workspace desktop docks stay bounded through resize and zoom-sized viewports', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  const { dialog, wall } = await unifiedModelFixture(page);
  const width = dialog.getByLabel('Width (m)', { exact: true });
  await width.fill('1.8');
  await width.press('Enter');
  await expect.poll(() => wall()?.elements[0].width).toBe(1.8);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    // Available CSS pixels at 125% and 150% zoom on a 1440x900 display.
    { width: 1152, height: 720 },
    { width: 960, height: 600 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        dialog.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return [
            Math.round(r.x),
            Math.round(r.y),
            Math.round(r.width),
            Math.round(r.height),
          ];
        }),
      )
      .toEqual([0, 0, viewport.width, viewport.height]);
    const stage = (await dialog.locator('.model-stage').boundingBox())!;
    const inspector = (await dialog.locator('.model-inspector').boundingBox())!;
    expect(stage.width).toBeGreaterThan(360);
    expect(stage.height).toBeGreaterThan(220);
    expect(stage.x + stage.width).toBeLessThanOrEqual(inspector.x + 1);
    expect(inspector.x + inspector.width).toBeLessThanOrEqual(viewport.width);
    await expect(width).toHaveValue('1.8');
    await expect(
      dialog.getByRole('button', { name: 'Back to map', exact: true }),
    ).toBeInViewport();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: info.outputPath('desktop-model-workspace.png'),
  });
  const surface = dialog.getByRole('application', { name: /Wall canvas/ });
  const before = (await surface.boundingBox())!.width;
  await dialog
    .getByRole('button', { name: 'Hide structure', exact: true })
    .click();
  await expect(
    dialog.getByRole('complementary', { name: 'Building hierarchy' }),
  ).toBeHidden();
  await expect
    .poll(async () => (await surface.boundingBox())!.width)
    .toBeGreaterThan(before);
  await dialog
    .getByRole('button', { name: 'Show structure', exact: true })
    .click();
  await dialog
    .getByRole('treeitem', { name: 'Library', exact: true })
    .locator(':scope > .model-tree-row')
    .click();
  await expect(dialog.locator('.model-property-target')).toContainText(
    'Whole building · defaults',
  );
  await expect(
    dialog.getByLabel('Building or wing', { exact: true }),
  ).toHaveValue('');
  await expect(
    dialog.locator('.model-detail-item[aria-selected="true"]'),
  ).toHaveCount(0);
  await expect(
    dialog.locator('[data-model-wall][aria-selected="true"]'),
  ).toHaveCount(0);
  await expect(dialog.locator('.photo-model-canvas canvas')).toBeVisible();
  await expect
    .poll(async () => {
      const preview = (await dialog
        .locator('.photo-model-canvas')
        .boundingBox())!;
      const stage = (await dialog.locator('.model-stage').boundingBox())!;
      return stage.width - preview.width;
    })
    .toBeLessThanOrEqual(26);
  await page.screenshot({ path: info.outputPath('desktop-model-3d.png') });
  await dialog.getByRole('button', { name: 'Outline', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Edit surface', exact: true })
    .click();
  await expect(
    dialog.locator('.model-stage').getByLabel('Top-down building outline'),
  ).toBeVisible();
  await expect(
    dialog.locator('.model-inspector').getByLabel('Outline vertex'),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Back to map', exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Edit model', exact: true }),
  ).toBeFocused();
  expect(failures).toEqual([]);
});

test('model workspace creation starts with a footprint and reopens its saved model', async ({
  page,
}) => {
  const server = await setup(page);
  await focusCampus(page);
  await page.getByRole('button', { name: 'Create model', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Finish', exact: true }),
  ).toBeDisabled();
  for (const point of [
    [3.19985, 6.4602],
    [3.19985, 6.46035],
    [3.19995, 6.46035],
    [3.19995, 6.4602],
  ] as [number, number][])
    await clickMap(page, point);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect
    .poll(() => server.edits().some((edit) => edit.kind === 'building'))
    .toBe(true);
  await page.getByRole('button', { name: 'Edit model', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Appearance', exact: true }).click();
  await dialog.getByLabel('Building height (m)', { exact: true }).fill('8');
  await dialog
    .getByLabel('Building height (m)', { exact: true })
    .press('Enter');
  await expect
    .poll(
      () =>
        server.edits().find((edit) => edit.kind === 'building')?.properties
          .height,
    )
    .toBe(8);
  await dialog
    .getByRole('button', { name: 'Back to map', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit model', exact: true }).click();
  await dialog.getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(
    dialog.getByLabel('Building height (m)', { exact: true }),
  ).toHaveValue('8');
});
