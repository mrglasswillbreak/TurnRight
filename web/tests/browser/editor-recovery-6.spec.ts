import { test, expect } from './coverage-fixture';
import { setup } from './editor-fixture';
import { unifiedModelFixture } from './editor-model-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('curved exterior walls retain details and undo while new courtyard boundaries stay recoverable', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const { dialog, server, wall } = await unifiedModelFixture(page);
  const original = JSON.stringify(wall()!.elements);
  const canvas = await dialog
    .locator('.photo-model-canvas canvas')
    .elementHandle();
  await dialog.getByRole('button', { name: 'Outline', exact: true }).click();
  await dialog.getByText('Curves and rounded corners', { exact: true }).click();
  await dialog.getByLabel('Arc bulge (m)', { exact: true }).fill('-3');
  await dialog
    .getByRole('button', { name: 'Apply edge shape', exact: true })
    .click();
  const saved = () => server.edits().find((e) => e.id === 'library');
  await expect
    .poll(() => saved()?.properties.modelDocument?.curves.length)
    .toBe(1);
  expect(JSON.stringify(wall()!.elements)).toBe(original);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(() => saved()?.properties.modelDocument?.curves.length || 0)
    .toBe(0);
  await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect
    .poll(() => saved()?.properties.modelDocument?.curves.length)
    .toBe(1);
  await page.screenshot({ path: info.outputPath('curved-wall-outline.png') });
  await dialog.getByRole('button', { name: 'Add wall', exact: true }).click();
  await dialog
    .getByRole('combobox', { name: 'Boundary operation', exact: true })
    .selectOption('courtyard');
  await dialog
    .getByRole('combobox', { name: 'Boundary shape', exact: true })
    .selectOption('ellipse');
  await dialog.getByLabel('Boundary east (m)', { exact: true }).fill('0');
  await dialog.getByLabel('Boundary north (m)', { exact: true }).fill('0');
  await dialog
    .getByRole('button', { name: 'Add boundary point', exact: true })
    .click();
  await page.screenshot({ path: info.outputPath('add-wall-courtyard.png') });
  await dialog
    .getByRole('button', { name: 'Apply boundary', exact: true })
    .click();
  await expect
    .poll(() => saved()?.properties.modelDocument?.curves.length)
    .toBe(5);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(() => saved()?.properties.modelDocument?.curves.length)
    .toBe(1);
  expect(
    await canvas!.evaluate(
      (el) => el === document.querySelector('.photo-model-canvas canvas'),
    ),
  ).toBe(true);
});

test('editor reliability: imported names with extra spaces remain searchable without renaming', async ({
  page,
}) => {
  const server = await setup(page, false, false, {
    mutateCampus: (data) => {
      const building = data.map.features.find(
        (f) => f.properties?.kind === 'building',
      )!;
      building.properties!.name = 'LASU  Clinic';
    },
  });
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Search map features' })
    .fill('  lasu clinic  ');
  const result = page.locator('.editor-feature-list button');
  await expect(result).toHaveCount(1);
  await result.click();
  await expect(
    page.getByRole('textbox', { name: 'Name', exact: true }),
  ).toHaveValue('LASU  Clinic');
  expect(server.edits()).toHaveLength(0);
});
