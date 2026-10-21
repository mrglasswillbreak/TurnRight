import { collapseExplorer, openEditorSection } from './editor-navigation';
import { test, expect } from './coverage-fixture';
import { contrastFailures } from './contrast';
import { setup } from './editor-fixture';
import {
  attachMap,
  position,
  clickMap,
  focusCampus,
} from './editor-map-helpers';
import {
  openBuildingModel,
  closeBuildingModel,
  focusModels,
  unifiedModelFixture,
} from './editor-model-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

for (const phone of [false, true]) {
  test(`roof batch ${phone ? 'phone' : 'desktop'}: review, save, undo and reload`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    if (phone) await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const state = await setup(page);
    await focusCampus(page);
    await page
      .getByRole('button', { name: 'Switch to 3D', exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
      .toBe(false);
    const camera = await page.evaluate(() => [
      window.editorTestMap.getCenter().toArray(),
      window.editorTestMap.getZoom(),
      window.editorTestMap.getPitch(),
    ]);
    await openEditorSection(page, 'Sources');
    await page
      .getByText('Campus enrichment and building evidence', { exact: true })
      .click();
    await page
      .locator('summary')
      .filter({ hasText: /^Building roofs$/ })
      .click();
    const apply = page.getByRole('button', {
      name: 'Apply 1 reviewed roofs',
      exact: true,
    });
    await expect(apply).toBeEnabled();
    await page
      .locator('.building-roof-item')
      .filter({ hasText: 'Library' })
      .locator('summary')
      .click();
    await expect(
      page.getByRole('img', {
        name: 'Proposed roof ridges within the unchanged wing outline',
      }),
    ).toBeVisible();
    expect(state.edits()).toHaveLength(0);
    expect(await contrastFailures(page)).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('roof-batch-review.png'),
    });
    await apply.click();
    const savedRoof = () =>
      state.edits().find((e) => e.id === 'library' && !e.deleted)?.properties
        .appearance?.roofs?.['library:wing:0'];
    await expect.poll(() => savedRoof()?.points.length).toBeGreaterThan(0);
    const saved = structuredClone(savedRoof());
    expect(saved?.provenance).toContain('illustrative');
    expect(
      await page.evaluate(() => [
        window.editorTestMap.getCenter().toArray(),
        window.editorTestMap.getZoom(),
        window.editorTestMap.getPitch(),
      ]),
    ).toEqual(camera);
    await openEditorSection(page, 'Edit');
    await expect(page.getByText('Updating 3D preview…')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Retry 3D preview', exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
        ),
      )
      .toContain('library');
    await page.screenshot({
      path: testInfo.outputPath('pitched-roof-model.png'),
    });
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(savedRoof).toBeUndefined();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect.poll(savedRoof).toEqual(saved);
    await page.reload();
    await attachMap(page);
    await expect(page.locator('.editor-save-state')).toHaveText('Saved');
    expect(savedRoof()).toEqual(saved);
    expect(errors).toEqual([]);
  });
}

