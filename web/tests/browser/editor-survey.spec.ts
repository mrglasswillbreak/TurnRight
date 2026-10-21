import { test, expect } from './coverage-fixture';
import { setup } from './editor-fixture';
import {
  sensorHardware,
  setPageHidden,
  surveyGps,
  pushSurveyFix,
  aimCrosshair,
} from './editor-survey-helpers';
import { attachMap } from './editor-map-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('motion assistance survey denial retry, stable entrance crosshair and paused recovery', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await surveyGps(page);
  await sensorHardware(page, 'denied');
  await setup(page);
  await page.getByRole('button', { name: 'Survey', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Features', exact: true }),
  ).toBeHidden();
  await expect(page.getByLabel('Workspace', { exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.motionTest.requests)).toEqual([]);
  await page
    .getByRole('button', { name: 'Record new path', exact: true })
    .click();
  await pushSurveyFix(page, [3.20015, 6.46]);
  expect(await page.evaluate(() => window.motionTest.requests)).toEqual([
    { channel: 'orientation', activated: true, gpsWatches: 0 },
    { channel: 'motion', activated: true, gpsWatches: 0 },
  ]);
  await page.getByText('Compass & motion controls', { exact: true }).click();
  await expect(page.getByText(/Compass: Permission denied/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Pause', exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    window.motionTest.permission = 'granted';
  });
  await page
    .getByRole('button', { name: 'Enable/Retry sensors', exact: true })
    .click();
  await expect(
    page.getByText('Approximate compass available', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.motionTest.listenerCount()))
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate(() => Math.round(window.editorTestMap.getBearing())),
    )
    .toBe(0);
  await page.getByText('Compass & motion controls', { exact: true }).click();
  // Real GPS keeps producing fixes while the sensor controls are used.
  await pushSurveyFix(page, [3.20015, 6.46]);
  await page
    .getByRole('button', { name: 'Mark place or entrance', exact: true })
    .click();
  await expect(page.getByLabel('Entrance name', { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.motionTest.listenerCount()))
    .toBe(0);
  await aimCrosshair(page, [3.20015, 6.4602]);
  const camera = await page.evaluate(() => [
    window.editorTestMap.getCenter().toArray(),
    window.editorTestMap.getBearing(),
  ]);
  await page.evaluate(() => {
    window.motionTest.heading = 15;
    window.motionTest.rotation = 90;
  });
  await page.waitForTimeout(700);
  expect(
    await page.evaluate(() => [
      window.editorTestMap.getCenter().toArray(),
      window.editorTestMap.getBearing(),
    ]),
  ).toEqual(camera);
  await page
    .getByLabel('Entrance place', { exact: true })
    .selectOption('library');
  await page
    .getByRole('button', { name: 'Place entrance here', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm entrance', exact: true })
    .click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.motionTest.listenerCount()))
    .toBe(1);
  await setPageHidden(page, true);
  await expect(
    page.getByRole('button', { name: 'Resume', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.motionTest.listenerCount()))
    .toBe(0);
  await setPageHidden(page, false);
  expect(await page.evaluate(() => window.motionTest.listenerCount())).toBe(0);
  await page.reload();
  await attachMap(page);
  await page.getByRole('button', { name: 'Survey', exact: true }).click();
  await page
    .getByRole('button', { name: 'Saved surveys', exact: true })
    .click();
  await page
    .getByRole('button', { name: /Walking survey · paused · On this device/ })
    .click();
  expect(await page.evaluate(() => window.motionTest.requests)).toEqual([]);
  expect(await page.evaluate(() => window.motionTest.listenerCount())).toBe(0);
  await page.evaluate(() => {
    window.motionTest.permission = 'granted';
  });
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.motionTest.listenerCount()))
    .toBe(1);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.motionTest.listenerCount()))
    .toBe(0);
  const persisted = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('turnright-surveys');
      r.onsuccess = () => resolve(r.result);
    });
    const rows = await Promise.all(
      ['sessions', 'samples', 'uploads'].map(
        (store) =>
          new Promise<unknown[]>((resolve) => {
            const r = db.transaction(store).objectStore(store).getAll();
            r.onsuccess = () => resolve(r.result);
          }),
      ),
    );
    db.close();
    return JSON.stringify(rows);
  });
  expect(persisted).not.toMatch(
    /webkitCompass|rotationRate|acceleration|phoneHeading|motion-assistance/,
  );
  await page.screenshot({
    path: 'test-results/motion-survey-phone.png',
    fullPage: true,
  });
});

