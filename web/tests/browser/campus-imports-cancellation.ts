import { expect, test } from './coverage-fixture';
import type { CampusImportsFixture } from './campus-imports.spec';
export function registerCancellation(
  fixture: () => CampusImportsFixture,
): void {
  test('campus imports restore the last successful non-default public campus', async ({
    page,
  }) => {
    await fixture().setup(page);
    const remembered = () =>
      page.evaluate(() => localStorage.getItem('turnright:last-campus'));
    await page.goto('/?campus=north-campus');
    await expect.poll(remembered).toBe('north-campus');
    await page.goto('/');
    await expect(page).toHaveURL(/\/\?campus=north-campus$/);
    // The chooser's lazy module graph can finish after the restored map loads.
    await expect(
      page.getByRole('button', { name: 'Choose a campus', exact: true }),
    ).toBeVisible({ timeout: 30000 });
  });
  test('campus imports let an explicit LASU link replace the remembered campus', async ({
    page,
  }) => {
    await fixture().setup(page);
    const remembered = () =>
      page.evaluate(() => localStorage.getItem('turnright:last-campus'));
    // Establish the previous preference through a successful public load.
    await page.goto('/?campus=north-campus');
    await expect.poll(remembered).toBe('north-campus');
    await page.goto('/?campus=lasu');
    await expect.poll(remembered).toBe('lasu');
    await page.goto('/');
    await expect(page).toHaveURL(/\/\?campus=lasu$/);
    await expect(
      page.getByRole('button', { name: 'Choose a campus', exact: true }),
    ).toBeVisible({ timeout: 30000 });
  });
  test('campus imports retain the last successful campus after an unavailable link and recover', async ({
    page,
  }) => {
    await fixture().setup(page);
    const remembered = () =>
      page.evaluate(() => localStorage.getItem('turnright:last-campus'));
    await page.goto('/?campus=lasu');
    await expect.poll(remembered).toBe('lasu');
    await page.goto('/?campus=not-published');
    await expect(
      page.getByText('This campus is not published or is unavailable.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(await remembered()).toBe('lasu');
    await page.getByRole('link', { name: 'Open LASU', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Choose a campus', exact: true }),
    ).toBeVisible({ timeout: 30000 });
  });
}
