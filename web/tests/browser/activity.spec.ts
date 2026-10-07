import { test, expect } from '@playwright/test';
test('compact activity preserves background work, announces attention and supports keyboard dismissal', async ({
  page,
  context,
}) => {
  await page.route('**/api/admin', (route) =>
    route.fulfill({ json: { jobs: [], releases: [], imports: [] } }),
  );
  await page.goto('/tests/browser/activity-harness.html');
  const trigger = page.getByRole('button', { name: /^Activity/ });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  const box = (await trigger.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'drafts', exact: true }).click();
  await expect(trigger).toHaveText('');
  await trigger.click();
  await expect(page.getByText(/4 private drafts/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause uploads' })).toHaveCount(
    0,
  );
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: 'active', exact: true }).click();
  await expect(trigger).toHaveText('1');
  await trigger.click();
  await page.getByRole('button', { name: 'Pause uploads' }).click();
  await expect(
    page.getByRole('button', { name: 'Resume uploads' }),
  ).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveText('1');
  await trigger.click();
  await page.getByRole('button', { name: 'Resume uploads' }).click();
  await page.getByRole('heading', { name: 'Activity fixture' }).click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'another', exact: true }).click();
  await trigger.click();
  await expect(
    page.getByRole('button', { name: 'Pause uploads' }),
  ).toBeDisabled();
  await expect(page.getByText(/Active in another tab/)).toBeVisible();
  await page.getByRole('button', { name: 'failed', exact: true }).click();
  await expect(trigger).toHaveAccessibleName(/needs attention/);
  await expect(page.locator('[aria-live="polite"]')).toContainText(
    'needs attention',
  );
  await page.getByRole('button', { name: 'recovery', exact: true }).click();
  await trigger.click();
  await expect(page.locator('.activity-uploads')).toContainText(
    'Keep this tab open',
  );
  await context.setOffline(true);
  await expect(page.getByText(/Offline — server stages/)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/Offline — server stages/)).toHaveCount(0);
});
