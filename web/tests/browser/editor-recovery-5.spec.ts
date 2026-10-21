import { expandDetailInstances } from '../../src/model-instances';
import { test, expect } from './coverage-fixture';
import { readFileSync } from 'node:fs';
import type { CampusPhoto } from '../../src/types';
import { modelAction, unifiedModelFixture } from './editor-model-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('mobile touch moves, resizes, cancels for pinch and restores unfinished inputs', async ({
  page,
  context,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const { dialog, wall } = await unifiedModelFixture(page, {
    prepareWall: false,
    properties: { height: 9, appearance: { windows: false, roofForm: 'flat' } },
  });
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add window', exact: true }).click();
  await expect.poll(() => wall()?.elements.length).toBe(1);
  await dialog
    .getByRole('button', { name: 'Fit selection', exact: true })
    .click();
  const send = async (
    type: 'touchStart' | 'touchEnd' | 'touchMove' | 'touchCancel',
    points: { x: number; y: number; id: number }[],
  ) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const drag = async (x: number, y: number, dx: number, dy: number) => {
    await send('touchStart', [{ id: 1, x, y }]);
    for (let i = 1; i <= 5; i++)
      await send('touchMove', [
        { id: 1, x: x + (dx * i) / 5, y: y + (dy * i) / 5 },
      ]);
    await send('touchEnd', []);
  };
  let b = (await dialog.locator('[data-element-id]').first().boundingBox())!;
  const initial = structuredClone(wall()!.elements);
  await drag(b.x + b.width / 2, b.y + b.height / 2, 20, 10);
  expect(wall()!.elements).toEqual(initial);
  await dialog.getByRole('button', { name: 'Reset view', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Fit selection', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();
  b = (await dialog.locator('[data-element-id]').first().boundingBox())!;
  await drag(b.x + b.width / 2, b.y + b.height / 2, 25, -10);
  await expect
    .poll(() => wall()?.elements[0].x || 0)
    .toBeGreaterThan(initial[0].x);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => wall()?.elements).toEqual(initial);
  await dialog.getByRole('button', { name: 'Resize', exact: true }).click();
  b = (await dialog
    .getByLabel('Resize selected detail', { exact: true })
    .boundingBox())!;
  await drag(b.x + b.width / 2, b.y + b.height / 2, 25, -15);
  await expect
    .poll(() => wall()?.elements[0].width || 0)
    .toBeGreaterThan(initial[0].width);
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();
  b = (await dialog.locator('[data-element-id]').first().boundingBox())!;
  const stable = structuredClone(wall()!.elements),
    x = b.x + b.width / 2,
    y = b.y + b.height / 2;
  await send('touchStart', [{ id: 1, x, y }]);
  await send('touchMove', [{ id: 1, x: x + 12, y }]);
  await send('touchStart', [
    { id: 1, x: x + 12, y },
    { id: 2, x: x + 40, y: y + 50 },
  ]);
  await send('touchMove', [
    { id: 1, x: x + 8, y },
    { id: 2, x: x + 55, y: y + 65 },
  ]);
  await send('touchEnd', []);
  expect(wall()!.elements).toEqual(stable);
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByLabel('Width (m)', { exact: true }).fill('');
  await dialog
    .getByRole('button', {
      name: /^(Close workspace|Back to map)$/,
      exact: true,
    })
    .click();
  await page
    .getByRole('button', {
      name: /^Edit model$/,
      exact: true,
    })
    .click();
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Choose wall', exact: true })
    .click();
  if (!(await dialog.locator('.model-detail-item').first().isVisible()))
    await dialog.getByLabel('Find model parts').fill('Window');
  await dialog.locator('.model-detail-item').first().click();
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(dialog.getByLabel('Width (m)', { exact: true })).toHaveValue('');
  expect(wall()!.elements).toEqual(stable);
  await page.screenshot({ path: info.outputPath('mobile-recovery.png') });
});

