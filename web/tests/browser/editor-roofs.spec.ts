import { collapseExplorer } from './editor-navigation';
import { test, expect } from './coverage-fixture';
import { readFileSync } from 'node:fs';
import type { MapEdit } from '../../src/types';
import { browserRecovery, setup } from './editor-fixture';
import { attachMap, clickMap, focusCampus } from './editor-map-helpers';
import { openBuildingModel, closeBuildingModel } from './editor-model-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('building appearance: integrated view, surface inheritance, live preview, roof recovery and undo', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const state = await setup(page);
  await focusCampus(page);
  await collapseExplorer(page);
  await clickMap(page, [3.20012, 6.46022]);
  await expect(
    page.getByRole('button', { name: 'Edit model', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Updating 3D preview…', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Retry 3D preview', exact: true }),
  ).toHaveCount(0);
  expect(state.edits()).toHaveLength(0);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await expect(page.locator('button.map-view-control')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Enhanced 3D', exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
      ),
    )
    .toContain('library');
  await openBuildingModel(page);
  await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
  await page
    .getByLabel('Wall', { exact: true })
    .selectOption({ label: 'Outside wall 1' });
  const camera = await page.evaluate(() => ({
    center: window.editorTestMap.getCenter().toArray(),
    bearing: window.editorTestMap.getBearing(),
    pitch: window.editorTestMap.getPitch(),
    zoom: window.editorTestMap.getZoom(),
  }));
  const colour = page.getByLabel('Wall colour', { exact: true });
  await colour.fill('#cc5533');
  await colour.fill('#bb4422');
  await colour.blur();
  await expect
    .poll(
      () =>
        state.edits().find((e) => e.id === 'library')?.properties.appearance
          ?.walls?.['library:wall:0:0:0']?.wallColour,
    )
    .toBe('#bb4422');
  await expect(page.getByText('Updating 3D preview…')).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      center: window.editorTestMap.getCenter().toArray(),
      bearing: window.editorTestMap.getBearing(),
      pitch: window.editorTestMap.getPitch(),
      zoom: window.editorTestMap.getZoom(),
    })),
  ).toEqual(camera);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(colour).not.toHaveValue('#bb4422');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(colour).toHaveValue('#bb4422');
  await page
    .getByRole('button', { name: 'Use inherited value for wallColour' })
    .click();
  await expect(colour).not.toHaveValue('#bb4422');
  await page.getByRole('button', { name: 'Roof', exact: true }).click();
  await page.getByRole('button', { name: 'Create custom roof' }).click();
  await page
    .getByRole('button', { name: 'Add point with coordinates' })
    .click();
  await page.getByLabel('Point elevation (m)', { exact: true }).fill('14');
  await page.getByLabel('Point elevation (m)', { exact: true }).press('Enter');
  await expect
    .poll(
      () =>
        state.edits().find((e) => e.id === 'library')?.properties.appearance
          ?.roofs?.['library:wing:0']?.points[0]?.elevation,
    )
    .toBe(14);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect
    .poll(
      () =>
        state.edits().find((e) => e.id === 'library')?.properties.appearance
          ?.roofs?.['library:wing:0']?.points[0]?.elevation,
    )
    .toBe(14);
  await dialog
    .getByRole('button', {
      name: /^(Close workspace|Back to map)$/,
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Switch to 2D', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await openBuildingModel(page, 'roof');
  await dialog
    .getByRole('button', { name: 'Edit custom roof', exact: true })
    .click();
  await expect(dialog.getByLabel('Control point')).toContainText('14 m');
  await page.screenshot({ path: 'test-results/building-roof-editor.png' });
  expect(errors).toEqual([]);
});

