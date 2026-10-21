import { test, expect } from './coverage-fixture';
import { readFileSync } from 'node:fs';
import { setup } from './editor-fixture';
import { position } from './editor-map-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('campus layer feature search resets the real scroll position and keeps results reachable', async ({
  page,
}) => {
  await setup(page, false, false, {
    mutateCampus(data) {
      const building = data.map.features.find(
        (f) => f.properties?.kind === 'building',
      )!;
      data.map.features.push(
        ...Array.from({ length: 600 }, (_, i) => ({
          ...building,
          properties: {
            ...building.properties,
            id: `audit-${i}`,
            name: `Audit building ${i}`,
            sourceId: `source-${i}`,
          },
        })),
      );
    },
  });
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const workspace = page.getByRole('region', { name: 'Campus layers' });
  await workspace.getByRole('tab', { name: 'Layers', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  if ((page.viewportSize()?.width || 0) < 1200)
    await expect(page.getByLabel('Search layer features')).toBeFocused();
  else
    await expect(
      workspace.getByRole('tab', { name: /^Features/ }),
    ).toBeFocused();
  const attributes = page.getByRole('region', {
    name: 'Layer attributes',
    exact: true,
  });
  await attributes.getByLabel('Search layer features').fill('Audit building');
  const selectShown = attributes.getByRole('checkbox', {
    name: /Select shown results/,
  });
  await selectShown.check();
  await expect(selectShown).toBeChecked();
  await expect(attributes.getByText(/500 selected/)).toBeVisible();
  await attributes
    .locator('.layer-table input[type=checkbox]')
    .first()
    .uncheck();
  await expect(selectShown).toHaveJSProperty('indeterminate', true);
  await selectShown.check();
  await selectShown.uncheck();
  const scroller = attributes.locator('.layer-table');
  await scroller.evaluate((el) => {
    el.scrollTop = 9000;
  });
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(8000);
  await attributes.getByLabel('Search layer features').fill('Audit building 1');
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(
    attributes.getByRole('button', {
      name: 'Edit Audit building 1 · source-1',
      exact: true,
    }),
  ).toBeInViewport();
  await attributes.getByLabel('Search layer features').fill('source-299');
  await expect(
    attributes.getByRole('button', {
      name: 'Edit Audit building 299 · source-299',
      exact: true,
    }),
  ).toBeInViewport();
  await expect(attributes.getByRole('row')).toHaveCount(2);
});

test('campus layer explorer saves folders and release visibility', async ({
  page,
}) => {
  test.setTimeout(120000);
  const state = await setup(page);
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const workspace = page.getByRole('region', { name: 'Campus layers' });
  await expect(workspace).toBeVisible();
  await workspace.getByText('Create layer or folder', { exact: true }).click();
  await workspace.getByLabel('New layer name').fill('Survey reference');
  await workspace.getByLabel('New layer role').selectOption('overlay');
  await workspace.getByRole('button', { name: 'Create', exact: true }).click();
  await expect
    .poll(
      () =>
        state.edits().filter((e) => e.kind === 'layer' && !e.deleted).length,
    )
    .toBe(1);
  await workspace.getByLabel('Published visibility', { exact: true }).uncheck();
  await workspace.getByRole('button', { name: 'Apply layer settings' }).click();
  await expect
    .poll(
      () =>
        state.edits().find((e) => e.kind === 'layer')?.properties
          .layerDefinition!.publishedVisible,
    )
    .toBe(false);
  await page.reload();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await workspace
    .getByRole('button', { name: /Survey reference.*Overlays/ })
    .click();
  await expect(
    workspace.getByLabel('Published visibility', { exact: true }),
  ).not.toBeChecked();
  await page.screenshot({ path: 'test-results/campus-layer-explorer.png' });
});

test('campus layers polygon 96 preserves vertices and holes through property and geometry saves', async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const changes = JSON.parse(
    readFileSync(
      new URL('../../../data/unilag-enrichment/changes.json', import.meta.url),
      'utf8',
    ),
  );
  const roads = changes.featureAdds.filter(
    (f: { properties: Record<string, unknown> }) =>
      f.properties.source === 'import:bd74d5cc-2b8d-4d42-977a-00165dc70b7e',
  );
  const road = roads.find(
    (f: { properties: Record<string, unknown> }) =>
      f.properties.sourceId === '96',
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const server = await setup(page, false, false, {
    mutateCampus(data) {
      data.map.features.push(...roads);
      data.bounds = [
        [3.19, 6.45],
        [3.41, 6.53],
      ];
    },
  });
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const workspace = page.getByRole('region', { name: 'Campus layers' });
  await workspace.getByRole('button', { name: /Road surfaces/ }).click();
  await workspace.getByRole('tab', { name: /^Features/ }).click();
  await expect(
    page
      .getByRole('region', { name: 'Layer attributes', exact: true })
      .getByRole('heading', { name: 'Features · 179', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('region', { name: 'Layer attributes', exact: true })
    .getByLabel('Search layer features')
    .fill('96');
  await page
    .getByRole('region', { name: 'Layer attributes', exact: true })
    .getByRole('button', { name: /Edit .* · 96$/ })
    .click();
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Reviewed road 96');
  await page.getByRole('spinbutton', { name: 'Width', exact: true }).fill('7');
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === road.properties.id)?.properties
          .width,
    )
    .toBe(7);
  expect(
    server.edits().find((e) => e.id === road.properties.id)!.geometry,
  ).toEqual(road.geometry);
  await page
    .getByRole('button', {
      name: 'Parts, holes and geometry tools',
      exact: true,
    })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Geometry operation' });
  await dialog
    .getByRole('combobox', { name: 'Ring', exact: true })
    .selectOption('45');
  await dialog
    .getByRole('button', { name: 'Edit next 100 vertices on map' })
    .click();
  await expect(page.getByText(/Editing vertices .*hole 45/)).toBeVisible();
  await workspace.getByRole('button', { name: 'Close layers' }).click();
  const point = road.geometry.coordinates[45][1];
  await page.evaluate(
    (point) =>
      window.editorTestMap.jumpTo({
        center: point,
        zoom: 22,
        pitch: 0,
        bearing: 0,
      }),
    point,
  );
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.areTilesLoaded()))
    .toBe(true);
  const pixel = await position(page, point);
  await page.mouse.move(pixel.x, pixel.y);
  await page.mouse.down();
  await page.mouse.move(pixel.x + 4, pixel.y + 3, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() =>
      JSON.stringify(
        server.edits().find((e) => e.id === road.properties.id)?.geometry,
      ),
    )
    .not.toBe(JSON.stringify(road.geometry));
  const saved = server.edits().find((e) => e.id === road.properties.id)!;
  expect(saved.geometry.type).toBe('Polygon');
  if (saved.geometry.type !== 'Polygon') throw Error('Expected polygon');
  expect(saved.geometry.coordinates).toHaveLength(57);
  expect(saved.geometry.coordinates.flat().length).toBe(6094);
  expect(saved.geometry.coordinates[44]).toEqual(road.geometry.coordinates[44]);
  // This case verifies persisted geometry, so wait for acknowledgement and map
  // processing. Reloading during Vite's injected worker env-module startup emits
  // a WebKit development-server import error unrelated to the saved polygon.
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  await page.waitForFunction(() => window.editorTestMap.loaded());
  await page.reload();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await workspace.getByRole('button', { name: /Road surfaces/ }).click();
  await workspace.getByRole('tab', { name: /^Features/ }).click();
  await page
    .getByRole('region', { name: 'Layer attributes', exact: true })
    .getByLabel('Search layer features')
    .fill('96');
  await page
    .getByRole('region', { name: 'Layer attributes', exact: true })
    .getByRole('button', { name: /Edit Reviewed road 96 · 96$/ })
    .click();
  await expect(
    page.getByRole('spinbutton', { name: 'Width', exact: true }),
  ).toHaveValue('7');
  await page.screenshot({
    path: testInfo.outputPath('polygon-96-reloaded.png'),
  });
  expect(errors).toEqual([]);
});
