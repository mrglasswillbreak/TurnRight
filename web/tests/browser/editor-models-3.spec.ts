import { collapseExplorer, openEditorSection } from './editor-navigation';
import { test, expect } from './coverage-fixture';
import { setup } from './editor-fixture';
import { attachMap, clickMap, focusCampus } from './editor-map-helpers';
import { openBuildingModel, closeBuildingModel } from './editor-model-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('undoes the first saved source correction and keeps its building after reload', async ({
  page,
}) => {
  await setup(page);
  await focusCampus(page);
  await collapseExplorer(page);
  await clickMap(page, [3.20012, 6.46022]);
  const name = page
    .getByRole('complementary', { name: 'Feature properties' })
    .getByLabel('Name', { exact: true });
  const original = await name.inputValue();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
  const camera = await page.evaluate(() => {
    const m = window.editorTestMap;
    return [m.getCenter().lng, m.getCenter().lat, m.getZoom(), m.getPitch()];
  });
  await name.fill('Temporary label');
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  expect(
    await page.evaluate(() => {
      const m = window.editorTestMap;
      return [m.getCenter().lng, m.getCenter().lat, m.getZoom(), m.getPitch()];
    }),
  ).toEqual(camera);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  await page.reload();
  await attachMap(page);
  await focusCampus(page);
  await collapseExplorer(page);
  await clickMap(page, [3.20012, 6.46022]);
  await expect(name).toHaveValue(original);
});

test('renders the full campus in both appearances and keeps camera on draft updates', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page, true);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
  await page.screenshot({ path: 'test-results/full-campus-3d-light.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: 'test-results/full-campus-3d-dark.png' });
  expect(errors).toEqual([]);
});

test('supports dark appearance and small-screen review', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await setup(page);
  await page.screenshot({ path: 'test-results/editor-dark.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('button', { name: 'Switch to 3D', exact: true }),
  ).toBeVisible();
  await openEditorSection(page, 'Sources');
  await expect(
    page.getByRole('heading', { name: 'Source updates' }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/editor-mobile.png' });
});

for (const phone of [false, true]) {
  test(`building references ${phone ? 'phone' : 'desktop'}: review, apply, undo and reload without moving the map`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    if (phone) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const state = await setup(page);
    await focusCampus(page);
    await page
      .getByRole('button', { name: 'Switch to 3D', exact: true })
      .click();
    await page.evaluate(() =>
      window.editorTestMap.jumpTo({ zoom: 18, pitch: 48 }),
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
      .filter({ hasText: /^Building appearances$/ })
      .click();
    await expect(
      page.getByRole('button', { name: 'Apply 1 reviewed appearances' }),
    ).toBeEnabled();
    await page
      .locator('.building-reference-item:visible')
      .filter({ has: page.getByText('library', { exact: true }) })
      .locator('summary')
      .click();
    await expect(page.locator('.reference-values')).toContainText(
      'Window spacing',
    );
    expect(state.edits()).toHaveLength(0);
    await page.screenshot({
      path: testInfo.outputPath('reference-review.png'),
    });
    await page
      .getByRole('button', { name: 'Apply 1 reviewed appearances' })
      .click();
    await expect
      .poll(
        () =>
          state.edits().find((e) => e.id === 'library')?.properties.appearance
            ?.windows,
      )
      .toBe(true);
    await expect(
      page.getByRole('button', { name: 'Apply 0 reviewed appearances' }),
    ).toBeDisabled();
    expect(
      await page.evaluate(() => [
        window.editorTestMap.getCenter().toArray(),
        window.editorTestMap.getZoom(),
        window.editorTestMap.getPitch(),
      ]),
    ).toEqual(camera);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect
      .poll(() =>
        state
          .edits()
          .some(
            (e) =>
              e.id === 'library' &&
              !e.deleted &&
              e.properties.appearance?.windows,
          ),
      )
      .toBe(false);
    await expect(
      page.getByRole('button', { name: 'Apply 1 reviewed appearances' }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect
      .poll(() =>
        state
          .edits()
          .some(
            (e) =>
              e.id === 'library' &&
              !e.deleted &&
              e.properties.appearance?.windows,
          ),
      )
      .toBe(true);
    await page.reload();
    await attachMap(page);
    await openEditorSection(page, 'Sources');
    await page
      .getByText('Campus enrichment and building evidence', { exact: true })
      .click();
    await page
      .locator('summary')
      .filter({ hasText: /^Building appearances$/ })
      .click();
    await expect(
      page.getByRole('button', { name: 'Apply 0 reviewed appearances' }),
    ).toBeDisabled();
    expect(errors).toEqual([]);
  });
}

test('building references campus batch: all eligible facades regenerate without preview errors', async ({
  page,
}, testInfo) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const state = await setup(page, true, true);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await page.evaluate(() =>
    window.editorTestMap.jumpTo({
      center: [3.201, 6.4667],
      zoom: 17.6,
      pitch: 48,
    }),
  );
  await openEditorSection(page, 'Sources');
  await page
    .getByText('Campus enrichment and building evidence', { exact: true })
    .click();
  await page
    .locator('summary')
    .filter({ hasText: /^Building appearances$/ })
    .click();
  const apply = page.getByRole('button', {
    name: /^Apply \d+ reviewed appearances$/,
  });
  await expect(apply).toBeEnabled();
  const count = Number((await apply.innerText()).match(/\d+/)![0]);
  expect(count).toBeGreaterThanOrEqual(50);
  expect(state.edits()).toHaveLength(0);
  await apply.click();
  await expect.poll(() => state.edits().length, { timeout: 45000 }).toBe(count);
  expect(
    state.edits().find((e) => e.id === 'arcgis:University_Property:120')
      ?.properties.appearance?.parts?.['arcgis:University_Property:120:wing:1']
      ?.windows,
  ).toBe(false);
  await openEditorSection(page, 'Edit');
  await expect(page.getByText('Updating 3D preview…')).toHaveCount(0, {
    timeout: 45000,
  });
  await expect(
    page.getByRole('button', { name: 'Retry 3D preview', exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
      ),
    )
    .toContain('arcgis:University_Property:28');
  await page.screenshot({
    path: testInfo.outputPath('campus-appearances.png'),
  });
  expect(errors).toEqual([]);
});

test('building previews survive revisiting unedited buildings without rebuilding cached models', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.previewBuilds = [];
    const mapWorkers = new WeakSet<Worker>();
    let foundMapWorker = false;
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      message,
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      if (message?.features && !foundMapWorker) {
        mapWorkers.add(this);
        foundMapWorker = true;
      }
      if (message?.features && mapWorkers.has(this))
        window.previewBuilds.push(
          message.features.map(
            (f: { properties: { id: string } }) => f.properties.id,
          ),
        );
      return send.call(
        this,
        message,
        Array.isArray(options) ? { transfer: options } : options,
      );
    };
  });
  const state = await setup(page);
  await focusCampus(page);
  await collapseExplorer(page);
  await clickMap(page, [3.20012, 6.46022]);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  const rendered = () =>
    page.evaluate(() =>
      JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
    );
  await expect.poll(rendered).toContain('library');
  await page.getByRole('button', { name: 'Close properties' }).click();
  await expect.poll(rendered).not.toContain('library');
  await clickMap(page, [3.20068, 6.46022]);
  await expect.poll(rendered).toContain('unknown-building');
  await page.getByRole('button', { name: 'Close properties' }).click();
  await expect.poll(rendered).not.toContain('unknown-building');
  await clickMap(page, [3.20012, 6.46022]);
  await expect(
    page.getByRole('heading', { name: 'Library', exact: true }),
  ).toBeVisible();
  await expect.poll(rendered).toContain('library');
  expect(await page.evaluate(() => window.previewBuilds)).toEqual([
    ['library'],
    ['unknown-building'],
  ]);
  await openBuildingModel(page);
  await page.getByLabel('Wall colour', { exact: true }).fill('#123456');
  await page.getByLabel('Wall colour', { exact: true }).blur();
  await expect
    .poll(
      () =>
        state.edits().find((e) => e.id === 'library')?.properties.appearance
          ?.wallColour,
    )
    .toBe('#123456');
  await expect(page.getByText('Updating 3D preview…')).toHaveCount(0);
  await closeBuildingModel(page);
  await page.getByLabel('Name', { exact: true }).fill('Renamed library');
  await page.getByLabel('Name', { exact: true }).blur();
  await expect
    .poll(() => state.edits().find((e) => e.id === 'library')?.properties.name)
    .toBe('Renamed library');
  expect(await page.evaluate(() => window.previewBuilds)).toEqual([
    ['library'],
    ['unknown-building'],
    ['library'],
  ]);
});

