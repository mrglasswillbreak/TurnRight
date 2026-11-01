import { test, expect } from './coverage-fixture';
import { facadeWalls } from '../../src/building-facades';
import { browserCampus, setup } from './editor-fixture';
import { attachMap, clickMap } from './editor-map-helpers';
import { modelAction, unifiedModelFixture } from './editor-model-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('unified model duplication, patterns, undo and private input recovery', async ({
  page,
}) => {
  const { server, dialog, wall } = await unifiedModelFixture(page);
  await modelAction(page, 'Duplicate');
  await expect.poll(() => wall()?.elements.length).toBe(2);
  expect(new Set(wall()!.elements.map((e) => e.id)).size).toBe(2);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => wall()?.elements.length).toBe(1);
  await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(() => wall()?.elements.length).toBe(2);
  await dialog.locator('.model-detail-item').last().click();
  await dialog.getByText('Groups, patterns & presets', { exact: true }).click();
  await dialog.getByLabel('Name', { exact: true }).fill('Window bays');
  await dialog.getByLabel('Rows', { exact: true }).fill('2');
  await dialog.getByLabel('Columns', { exact: true }).fill('3');
  await dialog
    .getByRole('button', { name: 'Create pattern', exact: true })
    .click();
  await expect.poll(() => wall()?.elements.length).toBe(7);
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === 'library')?.properties
          .modelAuthoring?.patterns.length,
    )
    .toBe(1);
  if (!(await dialog.locator('.model-detail-item').first().isVisible()))
    await dialog.getByLabel('Find model parts').fill('Window');
  await dialog.locator('.model-detail-item').first().click();
  const beforeWidth = wall()!.elements[0].width;
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
  if (!(await dialog.locator('.model-detail-item').first().isVisible()))
    await dialog.getByLabel('Find model parts').fill('Window');
  await dialog.locator('.model-detail-item').first().click();
  await expect(dialog.getByLabel('Width (m)', { exact: true })).toHaveValue('');
  expect(wall()!.elements[0].width).toBe(beforeWidth);
  await dialog.getByLabel('Width (m)', { exact: true }).fill('1.7');
  await dialog.getByLabel('Width (m)', { exact: true }).press('Enter');
  await expect.poll(() => wall()?.elements[0].width).toBe(1.7);
});

