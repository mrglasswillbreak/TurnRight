import { openEditorSection } from './editor-navigation';
import { test, expect } from './coverage-fixture';
import { facadeWalls } from '../../src/building-facades';
import { browserCampus, setup } from './editor-fixture';
import { attachMap, position, focusCampus } from './editor-map-helpers';
import { modelAction, unifiedModelFixture } from './editor-model-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('driving road approval persists separately from walking access', async ({
  page,
}) => {
  const server = await setup(page, false, false, {
    initialEdits: [
      {
        id: 'driving-review-road',
        kind: 'path',
        geometry: {
          type: 'LineString',
          coordinates: [
            [3.2005, 6.4598],
            [3.2005, 6.46015],
          ],
        },
        properties: {
          name: 'Driving review road',
          access: 'campus',
          vertexIds: ['drive:start', 'drive:end'],
        },
      },
    ],
  });
  const select = async () => {
    await focusCampus(page);
    const point = await position(page, [3.2005, 6.4601]);
    await page.mouse.click(point.x, point.y);
    await expect(
      page.getByRole('combobox', { name: 'Vehicle access', exact: true }),
    ).toBeVisible();
  };
  await select();
  await expect(
    page.getByRole('combobox', { name: 'Vehicle access', exact: true }),
  ).toHaveValue('unknown');
  await page
    .getByRole('combobox', { name: 'Vehicle access', exact: true })
    .selectOption('reviewed');
  await page.getByLabel('Permitted vehicle audience').fill('Campus visitors');
  await page.getByLabel('Driving approval date').fill('2026-09-22');
  await page
    .getByLabel('Driving approval evidence and restrictions')
    .fill('Owner inspected this road; visitors permitted.');
  await page
    .getByRole('combobox', { name: 'Vehicle direction', exact: true })
    .selectOption('reverse');
  await page.getByLabel('Recorded speed (km/h)').fill('15');
  await expect
    .poll(
      () =>
        (
          server.edits().find((e) => e.id === 'driving-review-road')?.properties
            .vehicle as {
            speedKph?: number;
          }
        )?.speedKph,
    )
    .toBe(15);
  expect(
    server.edits().find((e) => e.id === 'driving-review-road')?.properties
      .access,
  ).toBe('campus');
  await page.reload();
  await attachMap(page);
  await select();
  await expect(
    page.getByRole('combobox', { name: 'Vehicle access', exact: true }),
  ).toHaveValue('reviewed');
  await expect(
    page.getByRole('combobox', { name: 'Vehicle direction', exact: true }),
  ).toHaveValue('reverse');
  await expect(page.getByLabel('Permitted vehicle audience')).toHaveValue(
    'Campus visitors',
  );
});

