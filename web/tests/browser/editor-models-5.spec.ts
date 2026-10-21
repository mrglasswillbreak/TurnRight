import { test, expect } from './coverage-fixture';
import type { MapEdit } from '../../src/types';
import { browserCampus, setup } from './editor-fixture';
import { unifiedModelFixture } from './editor-model-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('restoring one published building previews the repair and supports undo without changing other drafts', async ({
  page,
}) => {
  const building = browserCampus().map.features.find(
    (f) => f.properties?.id === 'library',
  )!;
  const published: MapEdit = {
    id: 'library',
    kind: 'building',
    geometry: building.geometry,
    properties: { ...building.properties, height: 15, heightMode: 'metres' },
  };
  const changed: MapEdit = {
    ...published,
    properties: { ...published.properties, height: 6 },
  };
  const other: MapEdit = {
    id: 'gate',
    kind: 'place',
    geometry: { type: 'Point', coordinates: [3.2, 6.46] },
    properties: { name: 'Other draft', category: 'gate' },
  };
  const server = await setup(page, false, false, {
    initialEdits: [changed, other],
    publishedEdits: [published],
  });
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByLabel('Search map features').fill('Library');
  await page
    .locator('.editor-feature-list button')
    .filter({
      has: page.locator('.editor-feature-icon.building'),
      hasText: 'Library',
    })
    .first()
    .click();
  await page
    .getByRole('button', { name: 'Restore published building', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Restore published building · review before applying',
    }),
  ).toBeVisible();
  expect(
    server.edits().find((e) => e.id === 'library')?.properties.height,
  ).toBe(6);
  await page
    .getByRole('button', { name: 'Apply reviewed repair', exact: true })
    .click();
  await expect
    .poll(
      () => server.edits().find((e) => e.id === 'library')?.properties.height,
    )
    .toBe(15);
  expect(server.edits().find((e) => e.id === 'gate')?.properties).toEqual(
    other.properties,
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(
      () => server.edits().find((e) => e.id === 'library')?.properties.height,
    )
    .toBe(6);
  expect(server.edits().find((e) => e.id === 'gate')?.properties).toEqual(
    other.properties,
  );
});

test('unified model repairs empty recovered wall records without crashing or changing other properties', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  const { server, dialog } = await unifiedModelFixture(page, {
    prepareWall: false,
    repairMode: true,
    properties: {
      height: 6,
      heightEstimated: true,
      appearance: { windows: false, facades: { 'library:wall:0:0:0': {} } },
    },
  });
  await expect(
    dialog.getByRole('heading', { name: /Repair wall records/ }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Remove empty wall record' })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Add window', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => server.edits()[0].properties.appearance?.facades)
    .toEqual({});
  expect(server.edits()[0].properties.appearance?.windows).toBe(false);
  expect(server.edits()[0].properties.height).toBe(6);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: /Repair wall records/ }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Remove empty wall record' })
    .click();
  await dialog.getByRole('button', { name: 'Add window', exact: true }).click();
  await expect
    .poll(
      () =>
        server.edits()[0].properties.appearance?.facades?.['library:wall:0:0:0']
          ?.elements.length,
    )
    .toBe(1);
  expect(failures).toEqual([]);
});

test('unified model preserves incomplete nonempty records for recovery', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  const { server, dialog } = await unifiedModelFixture(page, {
    prepareWall: false,
    repairMode: true,
    properties: {
      appearance: {
        facades: { 'library:wall:0:0:0': { notes: 'Keep this observation' } },
      },
    },
  });
  await expect(
    dialog.getByText(/contents have not been discarded/),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Remove empty wall record' }),
  ).toHaveCount(0);
  await dialog
    .getByRole('button', { name: /^(Close workspace|Back to map)$/ })
    .click();
  expect(
    server.edits()[0].properties.appearance?.facades?.['library:wall:0:0:0']
      ?.notes,
  ).toBe('Keep this observation');
  expect(failures).toEqual([]);
});

