import { test, expect } from './coverage-fixture';
import { setup } from './editor-fixture';
import {
  sensorHardware,
  setPageHidden,
  surveyGps,
  pushSurveyFix,
} from './editor-survey-helpers';
import { attachMap } from './editor-map-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('motion assistance public permission timing, orientation modes, fallback and manual follow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await surveyGps(page);
  await sensorHardware(page);
  await setup(page);
  await page.goto('/');
  await attachMap(page);
  await page.getByRole('textbox', { name: 'Search campus' }).fill('Library');
  await page
    .getByRole('button', { name: /Library/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Directions', exact: true }).click();
  await page.getByLabel('Starting place').selectOption('gate');
  await expect(
    page.getByRole('button', { name: 'Start walking', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.motionTest.requests)).toEqual([]);
  await page
    .getByRole('button', { name: 'Start walking', exact: true })
    .click();
  await page.waitForFunction(() => !!window.surveyGps);
  await page.evaluate(() => {
    const update = () =>
      window.surveyGps?.({
        coords: {
          longitude: 3.20002,
          latitude: 6.46,
          accuracy: 5,
          heading: 90,
          speed: 1,
        } as GeolocationCoordinates,
        timestamp: Date.now(),
      } as GeolocationPosition);
    update();
    setInterval(update, 1000);
  });
  await expect(
    page.getByRole('button', { name: 'Stop navigation', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.motionTest.requests)).toEqual([
    { channel: 'orientation', activated: true, gpsWatches: 0 },
    { channel: 'motion', activated: true, gpsWatches: 0 },
  ]);
  const mode = page.getByLabel('Map orientation', { exact: true });
  await expect(mode).toHaveValue('travel');
  await expect
    .poll(() =>
      page.evaluate(() => Math.round(window.editorTestMap.getBearing())),
    )
    .toBe(90);
  await expect(page.locator('.motion-phone')).toBeVisible();
  await expect(page.locator('.motion-travel')).toBeVisible();
  await mode.selectOption('phone');
  await expect
    .poll(() =>
      page.evaluate(() => Math.round(window.editorTestMap.getBearing())),
    )
    .toBe(-90);
  await page.evaluate(
    () => void window.editorTestMap.jumpTo({ zoom: 19, pitch: 40 }),
  );
  await mode.selectOption('north');
  await expect
    .poll(() =>
      page.evaluate(() => Math.round(window.editorTestMap.getBearing())),
    )
    .toBe(0);
  expect(
    await page.evaluate(() => [
      window.editorTestMap.getZoom(),
      window.editorTestMap.getPitch(),
    ]),
  ).toEqual([19, 40]);
  await mode.selectOption('phone');
  await expect
    .poll(() =>
      page.evaluate(() => Math.round(window.editorTestMap.getBearing())),
    )
    .toBe(-90);
  await page.mouse.move(210, 220);
  await page.mouse.down();
  await page.mouse.move(280, 250, { steps: 8 });
  await page.mouse.up();
  await expect(
    page.getByText('Map following paused. Use Follow me to restore it.'),
  ).toBeVisible();
  await page.evaluate(() => {
    window.motionTest.heading = 180;
  });
  await page.waitForTimeout(700);
  expect(
    Math.round(await page.evaluate(() => window.editorTestMap.getBearing())),
  ).toBe(-90);
  await page.getByRole('button', { name: 'Follow me', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Math.abs(Math.round(window.editorTestMap.getBearing())),
      ),
    )
    .toBe(180);
  await page.getByText('Compass & motion controls', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Turn off sensors', exact: true })
    .click();
  await expect(
    page.getByText(/Phone-up: using GPS travel direction/),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.motionTest.listenerCount()))
    .toBe(0);
  await expect(page.locator('.motion-phone')).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => Math.round(window.editorTestMap.getBearing())),
    )
    .toBe(90);
  await page.screenshot({
    path: 'test-results/motion-public-phone.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Stop navigation', exact: true })
    .click();
  await page.reload();
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  await page.getByRole('button', { name: /Settings/ }).click();
  await expect(page.getByLabel('Map orientation', { exact: true })).toHaveValue(
    'phone',
  );
  await expect(
    page.getByText('Compass & motion off', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.motionTest.requests)).toEqual([]);
});