for (const width of [390, 1440]) {
  test(`release preflight opens the exact wall and retains targeted review through undo at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const building = browserCampus().map.features.find(
      (f) => f.properties?.id === 'library',
    )!;
    const walls = facadeWalls(building).slice(0, 2);
    const server = await setup(page, false, false, {
      initialEdits: [
        {
          id: 'library',
          kind: 'building',
          geometry: building.geometry,
          properties: {
            ...building.properties,
            appearance: {
              facades: Object.fromEntries(
                walls.map((w) => [
                  w.wallId,
                  {
                    partId: w.partId,
                    wallId: w.wallId,
                    wallCoordinates: w.coordinates,
                    photoIds: [],
                    confidence: 'inferred',
                    notes: 'Illustrative layout; dimensions are estimates.',
                    needsReview: true,
                    elements: [
                      {
                        id: `window-${w.wallId}`,
                        kind: 'window',
                        x: 0.5,
                        bottom: 1,
                        width: 1,
                        height: 1,
                        depth: 0.1,
                        count: 1,
                        spacing: 0,
                        colour: '#566677',
                      },
                    ],
                  },
                ]),
              ),
            },
          },
        },
      ],
    });
    await openEditorSection(page, 'Releases');
    await page
      .getByLabel('What changed?')
      .fill('Review the changed model height');
    const blockers = page.getByRole('region', {
      name: 'Model release blockers',
    });
    await expect(blockers.getByRole('button')).toHaveCount(2);
    if (process.env.TURNRIGHT_CAPTURE_RELEASE === '1') {
      await blockers.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `../docs/assets/screenshots/editor-release-review-${width}-2026-09-25.png`,
      });
    }
    await expect(
      page.getByRole('button', { name: 'Build review preview' }),
    ).toBeDisabled();
    await blockers.getByRole('button', { name: /Wing 1 · wall 2/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const review = dialog.locator('.model-review');
    await review
      .getByRole('button', { name: /Library · Wing 1 · wall 2:/ })
      .click();
    if (width > 900)
      await expect(dialog.getByLabel('Mapped wall')).toHaveValue(
        walls[1].wallId,
      );
    await expect(
      dialog.getByRole('button', {
        name: 'Confirm wall match · preserve metre positions',
      }),
    ).toHaveCount(0);
    const approve = dialog.getByRole('button', {
      name: 'Mark this wall reviewed',
      exact: true,
    });
    await expect(approve).toBeEnabled();
    await approve.click();
    const facade = (i: number) =>
      server.edits().find((e) => e.id === 'library')?.properties.appearance
        ?.facades?.[walls[i].wallId];
    await expect.poll(() => facade(1)?.needsReview).toBe(false);
    expect(facade(1)?.reviewedAt).toBeTruthy();
    expect(facade(0)?.needsReview).toBe(true);
    await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(() => facade(1)?.needsReview).toBe(true);
    await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect.poll(() => facade(1)?.needsReview).toBe(false);
    await dialog
      .getByRole('button', {
        name: /^(Close workspace|Back to map)$/,
        exact: true,
      })
      .click();
    await openEditorSection(page, 'Releases');
    await expect(blockers.getByRole('button')).toHaveCount(1);
    await expect(blockers).toContainText('Wing 1 · wall 1');
  });
}

test('reference split preserves the renderer and edits through resizing', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const { dialog, wall } = await unifiedModelFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const canvas = await dialog
    .locator('.photo-model-canvas canvas')
    .elementHandle();
  await dialog
    .getByRole('button', { name: 'Reference split', exact: true })
    .click();
  const host = dialog.locator('.model-view-columns');
  await expect(host).toHaveAttribute('data-reference-split', 'true');
  const divider = dialog.getByRole('separator', {
    name: 'Resize model and photograph panes',
  });
  await divider.focus();
  await divider.press('Home');
  await expect(divider).toHaveAttribute('aria-valuenow', '420');
  const photo = await dialog.locator('.model-photo-view').boundingBox();
  const model = await dialog.locator('.model-3d-view').boundingBox();
  expect(photo!.x).toBeGreaterThanOrEqual(model!.x + model!.width);
  await dialog.getByLabel('Width (m)', { exact: true }).fill('1.7');
  await dialog.getByLabel('Width (m)', { exact: true }).press('Enter');
  await expect.poll(() => wall()?.elements[0].width).toBe(1.7);
  // Touch layouts can keep a full-width model area at 960 px; use a width
  // below the split's actual 720 px minimum on both input types.
  await page.setViewportSize({ width: 667, height: 375 });
  await expect(host).toHaveAttribute('data-reference-split', 'false');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(host).toHaveAttribute('data-reference-split', 'true');
  await expect(dialog.getByLabel('Width (m)', { exact: true })).toHaveValue(
    '1.7',
  );
  expect(
    await canvas!.evaluate(
      (node) => node === document.querySelector('.photo-model-canvas canvas'),
    ),
  ).toBe(true);
  await dialog.getByRole('button', { name: 'Orbit', exact: true }).click();
  await expect(dialog.locator('.model-photo-view')).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Edit surface', exact: true })
    .click();
  await expect(dialog.locator('.model-photo-view')).toBeVisible();
  await page.screenshot({ path: info.outputPath('reference-editing.png') });
});

test('selected detail menu supports context actions, keyboard focus and undo', async ({
  page,
}) => {
  const { dialog, wall } = await unifiedModelFixture(page);
  const canvas = dialog.getByRole('application', { name: /Wall canvas/ });
  const selected = canvas.locator('[data-element-id]').first();
  await selected.click({ button: 'right' });
  await expect(
    page.getByRole('menuitem', { name: 'Duplicate', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('menuitem', { name: 'Edit details', exact: true })
    .click();
  await expect(dialog.getByLabel('Detail name', { exact: true })).toBeFocused();
  await expect(page.getByRole('menu')).toBeHidden();
  await canvas.focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(canvas).toBeFocused();
  await modelAction(page, 'Hide in editor');
  await expect(canvas.locator('[data-element-id]')).toHaveCount(0);
  await modelAction(page, 'Show in editor');
  await expect(canvas.locator('[data-element-id]')).toHaveCount(1);
  await canvas.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByLabel('Detail name', { exact: true })).toBeFocused();
  await modelAction(page, 'Duplicate');
  await expect.poll(() => wall()?.elements.length).toBe(2);
  await modelAction(page, 'Delete');
  await expect.poll(() => wall()?.elements.length).toBe(1);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => wall()?.elements.length).toBe(2);
  await canvas.focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu')).toContainText('2 details selected');
  await page.keyboard.press('Escape');
});

test('3D touch hold selects a detail and opens actions without a release tap', async ({
  page,
  context,
}, info) => {
  await page.setViewportSize({ width: 740, height: 390 });
  const { dialog, wall } = await unifiedModelFixture(page);
  await dialog.getByRole('button', { name: 'Orbit', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Fit selection', exact: true })
    .click();
  const canvas = dialog.locator('.photo-model-canvas canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('Window');
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect(menu).toBeVisible();
  await page.screenshot({ path: info.outputPath('3d-long-press-actions.png') });
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  await expect.poll(() => wall()?.elements.length).toBe(2);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => wall()?.elements.length).toBe(1);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 2 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 25, y, id: 2 }],
  });
  await page.waitForTimeout(650);
  await expect(menu).toBeHidden();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await dialog
    .getByRole('button', {
      name: /^(Close workspace|Back to map)$/,
      exact: true,
    })
    .click();
  await cdp.detach();
});

test('mobile canvas editing uses focused sheets and deliberate move tools', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  const { dialog, wall } = await unifiedModelFixture(page, {
    prepareWall: false,
    properties: { height: 6, appearance: { windows: false, roofForm: 'flat' } },
  });
  await expect(
    dialog.getByRole('application', { name: /Wall canvas/ }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add window', exact: true }).click();
  await expect.poll(() => wall()?.elements.length).toBe(1);
  const initial = structuredClone(wall()!.elements[0]);
  const shape = dialog.locator(`[data-element-id="${initial.id}"]`).first();
  const b = (await shape.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 25, b.y + b.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  expect(wall()!.elements[0]).toEqual(initial);
  await dialog.getByRole('button', { name: 'Reset view', exact: true }).click();
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Nudge right', exact: true })
    .click();
  await expect
    .poll(() => wall()?.elements[0].x || 0)
    .toBeGreaterThan(initial.x);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => wall()?.elements[0].x).toBe(initial.x);
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
  const width = dialog.getByLabel('Width (m)', { exact: true });
  await width.fill('1.8');
  await width.press('Enter');
  await expect.poll(() => wall()?.elements[0].width).toBe(1.8);
  await page.screenshot({ path: info.outputPath('mobile-edit.png') });
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await dialog.getByRole('button', { name: 'More', exact: true }).click();
  await modelAction(page, 'Duplicate');
  await expect.poll(() => wall()?.elements.length).toBe(2);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await dialog.getByLabel('Model editing mode').selectOption('outline');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    dialog.getByRole('application', { name: 'Top-down building outline' }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('mobile-outline.png') });
  await dialog.getByLabel('Model editing mode').selectOption('appearance');
  await expect(
    dialog.getByLabel('Building height (m)', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1))
    .toBe(true);
  expect(failures).toEqual([]);
});