test('roof proposal retains its saved geometry and unfinished input through settings and recovery', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ colorScheme: 'dark' });
  const state = await setup(page);
  await focusCampus(page);
  await collapseExplorer(page);
  await clickMap(page, [3.20012, 6.46022]);
  await openBuildingModel(page, 'roof');
  await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
  await page
    .getByRole('button', { name: 'Preview approximate hip roof' })
    .click();
  const savedRoof = () =>
    state.edits().find((e) => e.id === 'library')?.properties.appearance
      ?.roofs?.['library:wing:0'];
  await expect.poll(() => savedRoof()?.points.length).toBeGreaterThan(0);
  const validRoof = structuredClone(savedRoof());
  await page.getByLabel('Eaves elevation (m)').fill('');
  await closeBuildingModel(page);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Light', exact: true }).check();
  await page
    .getByRole('button', { name: 'Close settings', exact: true })
    .click();
  await openBuildingModel(page, 'roof');
  await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
  await page
    .getByRole('button', { name: 'Edit custom roof', exact: true })
    .click();
  await expect(page.getByLabel('Eaves elevation (m)')).toHaveValue('');
  expect(savedRoof()).toEqual(validRoof);
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await attachMap(page);
  await focusCampus(page);
  const collapse = page.getByRole('button', { name: 'Collapse explorer' });
  if (await collapse.isVisible()) await collapse.click();
  await clickMap(page, [3.20012, 6.46022]);
  await openBuildingModel(page, 'roof');
  await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
  await page
    .getByRole('button', { name: 'Edit custom roof', exact: true })
    .click();
  await expect(page.getByLabel('Eaves elevation (m)')).toHaveValue('');
  expect(savedRoof()).toEqual(validRoof);
  await page.getByLabel('Eaves elevation (m)').fill(String(validRoof!.eaves));
  await page.getByLabel('Eaves elevation (m)').press('Enter');
  await page
    .getByRole('button', { name: 'Done editing roof', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Edit custom roof', exact: true }),
  ).toBeVisible();
});