test.describe('compact plan and photograph tools', () => {
  test.use({ hasTouch: true });
  for (const viewport of [
    { width: 320, height: 720 },
    { width: 768, height: 900 },
    { width: 1024, height: 390 },
  ])
    test(`all modes preserve the canvas at ${viewport.width}x${viewport.height}`, async ({
      page,
    }, info) => {
      await page.setViewportSize(viewport);
      const failures: string[] = [];
      page.on('pageerror', (e) => failures.push(e.message));
      const sample = JSON.parse(
        readFileSync(
          new URL('../../../data/photos/catalogue.json', import.meta.url),
          'utf8',
        ),
      )[0] as CampusPhoto;
      await page.route(`**${sample.url}`, (r) =>
        r.fulfill({
          body: readFileSync(
            new URL(
              `../../../data/photos/${sample.sha256}.webp`,
              import.meta.url,
            ),
          ),
          contentType: 'image/webp',
        }),
      );
      const { dialog, server, wall } = await unifiedModelFixture(page, {
        prepareWall: false,
        properties: {
          height: 9,
          appearance: { windows: false, roofForm: 'flat' },
          photos: [{ ...sample, buildingId: 'library' }],
        },
      });
      await expect(dialog.getByLabel('Model editing mode')).toBeVisible();
      await dialog.getByRole('button', { name: 'Add', exact: true }).click();
      await dialog
        .getByRole('button', { name: 'Add window', exact: true })
        .click();
      await expect.poll(() => wall()?.elements.length).toBe(1);
      await dialog.getByRole('button', { name: 'More', exact: true }).click();
      await dialog
        .getByRole('button', { name: 'Multi-select', exact: true })
        .click();
      const windowRow = dialog.getByRole('treeitem', {
        name: 'Window',
        exact: true,
      });
      await expect(windowRow).toBeVisible();
      await expect(windowRow).toHaveAttribute('aria-selected', 'true');
      await windowRow.press('Space');
      await expect(windowRow).toHaveAttribute('aria-selected', 'false');
      await windowRow.press('Space');
      await expect(windowRow).toHaveAttribute('aria-selected', 'true');
      await dialog.getByRole('button', { name: 'Done', exact: true }).click();
      await dialog.getByLabel('Model editing mode').selectOption('roof');
      await dialog
        .getByRole('button', { name: 'Create custom roof', exact: true })
        .click();
      await dialog
        .getByRole('button', {
          name: 'Add point with coordinates',
          exact: true,
        })
        .click();
      await expect
        .poll(
          () =>
            server.edits()[0].properties.appearance?.roofs?.['library:wing:0']
              ?.points.length,
        )
        .toBe(1);
      await dialog
        .getByRole('button', { name: 'Edit surface', exact: true })
        .click();
      const roof = dialog.getByRole('application', {
        name: 'Roof plan drawing',
        exact: true,
      });
      await expect(roof).toBeVisible();
      const roofValue = structuredClone(
        server.edits()[0].properties.appearance!.roofs,
      );
      const circle = roof.locator('[data-roof-point] circle').first();
      // ResizeObserver updates the inverse SVG scale on the next animation frame.
      await expect
        .poll(async () => (await circle.boundingBox())?.width || 0)
        .toBeGreaterThanOrEqual(43.9);
      const b = (await circle.boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(43.9);
      expect(b.height).toBeGreaterThanOrEqual(43.9);
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 2, {
        steps: 5,
      });
      await page.mouse.up();
      expect(server.edits()[0].properties.appearance!.roofs).toEqual(roofValue);
      await dialog.getByLabel('Model editing mode').selectOption('outline');
      await dialog.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(
        dialog.getByRole('application', {
          name: 'Top-down building outline',
          exact: true,
        }),
      ).toBeVisible();
      await dialog.getByLabel('Model editing mode').selectOption('details');
      await dialog.getByRole('button', { name: 'Photo', exact: true }).click();
      await dialog.getByRole('button', { name: 'More', exact: true }).click();
      await dialog
        .getByRole('button', { name: 'Start / reset alignment', exact: true })
        .click();
      await expect.poll(() => wall()?.texture?.corners.length).toBe(4);
      await dialog.getByRole('button', { name: 'Done', exact: true }).click();
      const recipe = structuredClone(wall()!.texture);
      await dialog
        .getByRole('button', { name: 'Enlarge photo', exact: true })
        .click();
      await dialog
        .getByRole('button', { name: 'Fit photo', exact: true })
        .click();
      expect(wall()!.texture).toEqual(recipe);
      await dialog
        .getByRole('button', { name: 'Align texture', exact: true })
        .click();
      await dialog
        .getByRole('button', { name: 'Move corner', exact: true })
        .click();
      const corner = await dialog
        .getByRole('button', { name: /Top left texture corner/ })
        .boundingBox();
      expect(corner!.width).toBeGreaterThanOrEqual(43.9);
      expect(corner!.height).toBeGreaterThanOrEqual(43.9);
      await dialog
        .getByRole('button', { name: 'Edit alignment', exact: true })
        .click();
      await expect(
        dialog.getByLabel('Top left X', { exact: true }),
      ).toBeVisible();
      // A touch user opens the keyboard before typing. WebKit's native number
      // fill can otherwise race the focus-triggered sheet expansion rerender.
      await dialog.getByLabel('Top left X', { exact: true }).click();
      await expect(dialog).toHaveAttribute('data-detent', 'full');
      await expect(
        dialog.getByLabel('Top left X', { exact: true }),
      ).toBeFocused();
      await dialog.getByLabel('Top left X', { exact: true }).fill('0.12');
      await expect(
        dialog.getByLabel('Top left X', { exact: true }),
      ).toHaveValue('0.12');
      await dialog.getByLabel('Top left X', { exact: true }).press('Enter');
      await expect.poll(() => wall()?.texture?.corners[0][0]).toBe(0.12);
      const photoSheet = dialog.locator('[data-mobile-panel="photo"]');
      const sheetHeading = dialog.locator('.model-sheet-heading');
      const sheetBounds = (await photoSheet.boundingBox())!;
      const headingBounds = (await sheetHeading.boundingBox())!;
      expect(Math.abs(sheetBounds.x - headingBounds.x)).toBeLessThan(3);
      expect(Math.abs(sheetBounds.width - headingBounds.width)).toBeLessThan(3);
      expect(sheetBounds.y).toBeGreaterThanOrEqual(
        headingBounds.y + headingBounds.height - 1,
      );
      if (viewport.width > viewport.height) {
        const photoBounds = (await dialog
          .locator('.model-photo-scroll')
          .boundingBox())!;
        expect(sheetBounds.x).toBeGreaterThanOrEqual(
          photoBounds.x + photoBounds.width,
        );
      }
      await expect
        .poll(() =>
          dialog.getByLabel('Top left X', { exact: true }).evaluate((el) => {
            const box = el.getBoundingClientRect();
            return (
              box.top >= 0 &&
              box.bottom <= innerHeight &&
              document.elementFromPoint(
                box.x + box.width / 2,
                box.y + box.height / 2,
              ) === el
            );
          }),
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath('compact-photo-alignment.png'),
      });
      await dialog.getByLabel('Model editing mode').selectOption('review');
      await expect(dialog.locator('.model-review')).toBeVisible();
      await expect
        .poll(() =>
          dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        )
        .toBe(true);
      await page.screenshot({ path: info.outputPath('compact-review.png') });
      expect(failures).toEqual([]);
    });
});

