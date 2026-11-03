import { expect, type Page } from '@playwright/test';
import { browserCampus, setup } from './editor-fixture';

export async function waitForBuildingHandoffReady(page: Page) {
  const drawPath = page.getByRole('button', { name: 'Draw path', exact: true });
  const properties = page.getByRole('complementary', {
    name: 'Feature properties',
  });
  // Full navigation loads both the editor and its lazy building tools.
  await expect
    .poll(
      async () => {
        if (!(await drawPath.isVisible()) || !(await properties.isVisible()))
          return false;
        const enabled = await drawPath.evaluateAll(
          (buttons) =>
            buttons.length === 1 &&
            !buttons[0].matches(':disabled') &&
            !buttons[0].closest('[aria-disabled="true"]'),
        );
        return (
          enabled &&
          !(await properties
            .getByText('Loading building tools…', { exact: true })
            .isVisible())
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

export async function openBuildingModel(
  page: Page,
  mode: 'appearance' | 'roof' | 'outline' = 'appearance',
) {
  await page.getByRole('button', { name: 'Edit model', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const compact = dialog.getByLabel('Model editing mode', { exact: true });
  const desktop = dialog.getByRole('button', {
    name: mode[0].toUpperCase() + mode.slice(1),
    exact: true,
  });
  await expect(
    compact.or(desktop).filter({ visible: true }).first(),
  ).toBeVisible();
  if (await compact.isVisible()) await compact.selectOption(mode);
  else await desktop.click();
  return dialog;
}

export async function closeBuildingModel(page: Page) {
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^(Back to map|Close workspace)$/ })
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

export async function focusModels(page: Page, phone = false) {
  await page.evaluate(
    (phone) =>
      void window.editorTestMap.jumpTo({
        center: [3.19978, 6.47109],
        zoom: 18,
        pitch: 50,
        bearing: -18,
        padding: {
          top: 0,
          right: 0,
          bottom: phone ? 350 : 0,
          left: phone ? 0 : 450,
        },
      }),
    phone,
  );
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
        ),
      { timeout: 30_000 },
    )
    .toContain('arcgis:University_Property:120');
}

export async function modelAction(page: Page, name: string) {
  // Wait for the previous popup and its focus restoration to finish before reopening.
  await expect(page.locator('.model-action-menu')).toHaveCount(0);
  const dialog = page.getByRole('dialog');
  const attached = dialog.getByRole('button', {
    name: 'Selected detail actions',
    exact: true,
  });
  if (await attached.isVisible()) await attached.click();
  else if (
    await dialog
      .getByRole('button', { name: 'Selection actions', exact: true })
      .isVisible()
  )
    await dialog
      .getByRole('button', { name: 'Selection actions', exact: true })
      .click();
  else {
    await dialog.getByRole('button', { name: 'More', exact: true }).click();
    await dialog
      .getByRole('button', { name: 'Selection actions', exact: true })
      .click();
  }
  await page.getByRole('menuitem', { name, exact: true }).click();
  await expect(page.locator('.model-action-menu')).toHaveCount(0);
}

export async function unifiedModelFixture(
  page: Page,
  options: {
    prepareWall?: boolean;
    noWebGL?: boolean;
    repairMode?: boolean;
    properties?: Record<string, unknown>;
  } = {},
) {
  const building = browserCampus().map.features.find(
    (f) => f.properties?.id === 'library',
  )!;
  const server = await setup(page, false, false, {
    initialEdits: [
      {
        id: 'library',
        kind: 'building',
        geometry: building.geometry,
        properties: { ...building.properties, ...options.properties },
      },
    ],
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
  await expect(
    page.getByRole('complementary', { name: 'Feature properties' }),
  ).toBeVisible();
  const collapse = page.getByRole('button', { name: 'Collapse explorer' });
  if (await collapse.isVisible()) await collapse.click();
  if (options.noWebGL)
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...args: unknown[]
      ) {
        return type.startsWith('webgl')
          ? null
          : original.apply(this, [type, ...args] as Parameters<
              typeof original
            >);
      } as typeof original;
    });
  await page
    .getByRole('button', {
      name: /^Edit model$/,
      exact: true,
    })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  if (options.repairMode) return { server, dialog, wall: () => undefined };
  await dialog
    .getByRole('button', { name: 'Edit surface', exact: true })
    .click();
  if (await dialog.getByLabel('Model editing mode').isVisible()) {
    await dialog
      .getByRole('button', { name: 'Choose wall', exact: true })
      .click();
    await dialog.locator('[data-model-wall="library:wall:0:0:0"]').click();
  } else
    await dialog.getByLabel('Mapped wall').selectOption('library:wall:0:0:0');
  if (options.prepareWall !== false) {
    if (await dialog.getByLabel('Model editing mode').isVisible())
      await dialog.getByRole('button', { name: 'More', exact: true }).click();
    await dialog
      .getByRole('button', { name: 'Preview editable layout', exact: true })
      .click();
    await dialog
      .getByRole('button', { name: 'Use editable layout', exact: true })
      .click();
    if (await dialog.getByLabel('Model editing mode').isVisible())
      await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await dialog
      .getByRole('button', { name: 'Add window', exact: true })
      .click();
    await expect
      .poll(
        () =>
          server.edits().find((e) => e.id === 'library')?.properties.appearance
            ?.facades?.['library:wall:0:0:0']?.elements.length,
      )
      .toBe(1);
  }
  return {
    server,
    dialog,
    wall: () =>
      server.edits().find((e) => e.id === 'library')?.properties.appearance
        ?.facades?.['library:wall:0:0:0'],
  };
}