test('roof campus batch: complex roof plans generate without fallback or camera jumps', async ({
  page,
}, testInfo) => {
  test.setTimeout(150000);
  await page.emulateMedia({ colorScheme: 'dark' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const state = await setup(page, true, true);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
  await page.evaluate(() =>
    window.editorTestMap.jumpTo({
      center: [3.1980018, 6.4742127],
      zoom: 18.2,
      pitch: 55,
      bearing: 15,
    }),
  );
  const camera = await page.evaluate(() => [
    window.editorTestMap.getCenter().toArray(),
    window.editorTestMap.getZoom(),
    window.editorTestMap.getPitch(),
  ]);
  await openEditorSection(page, 'Sources');
  await page
    .getByText('Campus enrichment and building evidence', { exact: true })
    .click();
  await page
    .locator('summary')
    .filter({ hasText: /^Building roofs$/ })
    .click();
  const apply = page.getByRole('button', {
    name: /^Apply \d+ reviewed roofs$/,
  });
  await expect(apply).toBeEnabled();
  const count = Number((await apply.innerText()).match(/\d+/)![0]);
  expect(count).toBeGreaterThanOrEqual(35);
  expect(state.edits()).toHaveLength(0);
  await apply.click();
  await expect.poll(() => state.edits().length, { timeout: 45000 }).toBe(count);
  await openEditorSection(page, 'Edit');
  await expect(page.getByText('Updating 3D preview…')).toHaveCount(0, {
    timeout: 45000,
  });
  await expect(
    page.getByRole('button', { name: 'Retry 3D preview', exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => [
      window.editorTestMap.getCenter().toArray(),
      window.editorTestMap.getZoom(),
      window.editorTestMap.getPitch(),
    ]),
  ).toEqual(camera);
  await page.screenshot({
    path: testInfo.outputPath('campus-pitched-roofs.png'),
  });
  expect(errors).toEqual([]);
});

test('documentation capture: editor appearance, roof and settings', async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.TURNRIGHT_DOCS_SCREENSHOTS,
    'Opt-in README captures with local API fixtures.',
  );
  test.setTimeout(240000);
  await page.emulateMedia({ colorScheme: 'dark' });
  const state = await setup(page, true, true);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await focusModels(page);
  await page.evaluate(() => window.editorTestMap.jumpTo({ zoom: 17.3 }));
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.loaded()))
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('editor-workspace.png') });
  await collapseExplorer(page);
  await focusModels(page);
  const roof = await position(page, [3.19978, 6.47109]);
  await page.mouse.click(roof.x, roof.y - 80);
  await expect(
    page.getByRole('textbox', { name: 'Name', exact: true }),
  ).toHaveValue('LASU Senate Building');
  await expect(
    page.getByRole('button', { name: 'Appearance', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.loaded()))
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('editor-building.png') });
  await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
  await page.getByRole('button', { name: 'Roof', exact: true }).click();
  await page.getByRole('button', { name: 'Create custom roof' }).click();
  await expect(
    page.getByRole('button', { name: 'Apply roof', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Updating 3D preview…', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Retry 3D preview', exact: true }),
  ).toHaveCount(0);
  // Show the complete roof plan without changing the application's panel layout.
  await page.locator('.editor-inspector-body').evaluate((element) => {
    element.scrollTop = 300;
  });
  await page.screenshot({ path: testInfo.outputPath('editor-roof.png') });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.screenshot({ path: testInfo.outputPath('editor-settings.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('button', { name: 'Retry 3D preview', exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('editor-settings-phone.png'),
  });
  expect(state.edits()).toHaveLength(0);
  await page.goto('/');
  await attachMap(page);
  await focusModels(page, true);
  const place = await position(page, [3.19978, 6.47109]);
  await page.mouse.click(place.x, place.y - 12);
  await expect(
    page.getByRole('heading', { name: 'LASU Senate Building', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('public-place-phone.png'),
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await focusModels(page);
  await page.screenshot({
    path: testInfo.outputPath('public-campus-dark.png'),
  });
});

test('unified model roof and outline tools share draft history', async ({
  page,
}) => {
  const { server, dialog } = await unifiedModelFixture(page);
  await dialog.getByRole('button', { name: 'Roof', exact: true }).click();
  await dialog
    .getByLabel('Building or wing', { exact: true })
    .selectOption({ label: 'Wing 1' });
  await dialog
    .getByRole('button', { name: 'Create custom roof', exact: true })
    .click();
  await expect
    .poll(
      () =>
        Object.keys(
          server.edits().find((e) => e.id === 'library')?.properties.appearance
            ?.roofs || {},
        ).length,
    )
    .toBe(1);
  await dialog
    .getByRole('button', { name: 'Done editing roof', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Outline', exact: true }).click();
  await expect(dialog.getByLabel('Top-down building outline')).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Insert midpoint after vertex' })
    .click();
  await expect(
    dialog.getByLabel('Outline vertex').locator('option'),
  ).toHaveCount(5);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    dialog.getByLabel('Outline vertex').locator('option'),
  ).toHaveCount(4);
});

test('model editor height and floor count resize custom roofs with undo', async ({
  page,
}) => {
  const { dialog, server } = await unifiedModelFixture(page, {
    prepareWall: false,
    properties: {
      height: 6,
      heightMode: 'metres',
      appearance: {
        windows: false,
        roofForm: 'flat',
        roofs: { 'library:wing:0': { eaves: 6, points: [], lines: [] } },
      },
    },
  });
  await dialog.getByRole('button', { name: 'Appearance', exact: true }).click();
  const height = dialog.getByLabel('Building height (m)', { exact: true });
  await height.fill('14');
  await height.press('Enter');
  await expect
    .poll(
      () =>
        server.edits()[0].properties.appearance?.roofs?.['library:wing:0']
          .eaves,
    )
    .toBe(14);
  await dialog.getByLabel('Building height information').selectOption('floors');
  const floors = dialog.getByLabel('Building floors', { exact: true });
  await floors.fill('5');
  await floors.press('Enter');
  await expect
    .poll(
      () =>
        server.edits()[0].properties.appearance?.roofs?.['library:wing:0']
          .eaves,
    )
    .toBe(15);
  await expect(
    dialog.getByText('Estimated dimensions · selected wall outlined'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(
      () =>
        server.edits()[0].properties.appearance?.roofs?.['library:wing:0']
          .eaves,
    )
    .toBe(14);
  await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect
    .poll(
      () =>
        server.edits()[0].properties.appearance?.roofs?.['library:wing:0']
          .eaves,
    )
    .toBe(15);
});