for (const width of [390, 1440])
  test(`unified model Add tools preserve generated details at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const { dialog, wall } = await unifiedModelFixture(page, {
      prepareWall: false,
      properties: {
        height: 6,
        floors: 2,
        appearance: { windows: true, roofForm: 'flat' },
      },
    });
    if (width <= 900)
      await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await dialog.getByRole('button', { name: 'Add door', exact: true }).click();
    await expect
      .poll(() => wall()?.elements.some((e) => e.kind === 'door'))
      .toBe(true);
    const first = structuredClone(wall()!);
    expect(first.elements.some((e) => e.kind === 'window' && e.count > 1)).toBe(
      true,
    );
    expect(first.elements.some((e) => e.kind === 'trim')).toBe(true);
    await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(() => wall()).toBeUndefined();
    await expect(
      dialog.locator('.model-detail-item[aria-selected="true"]'),
    ).toHaveCount(0);
    if (width <= 900)
      await dialog.getByRole('button', { name: 'More', exact: true }).click();
    if (width <= 900)
      await dialog
        .getByRole('button', { name: 'Selection actions', exact: true })
        .click();
    else {
      await dialog
        .getByRole('button', { name: 'Edit surface', exact: true })
        .click();
      await dialog.getByRole('application', { name: /Wall canvas/ }).focus();
      await page.keyboard.press('Shift+F10');
    }
    await expect(
      page.getByRole('menuitem', { name: 'Duplicate', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect.poll(() => wall()?.elements).toEqual(first.elements);
    for (const kind of [
      'window',
      'column',
      'balcony',
      'canopy',
      'parapet',
      'trim',
    ]) {
      const count = wall()!.elements.length;
      if (
        width <= 900 &&
        !(await dialog
          .getByRole('button', { name: `Add ${kind}`, exact: true })
          .isVisible())
      )
        await dialog.getByRole('button', { name: 'More', exact: true }).click();
      await dialog
        .getByRole('button', { name: `Add ${kind}`, exact: true })
        .click();
      await expect.poll(() => wall()?.elements.length).toBe(count + 1);
      expect(wall()!.elements.at(-1)?.kind).toBe(kind);
    }
    expect(wall()!.elements.slice(0, first.elements.length)).toEqual(
      first.elements,
    );
    await expect(dialog.locator('footer [role="alert"]')).toHaveCount(0);
  });

test('unified model retains a blocked insertion and repairs building height without leaving the workspace', async ({
  page,
}) => {
  const { server, dialog, wall } = await unifiedModelFixture(page, {
    prepareWall: false,
    properties: { heightMode: 'floors', floors: undefined },
  });
  await dialog.getByRole('button', { name: 'Add window', exact: true }).click();
  await expect(dialog.locator('footer [role="alert"]')).toContainText(
    'floor count',
  );
  await expect(dialog.getByLabel('Width (m)', { exact: true })).toHaveValue(
    '1.5',
  );
  expect(wall()).toBeUndefined();
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
  await expect(
    dialog.getByRole('button', { name: 'Save unfinished wall' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Check building height' }).click();
  const floors = dialog.getByLabel('Building floors', { exact: true });
  await floors.fill('3');
  await floors.press('Enter');
  await expect
    .poll(
      () => server.edits().find((e) => e.id === 'library')?.properties.floors,
    )
    .toBe(3);
  await dialog.getByRole('button', { name: 'Details', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save unfinished wall' }).click();
  await expect.poll(() => wall()?.elements.length).toBe(1);
  await expect(
    dialog.getByRole('button', { name: 'Save unfinished wall' }),
  ).toHaveCount(0);
  expect(wall()?.elements[0].kind).toBe('window');
  await dialog.getByRole('button', { name: 'Appearance', exact: true }).click();
  await dialog.getByLabel('Building height information').selectOption('metres');
  await dialog.getByLabel('Building height (m)', { exact: true }).fill('');
  await dialog.getByLabel('Building height (m)', { exact: true }).press('Tab');
  await dialog
    .getByRole('button', { name: 'Use unknown building height' })
    .click();
  await expect
    .poll(
      () => server.edits().find((e) => e.id === 'library')?.properties.height,
    )
    .toBeUndefined();
  expect(
    server.edits().find((e) => e.id === 'library')?.properties.floors,
  ).toBeUndefined();
  await expect(dialog.locator('header output')).not.toContainText(
    'Unsaved input',
  );
});

test('unified model rejected appearance input stays with its wall and selection follows appearance tools', async ({
  page,
}) => {
  const { dialog, server } = await unifiedModelFixture(page, {
    prepareWall: false,
    properties: { heightMode: 'floors', floors: undefined },
  });
  await dialog.getByRole('button', { name: 'Appearance', exact: true }).click();
  const spacing = dialog.getByLabel('Window spacing (m)', { exact: true });
  await spacing.fill('12');
  await spacing.press('Enter');
  await expect(spacing).toHaveAttribute('aria-invalid', 'true');
  await dialog
    .getByLabel('Wall', { exact: true })
    .selectOption('library:wall:0:0:1');
  await expect(dialog.getByLabel('Wall', { exact: true })).toHaveValue(
    'library:wall:0:0:1',
  );
  await expect(spacing).not.toHaveValue('12');
  await dialog
    .getByLabel('Wall', { exact: true })
    .selectOption('library:wall:0:0:0');
  await expect(spacing).toHaveValue('12');
  await dialog.getByLabel('Building floors', { exact: true }).fill('2');
  await dialog.getByLabel('Building floors', { exact: true }).press('Enter');
  await spacing.press('Enter');
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === 'library')?.properties.appearance
          ?.walls?.['library:wall:0:0:0']?.windowSpacing,
    )
    .toBe(12);
  expect(
    server.edits().find((e) => e.id === 'library')?.properties.appearance
      ?.walls?.['library:wall:0:0:1']?.windowSpacing,
  ).toBeUndefined();
  await dialog
    .getByLabel('Wall', { exact: true })
    .selectOption('library:wall:0:0:1');
  await dialog.getByRole('button', { name: 'Details', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add column', exact: true }).click();
  await expect
    .poll(
      () =>
        server
          .edits()
          .find((e) => e.id === 'library')
          ?.properties.appearance?.facades?.['library:wall:0:0:1']?.elements.at(
            -1,
          )?.kind,
    )
    .toBe('column');
});

test('unified model retries failed preview without losing draft or camera', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Base = Worker;
    window.Worker = class extends Base {
      modelPreview: boolean;
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        this.modelPreview = !!document.querySelector('.photo-model-workspace');
      }
      postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (
          this.modelPreview &&
          document.documentElement.dataset.failModelPreview === 'true'
        ) {
          delete document.documentElement.dataset.failModelPreview;
          throw new DOMException(
            'Injected preview delivery failure',
            'DataCloneError',
          );
        }
        return super.postMessage(
          message,
          Array.isArray(options) ? { transfer: options } : options,
        );
      }
    };
  });
  const { dialog, wall } = await unifiedModelFixture(page);
  await dialog.getByRole('button', { name: 'Orbit', exact: true }).click();
  const canvas = await dialog.locator('canvas').elementHandle();
  await page.evaluate(() => {
    document.documentElement.dataset.failModelPreview = 'true';
  });
  await dialog.getByLabel('Width (m)', { exact: true }).fill('1.9');
  await dialog.getByLabel('Width (m)', { exact: true }).press('Enter');
  await expect(
    dialog.getByRole('button', { name: 'Retry model preview', exact: true }),
  ).toBeVisible();
  await expect.poll(() => wall()?.elements[0].width).toBe(1.9);
  await dialog
    .getByRole('button', { name: 'Retry model preview', exact: true })
    .click();
  await expect(
    dialog.getByText('Estimated dimensions · selected wall outlined'),
  ).toBeVisible();
  expect(await canvas!.evaluate((el) => el.isConnected)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', {
      name: /^Edit model$/,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Name', exact: true }),
  ).toHaveValue('Library');
});