test('phone survey records, reviews, connects, applies and recovers without coordinates', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await surveyGps(page);
  const server = await setup(page);
  await page.getByRole('button', { name: 'Survey', exact: true }).click();
  await expect(
    page.getByText('Awaiting field verification', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.surveyGpsWatchCount)).toBe(0);
  await page
    .getByRole('button', { name: 'Record new path', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.surveyGpsWatchCount))
    .toBe(1);
  await pushSurveyFix(page, [3.20015, 6.46]);
  await page.waitForTimeout(1100);
  await pushSurveyFix(page, [3.20015, 6.459975]);
  await page.waitForTimeout(1100);
  await pushSurveyFix(page, [3.20015, 6.45995]);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page
    .getByRole('button', { name: 'Section 1 · Needs review', exact: true })
    .click();
  await page
    .getByRole('checkbox', { name: 'Connect to highlighted target' })
    .check();
  await aimCrosshair(page, [3.20015, 6.46]);
  await page.getByRole('button', { name: 'Place here', exact: true }).click();
  await page
    .getByRole('button', { name: 'Confirm section reviewed', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Apply to map draft', exact: true })
    .click();
  await expect
    .poll(() => server.edits().filter((e) => e.kind === 'path'))
    .toHaveLength(1);
  expect(server.edits()[0].properties.connections).toHaveLength(1);
  await page.screenshot({
    path: 'test-results/phone-survey-review.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Close survey', exact: true }).click();
  await page.reload();
  await attachMap(page);
  await page.getByRole('button', { name: 'Survey', exact: true }).click();
  await page
    .getByRole('button', { name: 'Saved surveys', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: /Walking survey · review · On this device/,
    }),
  ).toBeVisible();
});

test('phone survey records a business without inventing a routing connection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await surveyGps(page);
  const server = await setup(page);
  await page.getByRole('button', { name: 'Survey', exact: true }).click();
  await page
    .getByRole('button', { name: 'Record new path', exact: true })
    .click();
  await pushSurveyFix(page, [3.20015, 6.46]);
  await page
    .getByRole('button', { name: 'Mark place or entrance', exact: true })
    .click();
  await page.getByLabel('Observation type').selectOption('place');
  await page.getByLabel('Place name', { exact: true }).fill('Campus Canteen');
  await page.getByLabel('Survey place category').selectOption('food');
  await page.getByLabel('Survey subtype').fill('canteen');
  await page.getByLabel('Survey openingHours').fill('Mo-Fr 08:00-17:00');
  await page
    .getByRole('button', { name: 'Confirm place observation', exact: true })
    .click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page
    .getByRole('button', { name: 'Apply to map draft', exact: true })
    .click();
  await expect
    .poll(() => server.edits().filter((e) => e.kind === 'place'))
    .toHaveLength(1);
  const place = server.edits().find((e) => e.kind === 'place')!;
  expect(place.properties).toMatchObject({
    name: 'Campus Canteen',
    category: 'food',
    subtype: 'canteen',
    openingHours: 'Mo-Fr 08:00-17:00',
  });
  expect(place.properties.connection).toBeUndefined();
  expect(place.properties.evidence).toBeDefined();
  expect(
    server.edits().some((e) => e.kind === 'path' || e.kind === 'entrance'),
  ).toBe(false);
});

