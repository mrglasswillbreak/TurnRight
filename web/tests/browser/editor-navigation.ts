import { expect, type Page } from '@playwright/test';
/** Exercise the visible destinations in the unified editor. */
export async function editorTask(
  page: Page,
  task:
    | 'Settings'
    | 'Sources'
    | 'Releases'
    | 'Duplicates'
    | 'Reports'
    | 'Edit'
    | 'Campuses',
) {
  if (new URL(page.url()).pathname !== '/admin') {
    await page.getByRole('button', { name: task, exact: true }).click();
    return;
  }
  if (task === 'Settings' || task === 'Campuses') {
    await page.getByLabel('Campus menu', { exact: true }).click();
    await page
      .getByRole('button', {
        name:
          task === 'Settings' ? 'Settings' : 'Switch campus / manage sources',
        exact: true,
      })
      .click();
  } else if (task === 'Edit') {
    await page.getByRole('button', { name: /Search commands/ }).click();
    await page
      .getByRole('option', { name: 'Return to map', exact: true })
      .click();
  } else {
    const views = page.getByRole('navigation', { name: 'Review views' });
    if (!(await views.isVisible()))
      await page.getByRole('button', { name: 'Review', exact: true }).click();
    await views
      .getByRole('button', {
        name:
          task === 'Sources'
            ? 'Source updates'
            : task === 'Releases'
              ? 'Draft changes'
              : task,
        exact: true,
      })
      .click();
  }
}
export async function layerProperties(page: Page, name?: string) {
  const catalogue = page.getByRole('complementary', {
    name: 'Layers and datasets',
  });
  await expect(
    page.locator('aside.editor-catalogue, .editor-catalogue-toggle'),
  ).toHaveCount(1);
  if (!(await catalogue.isVisible()))
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
  if (name) {
    await catalogue.getByLabel('Actions for ' + name, { exact: true }).click();
    await catalogue
      .getByRole('button', { name: 'Properties and styling', exact: true })
      .click();
  } else {
    await catalogue.getByText('Add data', { exact: true }).click();
    await catalogue
      .getByRole('button', { name: 'Create layer or folder', exact: true })
      .click();
  }
  await expect(
    page.getByRole('region', { name: 'Campus layers' }),
  ).toBeVisible();
}
export async function layerTable(page: Page, name?: string) {
  const catalogue = page.getByRole('complementary', {
    name: 'Layers and datasets',
  });
  await expect(
    page.locator('aside.editor-catalogue, .editor-catalogue-toggle'),
  ).toHaveCount(1);
  if (!(await catalogue.isVisible()))
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await catalogue
    .locator('.catalogue-name')
    .filter({ hasText: name || 'Buildings' })
    .first()
    .click();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
}
