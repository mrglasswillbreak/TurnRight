import { expect, test } from './coverage-fixture';
import { readFile } from 'node:fs/promises';
test('render failure offers recovery without clearing saved device data', async ({
  page,
}, testInfo) => {
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
  const downloaded = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download diagnostic report' })
    .click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('turnright-diagnostics.json');
  const exported = await readFile((await download.path())!, 'utf8');
  const report = JSON.parse(exported) as {
    schemaVersion: number;
    events: Array<{ event: string; timestamp: string; occurrences: number }>;
  };
  expect(report.schemaVersion).toBe(1);
  expect(report.events.some((event) => event.event === 'render-failed')).toBe(
    true,
  );
  for (const event of report.events)
    expect(Object.keys(event).sort()).toEqual([
      'event',
      'occurrences',
      'timestamp',
    ]);
  expect(exported).not.toContain('synthetic render failure');
  expect(exported).not.toContain('recovery-control');
  expect(exported).not.toContain('retained');
  await testInfo.attach('diagnostic recovery screen', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  crash = false;
  await page.getByRole('button', { name: 'Reload TurnRight' }).click();
  await expect(page.getByText('Recovered test view')).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('recovery-control')),
  ).toBe('retained');
});