test(
  'prepared building editor reopens saved appearance and unfinished roofs offline',
  { tag: '@offline' },
  async ({ page, context }, testInfo) => {
    test.skip(
      !testInfo.config.configFile?.includes('pwa.config'),
      'Requires production service worker.',
    );
    test.setTimeout(120000);
    await page.emulateMedia({ colorScheme: 'dark' });
    await setup(page);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    // The browser's network hint can be false despite a reachable backend.
    // Preparation verifies requests and assets instead of trusting that hint.
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: false,
      }),
    );
    await page.getByRole('button', { name: 'Survey', exact: true }).click();
    await page
      .getByRole('button', { name: 'Prepare for offline survey', exact: true })
      .click();
    await expect(page.getByText(/Ready for offline surveying/)).toBeVisible();
    await page.evaluate(() => Reflect.deleteProperty(navigator, 'onLine'));
    await page
      .getByRole('button', { name: 'Close survey', exact: true })
      .click();
    await focusCampus(page);
    await collapseExplorer(page);
    await clickMap(page, [3.20012, 6.46022]);
    await page
      .getByRole('button', { name: 'Switch to 3D', exact: true })
      .click();
    await page.getByRole('button', { name: 'Edit model', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
    await page
      .getByLabel('Wall', { exact: true })
      .selectOption({ label: 'Outside wall 1' });
    await page.getByLabel('Wall colour', { exact: true }).fill('#884422');
    await expect(page.locator('.editor-save-state')).toHaveText('Saved');
    await page.getByRole('button', { name: 'Roof', exact: true }).click();
    await page.getByRole('button', { name: 'Create custom roof' }).click();
    await page
      .getByRole('button', { name: 'Add point with coordinates' })
      .click();
    await page.getByLabel('Point elevation (m)', { exact: true }).fill('14');
    await page
      .getByLabel('Point elevation (m)', { exact: true })
      .press('Enter');
    await expect(page.locator('.editor-save-state')).toHaveText('Saved');
    await page.getByLabel('Eaves elevation (m)').fill('');
    await expect(
      page.getByRole('dialog').locator('header output'),
    ).toContainText('Unsaved input');
    // The unfinished-input label does not acknowledge completion of an IDB write.
    await expect
      .poll(
        async () =>
          (await browserRecovery(page))?.modelInputs?.library?.[
            'roof:library:wing:0:eaves'
          ],
      )
      .toBe('');
    await context.setOffline(true);
    page.once('dialog', (dialog) => dialog.accept());
    await page.reload();
    await attachMap(page);
    await focusCampus(page);
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
        ),
      )
      .toContain('library');
    const downloadPromise = page.waitForEvent('download');
    await page
      .locator('.editor-offline')
      .getByRole('button', { name: 'Download local recovery' })
      .click();
    const download = await downloadPromise;
    const recovery = JSON.parse(
      readFileSync((await download.path())!, 'utf8'),
    ).workspace;
    expect(recovery.modelInputs.library['roof:library:wing:0:eaves']).toBe('');
    expect(
      recovery.edits.find((e: MapEdit) => e.id === 'library').properties
        .appearance.roofs['library:wing:0'].points[0].elevation,
    ).toBe(14);
    expect(
      recovery.edits.find((e: MapEdit) => e.id === 'library').properties
        .appearance.walls['library:wall:0:0:0'].wallColour,
    ).toBe('#884422');
    const collapse = page.getByRole('button', { name: 'Collapse explorer' });
    if (await collapse.isVisible()) await collapse.click();
    await clickMap(page, [3.20012, 6.46022]);
    await page.getByRole('button', { name: 'Edit model', exact: true }).click();
    await page.getByRole('button', { name: 'Roof', exact: true }).click();
    await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
    await page
      .getByRole('button', { name: 'Edit custom roof', exact: true })
      .click();
    await expect(page.getByLabel('Eaves elevation (m)')).toHaveValue('');
    await page.getByLabel('Eaves elevation (m)').fill('8');
    await page.getByLabel('Eaves elevation (m)').press('Enter');
    await page
      .getByRole('button', { name: 'Done editing roof', exact: true })
      .click();
    await page
      .getByRole('button', {
        name: /^(Close workspace|Back to map)$/,
        exact: true,
      })
      .click();
    await page.reload();
    await attachMap(page);
    await focusCampus(page);
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
        ),
      )
      .toContain('library');
    const secondPromise = page.waitForEvent('download');
    await page
      .locator('.editor-offline')
      .getByRole('button', { name: 'Download local recovery' })
      .click();
    const second = await secondPromise;
    const saved = JSON.parse(
      readFileSync((await second.path())!, 'utf8'),
    ).workspace;
    expect(saved.roofDraft).toBeNull();
    expect(
      saved.modelInputs.library['roof:library:wing:0:eaves'],
    ).toBeUndefined();
    expect(
      saved.edits.find((e: MapEdit) => e.id === 'library').properties.appearance
        .roofs['library:wing:0'].points[0].elevation,
    ).toBe(14);
  },
);

