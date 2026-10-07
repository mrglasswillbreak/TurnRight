import { expect, type Page } from '@playwright/test';
export async function collapseExplorer(page: Page) {
  const toggle = page.getByRole('button', {
    name: 'Toggle explorer',
    exact: true,
  });
  await expect(toggle).toBeEnabled();
  if ((await toggle.getAttribute('aria-pressed')) === 'true')
    await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
}
export async function openEditorSection(
  page: Page,
  name: 'Sources' | 'Duplicates' | 'Reports' | 'Releases' | 'Edit',
) {
  const primary =
    name === 'Releases' ? 'Publish' : name === 'Edit' ? 'Edit' : 'Review';
  const ids = { Edit: 'map', Review: 'gis-review', Publish: 'gis-publish' };
  const chooser = page.getByLabel('Workspace', { exact: true });
  if (await chooser.isVisible()) await chooser.selectOption(ids[primary]);
  else
    await page
      .getByRole('navigation', { name: 'Editor sections' })
      .getByRole('button', { name: primary, exact: true })
      .click();
  if (name !== 'Edit') {
    const button = page
      .getByRole('navigation', { name: 'Workspace tools' })
      .getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    await button.click();
  }
}