test('building preview survives worker timeout, crash and obsolete replies', async ({
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
  const changeColour = async (value: string) => {
    await openBuildingModel(page);
    await page.getByLabel('Wall colour', { exact: true }).fill(value);
    await closeBuildingModel(page);
  };
  for (const [failure, value, message] of [
    ['timeout', '#223344', '3D preview timed out.'],
    ['crash', '#334455', '3D preview stopped.'],
  ] as const) {
    await page.evaluate((failure) => {
      const send = Worker.prototype.postMessage;
      window.addEventListener(
        'restore-preview-worker',
        () => {
          Worker.prototype.postMessage = send;
        },
        { once: true },
      );
      Worker.prototype.postMessage = function (
        message,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (message?.features) {
          if (failure === 'crash')
            this.dispatchEvent(
              new ErrorEvent('error', { message: 'Injected worker crash' }),
            );
          return; // Simulate a worker that cannot reply.
        }
        return send.call(
          this,
          message,
          Array.isArray(options) ? { transfer: options } : options,
        );
      };
    }, failure);
    await changeColour(value);
    await expect(page.getByText(message, { exact: false })).toBeVisible({
      timeout: 25000,
    });
    await expect.poll(rendered).toContain('library');
    await page.evaluate(() =>
      window.dispatchEvent(new Event('restore-preview-worker')),
    );
    if (failure === 'crash') await changeColour('#335577');
    else
      await page
        .getByRole('button', { name: 'Retry 3D preview', exact: true })
        .click();
    await expect(page.getByText('3D preview is outdated')).toHaveCount(0);
    await expect(page.getByText('Updating 3D preview…')).toHaveCount(0);
  }
  await page.evaluate(() => {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      message,
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      if (message?.features) {
        Worker.prototype.postMessage = send;
        // A late error for the previous edit must not replace a valid new result.
        setTimeout(
          () =>
            this.dispatchEvent(
              new MessageEvent('message', {
                data: {
                  revision: message.revision - 1,
                  results: [
                    { id: 'library', error: 'Obsolete preview failure' },
                  ],
                },
              }),
            ),
          700,
        );
      }
      return send.call(
        this,
        message,
        Array.isArray(options) ? { transfer: options } : options,
      );
    };
  });
  await changeColour('#445566');
  await page.waitForTimeout(1000);
  await expect(page.getByText('Updating 3D preview…')).toHaveCount(0);
  await expect(page.getByText('3D preview is outdated')).toHaveCount(0);
  await expect.poll(rendered).toContain('library');
});
