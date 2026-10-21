import { test, expect } from './coverage-fixture';
import { setup } from './editor-fixture';
import { attachMap } from './editor-map-helpers';
import { unifiedModelFixture } from './editor-model-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('surface workspace tree keyboard focus, search and repeated detail detachment', async ({
  page,
}) => {
  const { dialog, wall } = await unifiedModelFixture(page);
  const tree = dialog.getByRole('tree', { name: 'Model structure' });
  const row = tree.getByRole('treeitem', { name: 'Window', exact: true });
  await row.focus();
  await row.press('Home');
  await expect(
    tree.getByRole('treeitem', { name: 'Library', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    tree.getByRole('treeitem', { name: 'Footprint', exact: true }),
  ).toBeFocused();
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('w');
  await expect(
    tree.getByRole('treeitem', { name: 'Wing 1', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(
    tree.getByRole('treeitem', { name: 'Wing 1', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  await dialog.getByLabel('Find model parts').fill('Window');
  await expect(row).toBeVisible();
  await dialog.getByLabel('Find model parts').fill('');
  await expect(row).toBeHidden();
  await tree
    .getByRole('treeitem', { name: 'Wing 1', exact: true })
    .press('ArrowRight');
  await row.click();
  await dialog.getByLabel('Repeat count', { exact: true }).fill('2');
  await dialog.getByLabel('Repeat count', { exact: true }).press('Enter');
  await dialog
    .getByLabel('Selected item actions', { exact: true })
    .getByRole('button', { name: 'Detach instance', exact: true })
    .click();
  await expect.poll(() => wall()?.elements.length).toBe(2);
  expect(wall()?.elements.every((e) => e.count === 1)).toBe(true);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => wall()?.elements.length).toBe(1);
  expect(wall()?.elements[0].count).toBe(2);
});

test('properties header stays visible and fields fit the scrollable panel', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const { dialog } = await unifiedModelFixture(page);
  const inspector = dialog.getByLabel('Model detail properties', {
    exact: true,
  });
  const header = inspector.locator('.model-property-target');
  const body = inspector.locator('.model-properties-body');
  expect((await inspector.boundingBox())!.width).toBeCloseTo(320, 0);
  const top = (await header.boundingBox())!.y;
  await inspector
    .getByText('Groups, patterns & presets', { exact: true })
    .click();
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(header).toBeVisible();
  expect((await header.boundingBox())!.y).toBe(top);
  expect(
    await body.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await body.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: info.outputPath('properties-desktop.png') });
  await dialog
    .getByRole('button', { name: 'Hide structure', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Show structure', exact: true }),
  ).toHaveText('');
  await page.setViewportSize({ width: 1024, height: 768 });
  const resizedWidth = Math.round((await inspector.boundingBox())!.width);
  expect(resizedWidth).toBeGreaterThanOrEqual(260);
  expect(resizedWidth).toBeLessThanOrEqual(480);
  expect(
    await body.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
});

test('surface workspace falls back to precision editing when WebGL is unavailable', async ({
  page,
}) => {
  const { dialog, wall } = await unifiedModelFixture(page, { noWebGL: true });
  await expect(
    dialog.getByRole('button', { name: 'Orbit', exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole('application', { name: /Wall canvas/ }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Add text', exact: true }).click();
  await dialog.getByLabel('Surface text', { exact: true }).fill('OFFLINE');
  await dialog.getByLabel('Surface text', { exact: true }).press('Enter');
  await expect
    .poll(() => wall()?.elements.find((e) => e.kind === 'text')?.text)
    .toBe('OFFLINE');
});

test('surface workspace canvas stays bounded across desktop zoom sizes and phone rotation', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const { dialog, wall } = await unifiedModelFixture(page);
  await dialog
    .getByRole('button', { name: 'Edit surface', exact: true })
    .click();
  const canvas = await dialog
    .locator('.photo-model-canvas canvas')
    .elementHandle();
  for (const [width, height] of [
    [1280, 720],
    [1024, 576],
    [853, 480],
    [1440, 900],
    [1152, 720],
    [960, 600],
    [1920, 1080],
    [1536, 864],
    [1280, 720],
    [667, 375],
    [844, 390],
    [1024, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        dialog.evaluate((e) => {
          const b = e.getBoundingClientRect();
          return (
            b.left >= -1 &&
            b.top >= -1 &&
            b.right <= innerWidth + 1 &&
            b.bottom <= innerHeight + 1 &&
            e.scrollWidth <= e.clientWidth + 1
          );
        }),
      )
      .toBe(true);
    await expect(dialog.locator('.photo-model-canvas')).toHaveAttribute(
      'data-projection',
      'wall',
    );
    // ResizeObserver and the responsive shell update on subsequent frames.
    await expect
      .poll(
        async () =>
          (await dialog.locator('.photo-model-canvas').boundingBox())?.width ||
          0,
        {
          message: `canvas width at ${width}x${height}`,
        },
      )
      .toBeGreaterThan(180);
    await expect
      .poll(
        async () =>
          (await dialog.locator('.photo-model-canvas').boundingBox())?.height ||
          0,
        {
          message: `canvas height at ${width}x${height}`,
        },
      )
      .toBeGreaterThan(90);
    expect(
      await canvas!.evaluate(
        (el) => el === document.querySelector('.photo-model-canvas canvas'),
      ),
    ).toBe(true);
    expect(wall()?.elements).toHaveLength(1);
    if (width === 667 || width === 844)
      await page.screenshot({
        path: info.outputPath(`surface-${width}x${height}.png`),
      });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: info.outputPath('surface-dark.png') });
});

test('surface workspace touch tools retain the aligned viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const { dialog, wall } = await unifiedModelFixture(page);
  const done = dialog.getByRole('button', { name: 'Done', exact: true });
  if (await done.isVisible()) await done.click();
  await dialog
    .getByRole('button', { name: 'Edit surface', exact: true })
    .click();
  const canvas = await dialog
    .locator('.photo-model-canvas canvas')
    .elementHandle();
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Edit surface', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const element = dialog
    .locator('.model-wall-canvas [data-element-id]')
    .first();
  const box = (await element.boundingBox())!;
  const original = wall()!.elements[0].x;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await expect.poll(() => wall()!.elements[0].x).not.toBe(original);
  await dialog.getByRole('button', { name: 'Resize', exact: true }).click();
  await expect(dialog.locator('.photo-model-canvas')).toHaveAttribute(
    'data-projection',
    'wall',
  );
  await dialog.getByLabel('Model editing mode').selectOption('outline');
  await dialog
    .getByRole('button', { name: 'Edit surface', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Move point', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Edit surface', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(await canvas!.evaluate((el) => el.isConnected)).toBe(true);
});

test('public phone map credits stay readable and clear of the panel', async ({
  page,
}, info) => {
  await setup(page, false, false, {
    mutateCampus(data) {
      data.sources.push({
        id: 'credit-test',
        name: 'Campus survey',
        url: 'https://example.test',
        license: 'Test fixture',
        retrievedAt: '2026-10-03',
        attribution: 'Campus source attribution. '.repeat(50),
      });
    },
  });
  await page.goto('/');
  await attachMap(page);
  const credits = page.locator('.maplibregl-ctrl-attrib');
  const toggle = credits.locator('summary');
  const content = credits.locator('.maplibregl-ctrl-attrib-inner');
  await expect(content).toBeHidden();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const dark of [false, true]) {
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle('dark', dark),
        dark,
      );
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(content).toBeVisible();
      const panel = await page.locator('.explore-panel').boundingBox();
      const box = await credits.boundingBox();
      const button = await toggle.boundingBox();
      expect(box!.y + box!.height).toBeLessThan(panel!.y);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(button!.width).toBeGreaterThanOrEqual(44);
      expect(button!.height).toBeGreaterThanOrEqual(44);
      await expect(content).toHaveCSS('font-size', '12px');
      await page.screenshot({
        path: info.outputPath(
          `credits-${width}-${dark ? 'dark' : 'light'}.png`,
        ),
      });
      await page.keyboard.press('Enter');
      await expect(content).toBeHidden();
    }
  }
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  for (const name of ['Zoom in', 'Zoom out']) {
    await expect
      .poll(() =>
        page.getByRole('button', { name, exact: true }).evaluate((el) => {
          const r = el.getBoundingClientRect();
          const target = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
          return !!target && el.contains(target);
        }),
      )
      .toBe(true);
  }
  await toggle.click();
  await expect(content).toBeVisible();
  expect(
    await content.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + 20, r.bottom - 15));
    }),
  ).toBe(true);
  await toggle.click();
  await expect(content).toBeHidden();
});

test('desktop map controls stay twelve pixels above the panel through expansion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page);
  await page.goto('/');
  await attachMap(page);
  await expect(page.locator('.app-shell > .map-controls')).toHaveCount(1);
  for (const expand of [false, true]) {
    if (expand)
      await page
        .getByRole('button', { name: 'Expand card', exact: true })
        .click();
    const control = await page
        .locator('.app-shell > .map-controls')
        .boundingBox(),
      panel = await page.locator('.explore-panel').boundingBox();
    expect(control).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(
      Math.abs(panel!.y - (control!.y + control!.height) - 12),
    ).toBeLessThanOrEqual(1);
    expect(control!.y).toBeGreaterThanOrEqual(0);
  }
  await page.screenshot({ path: 'test-results/desktop-map-control-row.png' });
});

test('workspace panes: mobile editing height supports drag, keyboard, reset and reload', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const server = await setup(page);
  const handle = page.getByRole('slider', {
    name: 'Resize editing panel',
    exact: true,
  });
  await expect(handle).toBeVisible();
  const pane = page.locator('.workspace-pane[data-pane="left"]');
  const original = (await pane.boundingBox())!.height;
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    grip.x + grip.width / 2,
    grip.y + grip.height / 2 - 120,
    { steps: 10 },
  );
  await page.mouse.up();
  expect((await pane.boundingBox())!.height).toBeGreaterThan(original + 90);
  await handle.press('Home');
  await expect(handle).toHaveAttribute('aria-valuenow', '20');
  await handle.press('ArrowUp');
  await expect(handle).toHaveAttribute('aria-valuenow', '25');
  await handle.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', '85');
  expect((await pane.boundingBox())!.y).toBeGreaterThan(110);
  await page
    .getByRole('searchbox', { name: 'Search map features' })
    .fill('Library');
  await page
    .locator('.editor-feature-list button')
    .filter({ hasText: 'Library' })
    .click();
  await page.getByLabel('Name', { exact: true }).fill('Resized library');
  await handle.press('ArrowDown');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    'Resized library',
  );
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  await page.screenshot({
    path: testInfo.outputPath('editor-adjustable-panel-mobile.png'),
  });
  expect(server.edits()[0].properties.name).toBe('Resized library');
  await page.reload();
  await expect(handle).toHaveAttribute('aria-valuenow', '80');
  await page.getByRole('button', { name: 'Reset layout', exact: true }).click();
  await expect(handle).toHaveAttribute('aria-valuenow', '42');
  expect(server.edits()[0].properties.name).toBe('Resized library');
});