test('phone survey marks two entrances, connects both approaches and tests their route', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await surveyGps(page);
  const server = await setup(page);
  await page.getByRole('button', { name: 'Survey', exact: true }).click();
  await page
    .getByRole('button', { name: 'Record new path', exact: true })
    .click();
  let clock = Date.now();
  for (const [index, x] of [3.20018, 3.20033].entries()) {
    if (index)
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
    for (let step = 0; step <= 8; step++) {
      clock += 5000;
      await page.clock.setFixedTime(clock);
      await pushSurveyFix(page, [x, 6.46 + step * 0.000025]);
      await expect(
        page.getByRole('button', {
          name: 'Mark place or entrance',
          exact: true,
        }),
      ).toBeEnabled();
    }
    await page
      .getByRole('button', { name: 'Mark place or entrance', exact: true })
      .click();
    await page
      .getByLabel('Entrance name', { exact: true })
      .fill(`Walked entrance ${index + 1}`);
    await page
      .getByLabel('Entrance place', { exact: true })
      .selectOption('library');
    await aimCrosshair(page, [x, 6.4602]);
    await page
      .getByRole('button', { name: 'Place entrance here', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirm entrance', exact: true })
      .click();
  }
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  for (const [index, x] of [3.20018, 3.20033].entries()) {
    await page
      .getByRole('button', {
        name: `Section ${index + 1} · Needs review`,
        exact: true,
      })
      .click();
    await page
      .getByRole('checkbox', { name: 'Connect to highlighted target' })
      .check();
    await aimCrosshair(page, [x, 6.46]);
    await page.getByRole('button', { name: 'Place here', exact: true }).click();
    await page
      .getByRole('button', { name: 'Confirm section reviewed', exact: true })
      .click();
  }
  await page
    .getByRole('button', { name: 'Apply to map draft', exact: true })
    .click();
  await expect
    .poll(() => server.edits().filter((e) => e.kind === 'entrance'))
    .toHaveLength(2);
  await page
    .getByRole('button', { name: 'Apply to map draft', exact: true })
    .click();
  await expect
    .poll(() => server.edits().filter((e) => e.kind === 'entrance'))
    .toHaveLength(2);
  await page.getByRole('button', { name: 'Close survey', exact: true }).click();
  await page.getByRole('button', { name: 'Test route', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Route test', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Test route From').selectOption('gate');
  await page.getByLabel('Test route To').selectOption('library');
  await page
    .getByRole('button', { name: 'Preview route', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Route test', exact: true })
      .getByText(/Walked entrance 1/)
      .last(),
  ).toBeVisible();
});

test(
  'prepared offline survey cold-starts, records, recovers and privately syncs after reconnecting',
  { tag: '@offline' },
  async ({ page, context }, testInfo) => {
    test.skip(
      !testInfo.config.configFile?.includes('pwa.config'),
      'Requires the production service worker configuration.',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await surveyGps(page);
    await sensorHardware(page);
    await setup(page);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const commands: {
      command: string;
      revisionId: string;
      samples?: unknown[];
    }[] = [];
    await page.route('**/api/admin', (route) => {
      const { action, payload } = route.request().postDataJSON();
      if (action !== 'survey-save') return route.fallback();
      commands.push(payload);
      return route.fulfill({
        json:
          payload.command === 'finalize'
            ? {
                status: 'complete',
                revisionId: payload.revisionId,
                headRevision: payload.revisionId,
              }
            : { ok: true },
      });
    });
    await page.getByRole('button', { name: 'Survey', exact: true }).click();
    await page
      .getByRole('button', { name: 'Prepare for offline survey', exact: true })
      .click();
    await expect(page.getByText(/Ready for offline surveying/)).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await attachMap(page);
    await page.getByRole('button', { name: 'Survey', exact: true }).click();
    await page
      .getByRole('button', { name: 'Record new path', exact: true })
      .click();
    await pushSurveyFix(page, [3.20015, 6.46]);
    await expect(
      page.getByText('Approximate compass available', { exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(1100);
    await pushSurveyFix(page, [3.20015, 6.459975]);
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.motionTest.listenerCount()))
      .toBe(0);
    await page
      .getByRole('button', { name: 'Save survey', exact: true })
      .click();
    await expect(page.getByText(/private upload queued/)).toBeVisible();
    expect(commands).toHaveLength(0);
    await page.reload();
    await attachMap(page);
    await page.getByRole('button', { name: 'Survey', exact: true }).click();
    await page
      .getByRole('button', { name: 'Saved surveys', exact: true })
      .click();
    await page
      .getByRole('button', { name: /Walking survey · review · On this device/ })
      .click();
    await context.setOffline(false);
    await expect
      .poll(() => commands.some((c) => c.command === 'finalize'))
      .toBe(true);
    expect(
      commands
        .filter((c) => c.command === 'chunk')
        .flatMap((c) => c.samples || []),
    ).toHaveLength(2);
    await expect(
      page.getByText('Saved privately', { exact: true }),
    ).toBeVisible();
    expect(JSON.stringify(commands)).not.toMatch(
      /webkitCompass|rotationRate|acceleration|phoneHeading|motion-assistance/,
    );
    expect(await page.evaluate(() => window.motionTest.requests)).toEqual([]);
  },
);