test('view settings: preserves the map, saved roof and unfinished drawing', async ({
  page,
}) => {
  test.setTimeout(120000);
  const state = await setup(page);
  await focusCampus(page);
  await collapseExplorer(page);
  await clickMap(page, [3.20012, 6.46022]);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
  await openBuildingModel(page, 'roof');
  await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
  await page.getByRole('button', { name: 'Create custom roof' }).click();
  await page
    .getByRole('button', { name: 'Add point with coordinates' })
    .click();
  await page.getByLabel('Point elevation (m)', { exact: true }).fill('14');
  await page.getByLabel('Point elevation (m)', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Draw ridge', exact: true }).click();
  const selectedPoint = await page.getByLabel('Control point').inputValue();
  const camera = await page.evaluate(() => ({
    center: window.editorTestMap.getCenter().toArray(),
    bearing: window.editorTestMap.getBearing(),
    pitch: window.editorTestMap.getPitch(),
    zoom: window.editorTestMap.getZoom(),
  }));
  await closeBuildingModel(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByLabel('Point elevation (m)', { exact: true }),
  ).toBeHidden();
  for (const appearance of ['Light', 'Dark'] as const) {
    const option = page.getByRole('radio', { name: appearance, exact: true });
    await option.focus();
    await option.press('Space');
    await expect(option).toBeChecked();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.editorTestMap.getPaintProperty(
            'background',
            'background-color',
          ),
        ),
      )
      .toBe(appearance === 'Dark' ? '#293e52' : '#eee9dc');
  }
  await expect(page.getByLabel('Map tilt', { exact: true })).toHaveValue(
    String(camera.pitch),
  );
  await page.getByRole('radio', { name: 'Simple', exact: true }).check();
  await page.getByRole('radio', { name: 'Enhanced', exact: true }).check();
  await page.getByLabel('Building opacity', { exact: true }).fill('0.35');
  await page
    .getByRole('button', { name: 'Close settings', exact: true })
    .click();
  await openBuildingModel(page, 'roof');
  await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
  await page
    .getByRole('button', { name: 'Edit custom roof', exact: true })
    .click();
  await page.getByLabel('Control point').selectOption(selectedPoint);
  await expect(page.getByLabel('Control point')).toHaveValue(selectedPoint);
  await expect(
    page.getByLabel('Point elevation (m)', { exact: true }),
  ).toHaveValue('14');
  await expect(
    page.getByRole('button', { name: 'Draw ridge', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  expect(
    await page.evaluate(() => ({
      center: window.editorTestMap.getCenter().toArray(),
      bearing: window.editorTestMap.getBearing(),
      pitch: window.editorTestMap.getPitch(),
      zoom: window.editorTestMap.getZoom(),
    })),
  ).toEqual(camera);
  expect(
    await page.evaluate(
      () =>
        window.editorTestMap.getCanvas() ===
        document.querySelector('.maplibregl-canvas'),
    ),
  ).toBe(true);
  await closeBuildingModel(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByLabel('Building opacity', { exact: true }),
  ).toHaveValue('0.35');
  await page.getByLabel('Map tilt', { exact: true }).fill('36');
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
    .toBe(36);
  await page.evaluate(() => window.editorTestMap.setPitch(43));
  await expect(page.getByLabel('Map tilt', { exact: true })).toHaveValue('43');
  await page.screenshot({ path: 'test-results/view-settings-editor.png' });
  await page
    .getByRole('button', { name: 'Close settings', exact: true })
    .click();
  await page.getByRole('button', { name: 'Close properties' }).click();
  await page.getByRole('button', { name: 'Switch to 2D', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
  const savedBeforeDrawing = structuredClone(state.edits());
  await page.getByRole('button', { name: 'Draw path', exact: true }).click();
  await clickMap(page, [3.2005, 6.4601]);
  await clickMap(page, [3.2006, 6.4601]);
  await expect(page.locator('.drawing-progress')).toContainText(
    '2 points placed',
  );
  const progress = await page.locator('.drawing-progress').innerText();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Device', exact: true }).check();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTestMap.getPaintProperty('background', 'background-color'),
      ),
    )
    .toBe('#eee9dc');
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect(page.getByLabel('Map tilt', { exact: true })).toBeDisabled();
  await page
    .getByRole('button', { name: 'Close settings', exact: true })
    .click();
  await expect(page.locator('.drawing-progress')).toHaveText(progress);
  await expect(
    page.getByRole('button', { name: 'Finish', exact: true }),
  ).toBeEnabled();
  expect(state.edits()).toEqual(savedBeforeDrawing);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect
    .poll(async () => (await browserRecovery(page))?.unfinished?.kind)
    .toBe('path');
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await attachMap(page);
  await page.getByRole('button', { name: 'Resume drawing' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTestMap.getPaintProperty('background', 'background-color'),
      ),
    )
    .toBe('#293e52');
  await expect(
    page.getByRole('button', { name: 'Finish', exact: true }),
  ).toBeEnabled();
});
