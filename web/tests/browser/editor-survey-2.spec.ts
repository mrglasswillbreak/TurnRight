import { test, expect } from './coverage-fixture';
import { setup } from './editor-fixture';
import { surveyGps, pushSurveyFix } from './editor-survey-helpers';
import { attachMap } from './editor-map-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('phone survey pauses when hidden and requires explicit resume after reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await surveyGps(page);
  await setup(page);
  await page.getByRole('button', { name: 'Survey', exact: true }).click();
  await page
    .getByRole('button', { name: 'Record new path', exact: true })
    .click();
  await pushSurveyFix(page, [3.20015, 6.46]);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(
    page.getByRole('button', { name: 'Resume', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.surveyGpsWatchCount)).toBe(1);
  await page.reload();
  await attachMap(page);
  await page.getByRole('button', { name: 'Survey', exact: true }).click();
  await page
    .getByRole('button', { name: 'Saved surveys', exact: true })
    .click();
  await page
    .getByRole('button', { name: /Walking survey · paused · On this device/ })
    .click();
  await expect(
    page.getByRole('button', { name: 'Resume', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.surveyGpsWatchCount)).toBe(0);
});

test(
  'prepared offline survey editor opens its cache after backend failure while the browser is online',
  { tag: '@offline' },
  async ({ page }, testInfo) => {
    test.skip(
      !testInfo.config.configFile?.includes('pwa.config'),
      'Requires the production service worker configuration.',
    );
    await setup(page);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.getByRole('button', { name: 'Survey', exact: true }).click();
    await page
      .getByRole('button', { name: 'Prepare for offline survey', exact: true })
      .click();
    await expect(page.getByText(/Ready for offline surveying/)).toBeVisible();
    await page.route('**/api/admin', (route) => route.abort('failed'));
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);
    await page.reload();
    await attachMap(page);
    await expect(page.locator('.editor-offline')).toContainText(
      'Working offline',
    );
    await expect(page.locator('.editor-offline')).not.toContainText('Unknown');
    await expect(
      page.getByRole('button', { name: 'Draw path', exact: true }),
    ).toBeEnabled();
  },
);
