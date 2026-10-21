import { expect, test } from './coverage-fixture';
test('render failure offers recovery without clearing saved device data', async ({
  page,
}) => {
  let crash = true;
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('recovery-seeded')) {
      localStorage.setItem('recovery-control', 'retained');
      sessionStorage.setItem('recovery-seeded', 'true');
    }
  });
  await page.route('**/src/App.tsx', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: crash
        ? 'export default function App() { throw new Error("synthetic render failure"); }'
        : 'export default function App() { return "Recovered test view"; }',
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText(
    'TurnRight could not finish opening this view',
  );
  expect(
    await page.evaluate(() => localStorage.getItem('recovery-control')),
  ).toBe('retained');
  crash = false;
  await page.getByRole('button', { name: 'Reload TurnRight' }).click();
  await expect(page.getByText('Recovered test view')).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('recovery-control')),
  ).toBe('retained');
});