test('individual generated windows edit, undo and reopen without ungrouping', async ({
  page,
}) => {
  const { dialog, wall, server } = await unifiedModelFixture(page, {
    prepareWall: false,
    properties: {
      height: 9,
      floors: 3,
      appearance: { windows: true, roofForm: 'flat' },
    },
  });
  expect(wall()).toBeUndefined();
  const windows = dialog.locator(
    '.model-wall-canvas rect[data-element-id*="generated:0"]',
  );
  expect(await windows.count()).toBeGreaterThan(1);
  await windows.first().click();
  await expect(dialog.getByLabel('Width (m)', { exact: true })).toBeVisible();
  expect(wall()).toBeUndefined();
  await dialog.getByLabel('Width (m)', { exact: true }).fill('1.25');
  await dialog.getByLabel('Width (m)', { exact: true }).press('Enter');
  await expect
    .poll(() => wall()?.elements.some((e) => e.width === 1.25))
    .toBe(true);
  const first = expandDetailInstances(wall()!.elements);
  const edited = first.find((e) => e.width === 1.25)!;
  expect(edited.count).toBe(1);
  expect(wall()!.elements.some((e) => e.count > 1)).toBe(true);
  await dialog.getByLabel('Height (m)', { exact: true }).fill('1.7');
  await dialog.getByLabel('Height (m)', { exact: true }).press('Enter');
  await expect
    .poll(() => wall()?.elements.find((e) => e.id === edited.id)?.height)
    .toBe(1.7);
  const after = expandDetailInstances(wall()!.elements);
  expect(after.filter((e) => e.id !== edited.id)).toEqual(
    first.filter((e) => e.id !== edited.id),
  );
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(() => wall()?.elements.find((e) => e.id === edited.id)?.height)
    .toBe(edited.height);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => wall()).toBeUndefined();
  await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect
    .poll(() => wall()?.elements.some((e) => e.id === edited.id))
    .toBe(true);
  await dialog
    .getByRole('button', { name: 'Back to map', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit model', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Find model parts').fill('Window');
  await dialog
    .locator(`[data-tree-key="detail:library:wall:0:0:0:${edited.id}"]`)
    .click();
  await modelAction(page, 'Lock');
  await expect(dialog.getByLabel('Width (m)', { exact: true })).toBeDisabled();
  await modelAction(page, 'Unlock');
  await expect(dialog.getByLabel('Width (m)', { exact: true })).toBeEnabled();
  await modelAction(page, 'Hide in editor');
  await expect(
    dialog.locator(`.model-wall-canvas [data-element-id="${edited.id}"]`),
  ).toHaveCount(0);
  await modelAction(page, 'Show in editor');
  await modelAction(page, 'Delete');
  await expect
    .poll(() => wall()?.elements.some((e) => e.id === edited.id))
    .toBe(false);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(() => wall()?.elements.some((e) => e.id === edited.id))
    .toBe(true);
  await expect(dialog.getByLabel('Width (m)', { exact: true })).toHaveValue(
    '1.25',
  );
  expect(
    server.edits().find((e) => e.id === 'library')?.properties.appearance
      ?.facades,
  ).toBeTruthy();
});