test('unified model keyboard placement, locking, copy preview and targeted review', async ({
  page,
}) => {
  const { dialog, wall } = await unifiedModelFixture(page);
  const before = wall()!.elements[0].x;
  const canvas = dialog.getByRole('application', { name: /Wall canvas/ });
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => wall()?.elements[0].x || 0).toBeGreaterThan(before);
  await modelAction(page, 'Lock');
  const locked = wall()!.elements[0].x;
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  expect(wall()!.elements[0].x).toBe(locked);
  await modelAction(page, 'Unlock');
  await modelAction(page, 'Copy');
  await modelAction(page, 'Paste / copy to…');
  await dialog
    .getByLabel('Target wall', { exact: true })
    .selectOption('library:wall:0:0:1');
  await expect(
    dialog.getByLabel('Copied layout preview on target wall', { exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm placement' }).click();
  await expect(dialog.getByLabel('Mapped wall')).toHaveValue(
    'library:wall:0:0:1',
  );
  await dialog.getByText('Evidence & wall review', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Mark this wall reviewed' }).click();
  expect(wall()?.reviewedAt).toBeUndefined();
});

for (const viewport of [
  { width: 740, height: 390 },
  { width: 844, height: 320 },
])
  test(`landscape model has reachable close and useful canvas and tool areas at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const { dialog, wall } = await unifiedModelFixture(page);
    const close = dialog.getByRole('button', {
      name: /^(Close workspace|Back to map)$/,
      exact: true,
    });
    await expect(close).toHaveText('×');
    await expect(
      dialog.locator('.model-mobile-navigation').getByRole('button', {
        name: /^(Close workspace|Back to map)$/,
        exact: true,
      }),
    ).toBeVisible();
    const assertClose = async () => {
      const b = (await close.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(viewport.width);
      expect(b.y + b.height).toBeLessThanOrEqual(viewport.height);
      expect(b.height).toBeGreaterThanOrEqual(44);
    };
    await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
    const canvas = dialog.getByRole('application', { name: /Wall canvas/ });
    const properties = dialog.getByRole('complementary', {
      name: 'Model detail properties',
    });
    const c = (await canvas.boundingBox())!,
      p = (await properties.boundingBox())!;
    expect(c.height).toBeGreaterThan(120);
    expect(p.height).toBeGreaterThan(135);
    expect(c.x + c.width).toBeLessThanOrEqual(p.x + 1);
    await dialog.getByLabel('Width (m)', { exact: true }).fill('');
    for (const mode of ['appearance', 'roof', 'outline', 'review']) {
      await dialog.getByLabel('Model editing mode').selectOption(mode);
      await assertClose();
      await expect
        .poll(() =>
          dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        )
        .toBe(true);
    }
    await expect(
      dialog.getByText(/Needs review.*does not by itself/),
    ).toBeVisible();
    await dialog
      .getByRole('button', {
        name: 'Inspect details and evidence',
        exact: true,
      })
      .click();
    await expect(
      dialog.getByRole('button', {
        name: 'Mark this wall reviewed',
        exact: true,
      }),
    ).toBeVisible();
    await dialog
      .getByRole('button', { name: 'Mark this wall reviewed', exact: true })
      .click();
    await expect.poll(() => wall()?.reviewedAt).toBeTruthy();
    await page.screenshot({ path: info.outputPath('landscape-reviewed.png') });
    await close.click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('button', {
        name: /^Edit model$/,
        exact: true,
      }),
    ).toBeFocused();
    await page
      .getByRole('button', {
        name: /^Edit model$/,
        exact: true,
      })
      .click();
    await dialog
      .getByRole('button', { name: 'Choose wall', exact: true })
      .click();
    await dialog.locator('[data-model-wall="library:wall:0:0:0"]').click();
    await dialog.getByRole('button', { name: 'Walls', exact: true }).click();
    await dialog.getByLabel('Find model parts').fill('Window');
    await dialog
      .getByRole('treeitem', { name: 'Window', exact: true })
      .first()
      .click();
    await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(dialog.getByLabel('Width (m)', { exact: true })).toHaveValue(
      '',
    );
    await assertClose();
  });

test('unified model retains an invalid pattern privately and repairs it after reopening', async ({
  page,
}) => {
  const { server, dialog, wall } = await unifiedModelFixture(page);
  await dialog.getByText('Groups, patterns & presets', { exact: true }).click();
  await dialog.getByLabel('Horizontal step (m)', { exact: true }).fill('50');
  await dialog
    .getByRole('button', { name: 'Create pattern', exact: true })
    .click();
  await expect(dialog.locator('header output')).toContainText('Unsaved input');
  expect(wall()?.elements.length).toBe(1);
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
  await dialog.getByLabel('Find model parts').fill('Repeated details');
  await dialog
    .getByRole('treeitem', { name: 'Repeated details', exact: true })
    .locator(':scope > .model-tree-row')
    .click();
  await dialog.getByLabel('Find model parts').fill('');
  await dialog.getByText('Groups, patterns & presets', { exact: true }).click();
  await expect(
    dialog.getByRole('combobox', { name: 'Pattern', exact: true }),
  ).not.toHaveValue('');
  await dialog.getByLabel('Horizontal step (m)', { exact: true }).fill('2');
  await dialog
    .getByRole('button', { name: 'Update pattern', exact: true })
    .click();
  await expect.poll(() => wall()?.elements.length).toBe(3);
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === 'library')?.properties
          .modelAuthoring?.patterns.length,
    )
    .toBe(1);
});

for (const viewport of [
  { width: 740, height: 390 },
  { width: 320, height: 450 },
])
  test(`unified model controls remain reachable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const { dialog } = await unifiedModelFixture(page);
    await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
    const width = dialog.getByLabel('Width (m)', { exact: true });
    await width.fill('1.8');
    await width.press('Enter');
    await expect(width).toHaveValue('1.8');
    const close = dialog.getByRole('button', {
      name: /^(Close workspace|Back to map)$/,
      exact: true,
    });
    await close.scrollIntoViewIfNeeded();
    const box = await close.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    await close.click();
    await expect(
      page.getByRole('button', {
        name: /^Edit model$/,
        exact: true,
      }),
    ).toBeFocused();
  });

test('mark all as reviewed approves current building walls in one undoable action', async ({
  page,
}) => {
  const building = browserCampus().map.features.find(
    (f) => f.properties?.id === 'library',
  )!;
  const walls = facadeWalls(building).slice(0, 2);
  const facades = Object.fromEntries(
    walls.map((w) => [
      w.wallId,
      {
        partId: w.partId,
        wallId: w.wallId,
        wallCoordinates: w.coordinates,
        photoIds: [],
        confidence: 'inferred',
        notes: 'Illustrative details',
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
  );
  const { dialog, server } = await unifiedModelFixture(page, {
    prepareWall: false,
    properties: { appearance: { facades } },
  });
  await dialog.getByRole('button', { name: /^Review/ }).click();
  const approve = dialog.getByRole('button', {
    name: 'Mark all as reviewed',
    exact: true,
  });
  await expect(approve).toBeEnabled();
  await approve.click();
  const saved = () =>
    Object.values(
      server.edits().find((e) => e.id === 'library')!.properties.appearance!
        .facades!,
    );
  await expect
    .poll(() => saved().every((f) => f.reviewedAt && !f.needsReview))
    .toBe(true);
  expect(saved()).toHaveLength(2);
  expect(saved()[0].reviewedAt).toBe(saved()[1].reviewedAt);
  await expect(
    dialog.locator('.model-review').getByRole('status'),
  ).toContainText('Reviewed 2 walls');
  await expect(approve).toBeDisabled();
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(() => saved().every((f) => f.needsReview && !f.reviewedAt))
    .toBe(true);
  await expect(approve).toBeEnabled();
  await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect
    .poll(() => saved().every((f) => f.reviewedAt && !f.needsReview))
    .toBe(true);
});

test('public Editor opens the selected building card and consumes the handoff once', async ({
  page,
}) => {
  const server = await setup(page);
  await page.goto('/?place=library');
  const link = page.getByRole('link', { name: 'Editor', exact: true });
  await expect(link).toHaveAttribute('href', '/admin?building=library');
  await expect(
    page.getByRole('group', { name: 'Place actions' }),
  ).toBeVisible();
  await link.click();
  await attachMap(page);
  await expect(
    page
      .getByRole('complementary', { name: 'Feature properties', exact: true })
      .getByRole('heading', { name: 'Library', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit model', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);
  expect(server.edits()).toHaveLength(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByLabel('Building opacity', { exact: true }),
  ).toHaveValue('1');
});

test('public footprint dialog opens its unlinked building in the editor', async ({
  page,
}) => {
  await setup(page, false, false, {
    mutateCampus: (data) => {
      const building = data.map.features.find(
        (f) => f.properties?.id === 'library',
      )!;
      building.properties = {
        ...building.properties,
        id: 'unlinked-library',
        name: 'Unlinked library',
        placeId: undefined,
      };
      data.places = data.places.filter((p) => p.id !== 'library');
    },
  });
  await page.goto('/');
  await attachMap(page);
  const expand = page.getByRole('button', { name: 'Expand card', exact: true });
  if (await expand.isVisible()) await expand.click();
  await expect(
    page.getByRole('link', { name: 'Editor', exact: true }),
  ).toHaveAttribute('href', '/admin');
  await page.evaluate(
    () =>
      void window.editorTestMap.jumpTo({
        center: [3.20012, 6.46022],
        zoom: 20,
      }),
  );
  await clickMap(page, [3.20012, 6.46022]);
  const link = page
    .getByRole('dialog')
    .getByRole('link', { name: 'Editor', exact: true });
  await expect(link).toHaveAttribute(
    'href',
    '/admin?building=unlinked-library',
  );
  await link.click();
  // The new editor map must load before the handoff and lazy property tools.
  await attachMap(page);
  await expect(
    page
      .getByRole('complementary', { name: 'Feature properties', exact: true })
      .getByRole('heading', { name: 'Unlinked library', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit model', exact: true }),
  ).toBeVisible();
});
