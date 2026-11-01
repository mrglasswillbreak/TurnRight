import { collapseExplorer } from './editor-navigation';
import { test, expect } from './coverage-fixture';
import { browserRecovery, setup } from './editor-fixture';
import {
  attachMap,
  waitForMapLayout,
  clickMap,
  focusCampus,
} from './editor-map-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

for (const threeD of [false, true])
  test(`map two entrances and their approaches in ${threeD ? '3D' : '2D'}, save and reload`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const server = await setup(page);
    await focusCampus(page);
    if (threeD) {
      await page
        .getByRole('button', { name: 'Switch to 3D', exact: true })
        .click();
      await expect
        .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
        .toBeGreaterThan(45);
    }
    await collapseExplorer(page);
    for (const [i, x] of [3.20018, 3.20033].entries()) {
      await page.evaluate(
        (threeD) =>
          void window.editorTestMap.jumpTo({
            center: [3.2003, 6.4602],
            zoom: 19,
            pitch: threeD ? 50 : 0,
            padding: { top: 0, bottom: 0, left: 0, right: 0 },
          }),
        threeD,
      );
      // Select the existing building surface, then use its entrance action.
      await clickMap(page, [3.20012, 6.46022]);
      await expect(
        page.getByRole('complementary', { name: 'Feature properties' }),
      ).toBeVisible();
      await page
        .getByRole('complementary', { name: 'Feature properties' })
        .getByRole('button', { name: 'Add entrance', exact: true })
        .click();
      await clickMap(page, [x, 6.4602]);
      const inspector = page.getByRole('complementary', {
        name: 'Feature properties',
      });
      await expect(
        inspector.getByRole('button', { name: 'Draw connecting path' }),
      ).toBeVisible();
      await inspector
        .getByLabel('Name', { exact: true })
        .fill(`Library entrance ${i + 1}`);
      await inspector
        .getByRole('button', { name: 'Draw connecting path' })
        .click();
      // Reframe the ground target after selection and dock resizing, as an
      // owner would before placing a connecting point outside the current view.
      await page.evaluate(
        (x) => void window.editorTestMap.panTo([x, 6.46], { duration: 0 }),
        x,
      );
      await clickMap(page, [x, 6.46]);
      await page.getByRole('button', { name: 'Finish', exact: true }).click();
      await expect(
        inspector.getByText('Path connections', { exact: true }),
      ).toBeVisible();
      await expect
        .poll(() => server.edits().filter((e) => e.kind === 'path').length)
        .toBe(i + 1);
    }
    expect(
      server
        .edits()
        .filter((e) => e.kind === 'entrance' && e.properties.connection),
    ).toHaveLength(2);
    await expect(page.locator('.editor-save-state')).toHaveText('Saved');
    const camera = await page.evaluate(() => {
      const m = window.editorTestMap;
      return [m.getCenter().lng, m.getCenter().lat, m.getZoom(), m.getPitch()];
    });
    await page
      .getByRole('button', { name: 'Compare base', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Back to draft', exact: true })
      .click();
    expect(
      await page.evaluate(() => {
        const m = window.editorTestMap;
        return [
          m.getCenter().lng,
          m.getCenter().lat,
          m.getZoom(),
          m.getPitch(),
        ];
      }),
    ).toEqual(camera);
    await page.reload();
    await attachMap(page);
    const explorer = page.getByRole('button', {
      name: 'Toggle explorer',
      exact: true,
    });
    if ((await explorer.getAttribute('aria-pressed')) !== 'true')
      await explorer.click();
    await page.getByRole('button', { name: 'Test route', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Route test', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Test route From').selectOption('gate');
    await page.getByLabel('Test route To').selectOption('library');
    await page
      .getByRole('button', { name: 'Preview route', exact: true })
      .click();
    await expect(page.getByText(/Arrive at Library entrance 1/)).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
      .toBe(false);
    await page.screenshot({
      path: `test-results/editor-${threeD ? '3d' : '2d'}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });

test('edits a path vertex in 3D with undo and redo across autosave', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const server = await setup(page);
  await focusCampus(page);
  await collapseExplorer(page);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
  await page.getByRole('button', { name: 'Draw path', exact: true }).click();
  await clickMap(page, [3.2006, 6.46]);
  await clickMap(page, [3.2006, 6.4601]);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  const original = structuredClone(
    server.edits().find((e) => e.kind === 'path')!.geometry,
  );
  await waitForMapLayout(page);
  // Finishing opens Properties; both points must use its settled map transform.
  const [from, to] = await page.evaluate(() => {
    const map = window.editorTestMap,
      rect = map.getCanvas().getBoundingClientRect();
    return [
      [3.2006, 6.4601],
      [3.20065, 6.46012],
    ].map(([lng, lat]) => {
      const point = map.project([lng, lat]);
      return { x: rect.left + point.x, y: rect.top + point.y };
    });
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(() =>
      JSON.stringify(server.edits().find((e) => e.kind === 'path')!.geometry),
    )
    .not.toBe(JSON.stringify(original));
  await page.keyboard.press('Control+z');
  await expect
    .poll(() => server.edits().find((e) => e.kind === 'path')!.geometry)
    .toEqual(original);
  await page.keyboard.press('Control+Shift+z');
  await expect
    .poll(() =>
      JSON.stringify(server.edits().find((e) => e.kind === 'path')!.geometry),
    )
    .not.toBe(JSON.stringify(original));
  expect(errors).toEqual([]);
});

test('recovers unfinished geometry and preserves it when switching 2D/3D', async ({
  page,
}) => {
  await setup(page);
  await focusCampus(page);
  await page.getByRole('button', { name: 'Draw path', exact: true }).click();
  await expect(page.locator('.drawing-progress')).toContainText('first point');
  await expect
    .poll(async () => (await browserRecovery(page))?.unfinished?.kind)
    .toBe('path');
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await attachMap(page);
  await expect(page.getByText('Unfinished drawing recovered')).toBeVisible();
  await page.getByRole('button', { name: 'Resume drawing' }).click();
  await expect(
    page.getByRole('button', { name: 'Finish', exact: true }),
  ).toBeDisabled();
  await focusCampus(page);
  await clickMap(page, [3.2005, 6.4601]);
  await clickMap(page, [3.2006, 6.4601]);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toHaveText('Saved locally');
  await expect
    .poll(async () => {
      const geometry = (await browserRecovery(page))?.unfinished?.geometry;
      return geometry?.type === 'LineString' ? geometry.coordinates.length : 0;
    })
    .toBe(2);
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await attachMap(page);
  await expect(page.getByText('Unfinished drawing recovered')).toBeVisible();
  await page.getByRole('button', { name: 'Resume drawing' }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(
    page.getByRole('complementary', { name: 'Feature properties' }),
  ).toBeVisible();
});

test('public cards: compact start, drag sizing, remembered heights and keyboard limits', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto('/');
  await attachMap(page);
  const panel = page.locator('.explore-panel');
  const handle = page.getByRole('slider', { name: 'Resize search panel' });
  await expect(handle).toHaveAttribute('aria-valuenow', '96');
  await expect(
    page.getByRole('button', { name: 'Settings', exact: true }),
  ).toBeHidden();
  expect((await panel.boundingBox())!.y).toBeGreaterThan(700);
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    grip.x + grip.width / 2,
    grip.y + grip.height / 2 - 300,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '396');
  await expect(
    page.getByRole('button', { name: 'Settings', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Collapse card' }).click();
  await page.reload();
  await attachMap(page);
  await expect(handle).toHaveAttribute('aria-valuenow', '96');
  await page.getByRole('button', { name: 'Expand card' }).click();
  await expect(handle).toHaveAttribute('aria-valuenow', '396');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialogHandle = page.getByRole('slider', { name: 'Resize dialog' });
  await dialogHandle.press('Home');
  await expect(dialogHandle).toHaveAttribute('aria-valuenow', '220');
  await expect(
    page.getByRole('button', { name: 'Close', exact: true }),
  ).toBeVisible();
  await dialogHandle.press('ArrowUp');
  await expect(dialogHandle).toHaveAttribute('aria-valuenow', '252');
  await dialogHandle.press('End');
  await expect(dialogHandle).toHaveAttribute('aria-valuenow', '743');
  const dialog = (await page.getByRole('dialog').boundingBox())!;
  expect(dialog.y).toBeGreaterThan(80);
  expect(dialog.y + dialog.height).toBeLessThanOrEqual(844);
  await dialogHandle.press('Home');
  await dialogHandle.press('ArrowUp');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await attachMap(page);
  await page.getByRole('button', { name: 'Expand card' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(dialogHandle).toHaveAttribute('aria-valuenow', '252');
});

test('public phone search keeps a mouse click through search-field blur', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto('/');
  await attachMap(page);
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search campus' }).fill('Library');
  await page
    .getByRole('button', { name: 'Library Library · Ojo campus', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Library', exact: true }),
  ).toBeVisible({
    timeout: 5000,
  });
});

test('slate map badges select places and street labels omit generic names', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const state = await setup(page, false, false, {
    mutateCampus(data) {
      data.map.features[0].properties!.name = 'LAW road';
      data.map.features.push({
        ...structuredClone(data.map.features[0]),
        properties: {
          ...data.map.features[0].properties,
          id: 'unnamed-path',
          name: 'Campus path',
        },
      });
    },
  });
  await page.goto('/');
  await attachMap(page);
  await focusCampus(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTestMap
          .queryRenderedFeatures({ layers: ['street-labels'] })
          .map((f) => f.properties?.streetLabel),
      ),
    )
    .toContain('LAW road');
  expect(
    await page.evaluate(() =>
      window.editorTestMap
        .queryRenderedFeatures({ layers: ['street-labels'] })
        .some((f) => f.properties?.streetLabel === 'Campus path'),
    ),
  ).toBe(false);
  const point = state.campus.places[0].coordinates;
  await expect
    .poll(() =>
      page.evaluate(
        (point) =>
          window.editorTestMap
            .queryRenderedFeatures(window.editorTestMap.project(point), {
              layers: ['places-label'],
            })
            .map((f) => f.properties?.id),
        point,
      ),
    )
    .toContain(state.campus.places[0].id);
  await clickMap(page, point);
  await expect(
    page.getByRole('button', { name: 'Directions', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTestMap
          .queryRenderedFeatures({ layers: ['places-label-selected'] })
          .map((feature) => feature.properties?.id),
      ),
    )
    .toEqual([state.campus.places[0].id]);
  await page.screenshot({
    path: testInfo.outputPath('selected-badge-and-street.png'),
  });
  expect(state.edits()).toHaveLength(0);
});