test('decorative globe clouds render and rotation yields to controls and reduced motion', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await setup(page);
  await page.goto('/');
  await attachMap(page);
  await page.waitForFunction(() => !!window.editorTestMap.getSource('world'));
  await page.evaluate(
    () =>
      void window.editorTestMap.jumpTo({
        center: [0, 20],
        zoom: 1,
        pitch: 0,
        bearing: 0,
      }),
  );
  await expect(
    page.getByRole('button', { name: 'Hide clouds', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => !!window.editorTestMap.getLayer('world-clouds')),
    )
    .toBe(true);
  await expect(
    page.getByText('Clouds unavailable', { exact: true }),
  ).toHaveCount(0);
  const longitude = await page.evaluate(
    () => window.editorTestMap.getCenter().lng,
  );
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.getCenter().lng), {
      timeout: 15000,
    })
    .toBeLessThan(longitude - 0.3);
  await page
    .getByRole('button', { name: 'Pause rotation', exact: true })
    .click();
  const stopped = await page.evaluate(
    () => window.editorTestMap.getCenter().lng,
  );
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.editorTestMap.getCenter().lng)).toBe(
    stopped,
  );
  await page.screenshot({ path: info.outputPath('animated-globe.png') });
  await page.getByRole('button', { name: 'Hide clouds', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Show clouds', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Rotate globe', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(
    page.getByRole('button', { name: 'Rotate globe', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(
    () => void window.editorTestMap.jumpTo({ center: [3.2, 6.46], zoom: 17 }),
  );
  await expect(
    page.getByRole('button', { name: 'Rotate globe', exact: true }),
  ).toHaveCount(0);
});

test('globe retains live location and facing direction while exploring without navigation', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 900, height: 650 });
  await surveyGps(page);
  await sensorHardware(page);
  await setup(page);
  await page.goto('/');
  await attachMap(page);
  const expand = page.getByRole('button', { name: 'Expand card', exact: true });
  if (await expand.isVisible()) await expand.click();
  expect(await page.evaluate(() => window.motionTest.requests)).toEqual([]);
  await page
    .getByRole('button', { name: 'Find my location', exact: true })
    .click();
  await pushSurveyFix(page, [3.2, 6.46]);
  await page.evaluate(() => {
    window.globeTrace = {
      coordinates: [3.2, 6.46],
      timer: window.setInterval(() => {
        const coordinates = window.globeTrace!.coordinates;
        window.surveyGps?.({
          coords: {
            longitude: coordinates[0],
            latitude: coordinates[1],
            accuracy: 5,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition);
      }, 500),
    };
  });
  await expect(page.locator('.motion-phone')).toBeVisible();
  await page.evaluate(() => void window.editorTestMap.fire('dragstart'));
  await page.waitForTimeout(100);
  await page.waitForFunction(() => !!window.editorTestMap.getSource('world'));
  await page.evaluate(
    () =>
      void window.editorTestMap.jumpTo({
        center: [3.2, 6.46],
        zoom: 2,
        pitch: 0,
        bearing: 0,
      }),
  );
  await expect(
    page.getByLabel('Interactive world map', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTestMap.queryRenderedFeatures(
            window.editorTestMap.project([3.2, 6.46]),
            {
              layers: ['gps-dot'],
            },
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  const phone = page.locator('.motion-phone');
  await expect(phone).toBeVisible();
  const before = await phone.evaluate(
    (e) => (e as HTMLElement).style.transform,
  );
  await page.evaluate(() => {
    window.motionTest.heading = 180;
  });
  await expect
    .poll(() => phone.evaluate((e) => (e as HTMLElement).style.transform))
    .not.toBe(before);
  await expect(phone).toBeVisible();
  await page.screenshot({ path: info.outputPath('globe-live-location.png') });
  expect(await page.evaluate(() => window.editorTestMap.getZoom())).toBe(2);
  const oldPosition = (await phone.boundingBox())!;
  await page.evaluate(() => {
    window.globeTrace!.coordinates = [-0.12, 51.5];
  });
  await pushSurveyFix(page, [-0.12, 51.5]);
  await expect
    .poll(async () => {
      const next = await phone.boundingBox();
      return !!next && Math.abs(next.y - oldPosition.y) > 10;
    })
    .toBe(true);
  expect(await page.evaluate(() => window.editorTestMap.getZoom())).toBe(2);
  await page.evaluate(
    () => void window.editorTestMap.jumpTo({ center: [179, 0], zoom: 1 }),
  );
  await pushSurveyFix(page, [179.99, 0]);
  await page.evaluate(() => {
    window.globeTrace!.coordinates = [179.99, 0];
  });
  await expect(phone).toBeVisible();
  await page.evaluate(() => {
    window.motionTest.emit = false;
    clearInterval(window.globeTrace!.timer);
  });
  await expect(phone).toBeHidden({ timeout: 5000 });
  await page.evaluate(() =>
    window.surveyGps?.({
      coords: {
        longitude: 179.99,
        latitude: 0,
        accuracy: 5,
        heading: null,
        speed: null,
      },
      timestamp: Date.now() - 20000,
    } as GeolocationPosition),
  );
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const data = (await (
          window.editorTestMap.getSource(
            'position',
          ) as import('maplibre-gl').GeoJSONSource
        ).getData()) as GeoJSON.FeatureCollection;
        return data.features.some(
          (f) => f.properties?.locationLabel === 'Last known location',
        );
      }),
    )
    .toBe(true);
  await setPageHidden(page, true);
  await expect
    .poll(() => page.evaluate(() => window.motionTest.listenerCount()))
    .toBe(0);
  await expect.poll(() => page.evaluate(() => !!window.surveyGps)).toBe(false);
});
