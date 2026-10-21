import { test, expect } from './coverage-fixture';
import type { Map as MapInstance } from 'maplibre-gl';
import type { GisWorkflowFixture } from './gis-workflow.spec';
export function registerDatasetsAndAnalysis(
  fixture: () => GisWorkflowFixture,
): void {
  test('paged GIS data, typed edit, buffer inspection and immutable review stay connected', async ({
    page,
  }) => {
    const { calls } = await fixture().setup(page);
    const nav = page.getByRole('navigation', { name: 'Editor sections' });
    await nav.getByRole('button', { name: 'Data', exact: true }).click();
    await expect(page.getByText(/100,000 matching/)).toBeVisible();
    await expect(
      page.locator('.gis-table-scroll').first().locator('tbody tr'),
    ).toHaveCount(100);
    await page.getByRole('checkbox', { name: 'Select this page' }).check();
    await expect(
      page.getByRole('checkbox', { name: 'Select this page' }),
    ).toBeChecked();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect
      .poll(
        () =>
          calls.filter((c) => c.action === 'gis-query').at(-1)?.payload.cursor,
      )
      .toBe('page-two');
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    const height = page
      .getByRole('textbox', { name: 'height', exact: true })
      .first();
    await height.fill('12');
    await height.press('Tab');
    await expect
      .poll(() =>
        calls.some(
          (c) =>
            c.action === 'gis-attributes-save' &&
            c.payload.features[0].values.height === 12,
        ),
      )
      .toBe(true);
    await nav.getByRole('button', { name: 'Analyze', exact: true }).click();
    await page.getByLabel('Result name', { exact: true }).fill('Tree buffers');
    await page.getByRole('button', { name: 'Run buffer', exact: true }).click();
    await expect(page.getByText('Tree buffers', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Inspect staged output' }).click();
    await page
      .getByRole('checkbox', { name: 'I inspected the result and diagnostics' })
      .check();
    await page.getByRole('button', { name: 'Apply as private layer' }).click();
    await expect
      .poll(() => calls.some((c) => c.action === 'gis-job-apply'))
      .toBe(true);
    await nav.getByRole('button', { name: 'Review', exact: true }).click();
    await page
      .getByLabel('Summary', { exact: true })
      .fill('Trees and buffers checked');
    await page
      .getByRole('button', { name: 'Validate and submit snapshot' })
      .click();
    await page
      .getByRole('button', { name: 'Inspect immutable submission' })
      .click();
    await page
      .getByLabel('Decision reason', { exact: true })
      .fill('Independent review is unavailable for this owner test');
    await expect(
      page.getByRole('button', { name: 'Approve exact snapshot' }),
    ).toBeDisabled();
    await page
      .getByRole('checkbox', { name: /Original-owner override/ })
      .check();
    await page.getByRole('button', { name: 'Approve exact snapshot' }).click();
    await expect
      .poll(() =>
        calls.some(
          (c) =>
            c.action === 'gis-review-decide' && c.payload.override === true,
        ),
      )
      .toBe(true);
    expect(
      calls
        .filter((c) => c.action === 'gis-query')
        .every((c) => (c.payload.limit ?? 100) <= 500),
    ).toBe(true);
    await page.screenshot({
      path: 'test-results/gis-workflow.png',
      fullPage: true,
    });
  });
  test('review-only members have no geometry or attribute editing controls', async ({
    page,
  }) => {
    await fixture().setup(page, ['reviewer']);
    await page
      .getByRole('navigation', { name: 'Editor sections' })
      .getByRole('button', { name: 'Data', exact: true })
      .click();
    await expect(page.getByText(/100,000 matching/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Edit geometry' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('textbox', { name: 'height', exact: true }).first(),
    ).toBeDisabled();
  });
  test('GIS styling, asset CSV join and map PNG export are reachable', async ({
    page,
  }) => {
    const { calls } = await fixture().setup(page);
    const nav = page.getByRole('navigation', { name: 'Editor sections' });
    await nav.getByRole('button', { name: 'Data', exact: true }).click();
    await page
      .getByText('Schema, styling and publication fields', { exact: true })
      .click();
    const domain = page.getByLabel('height coded domain', { exact: true });
    await domain.fill('not a number');
    await page.getByRole('button', { name: 'Save schema and style' }).click();
    await expect(page.getByRole('alert')).toContainText('finite number');
    expect(calls.some((c) => c.action === 'gis-dataset-save')).toBe(false);
    await domain.fill('');
    await page
      .getByRole('combobox', { name: 'Style', exact: true })
      .selectOption('graduated');
    await page
      .getByRole('combobox', { name: 'Classification field', exact: true })
      .selectOption('height');
    await page.getByRole('button', { name: 'Add legend class' }).click();
    await page.getByLabel('Class 1 value', { exact: true }).fill('10');
    await page.getByLabel('Class 1 label', { exact: true }).fill('Small trees');
    await page.getByRole('button', { name: 'Save schema and style' }).click();
    await expect
      .poll(
        () =>
          calls.find((c) => c.action === 'gis-dataset-save')?.payload.dataset
            .style.classes?.[0].maximum,
      )
      .toBe(10);
    await page.getByText('Import an attribute CSV', { exact: true }).click();
    await page.getByLabel('Import CSV', { exact: true }).setInputFiles({
      name: 'assets.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('asset,height\n001,7\n002,8'),
    });
    await expect
      .poll(() => calls.some((c) => c.action === 'gis-csv-import'))
      .toBe(true);
    await nav.getByRole('button', { name: 'Analyze', exact: true }).click();
    await page
      .getByRole('button', { name: 'attribute join', exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Overlay / join table', exact: true })
      .selectOption('assets');
    await page
      .getByRole('combobox', { name: 'Input key', exact: true })
      .selectOption('asset');
    await page
      .getByRole('combobox', { name: 'Table key', exact: true })
      .selectOption('asset');
    await page
      .getByRole('button', { name: 'Run attribute join', exact: true })
      .click();
    await expect
      .poll(() => calls.find((c) => c.action === 'gis-job-start')?.payload.tool)
      .toBe('attribute-join');
    await nav.getByRole('button', { name: 'Publish', exact: true }).click();
    await page
      .getByText('Map layout: A4 / A3 PNG and PDF', { exact: true })
      .click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
    const png = await download;
    expect(png.suggestedFilename()).toBe('Campus_map.png');
    const { readFile } = await import('node:fs/promises');
    const exported = await readFile((await png.path())!);
    expect(exported.toString('utf8')).toContain('TurnRightLayout');
    expect(exported.toString('utf8')).toContain(
      '"kind":"turnright-map-layout"',
    );
    const sharp = (await import('sharp')).default;
    const bytes = sharp((await png.path())!);
    expect(await bytes.metadata()).toMatchObject({
      width: 1754,
      height: 1240,
      format: 'png',
    });
    const pixels = await bytes
      .extract({ left: 300, top: 200, width: 800, height: 500 })
      .stats();
    expect(pixels.channels[0].stdev).toBeGreaterThan(2);
  });
  test('GIS released layouts retain immutable package identity and reject a different release', async ({
    page,
  }) => {
    const { data } = await fixture().setup(page);
    await page.goto(
      '/?mapLayout=1&layoutVersion=' + encodeURIComponent(data.version),
    );
    const panel = page.getByRole('complementary', {
      name: 'Released map layout',
    });
    await expect(panel).toContainText('Release ' + data.version);
    // Wait for initial public framing before requesting another camera change.
    // The panel mounts while the public map is still loading its package.
    await page.waitForFunction(() => {
      type Hook = { memoizedState?: { current?: MapInstance }; next?: Hook };
      type Fiber = { memoizedState?: Hook; return?: Fiber };
      const element = document.querySelector('.map-canvas');
      const key = Object.keys(element || {}).find((k) =>
        k.startsWith('__reactFiber'),
      );
      let fiber =
        element && key
          ? (element as unknown as Record<string, Fiber>)[key]
          : undefined;
      while (fiber) {
        let hook = fiber.memoizedState;
        while (hook) {
          const map = hook.memoizedState?.current;
          if (
            typeof map?.getCanvas === 'function' &&
            typeof map?.project === 'function'
          ) {
            window.editorTestMap = map;
            return map.loaded() && !map.isMoving() && map.areTilesLoaded();
          }
          hook = hook.next;
        }
        fiber = fiber.return;
      }
      return false;
    });
    await panel.getByRole('button', { name: 'Set flat view' }).click();
    await page.waitForFunction(() => {
      const map = window.editorTestMap;
      return (
        map.loaded() &&
        !map.isMoving() &&
        map.areTilesLoaded() &&
        map.getPitch() < 1
      );
    });
    const download = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'Export released PNG' }).click();
    const file = await download;
    const { readFile } = await import('node:fs/promises');
    const bytes = await readFile((await file.path())!);
    expect(bytes.toString('utf8')).toContain('"status":"released"');
    expect(bytes.toString('utf8')).toContain(
      '"version":' + JSON.stringify(data.version),
    );
    expect(bytes.toString('utf8')).toContain('"assets":');
    await page.goto('/?mapLayout=1&layoutVersion=different-release');
    await expect(panel.getByRole('alert')).toContainText(
      'differs from the requested release',
    );
    await expect(
      panel.getByRole('button', { name: 'Export released PNG' }),
    ).toBeDisabled();
  });
}
