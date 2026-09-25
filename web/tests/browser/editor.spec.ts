import type { Map as MapInstance } from 'maplibre-gl';
import { Color } from 'three';
declare global {
  interface Window {
    editorTestMap: MapInstance;
    previewBuilds: string[][];
    surveyGps?: (fix: GeolocationPosition) => void;
    surveyGpsWatchCount: number;
    motionTest: {
      permission: 'granted' | 'denied';
      requests: { channel: string; activated: boolean; gpsWatches: number }[];
      heading: number;
      rotation: number;
      emit: boolean;
      listenerCount: () => number;
    };
  }
}

// Controlled hardware/permissions only. MapLibre and its pointer/camera behavior
// are real in both Chromium and WebKit.
async function sensorHardware(
  page: Page,
  permission: 'granted' | 'denied' = 'granted',
) {
  await page.addInitScript((permission) => {
    // A phone-sized WebKit viewport can retain the host's landscape screen
    // angle. Make the simulated hardware orientation match the portrait trace.
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: Object.assign(new EventTarget(), {
        angle: 0,
        type: 'portrait-primary',
      }),
    });
    Object.defineProperty(window, 'orientation', {
      configurable: true,
      value: 0,
    });
    const listeners = new Set<EventListenerOrEventListenerObject>();
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: AddEventListenerOptions,
    ) => {
      if (type === 'devicemotion') listeners.add(listener);
      add(type, listener, options);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: EventListenerOptions,
    ) => {
      if (type === 'devicemotion') listeners.delete(listener);
      remove(type, listener, options);
    }) as typeof window.removeEventListener;
    window.motionTest = {
      permission,
      requests: [],
      heading: 270,
      rotation: 0,
      emit: true,
      listenerCount: () => listeners.size,
    };
    for (const [name, channel] of [
      ['DeviceOrientationEvent', 'orientation'],
      ['DeviceMotionEvent', 'motion'],
    ] as const) {
      Object.defineProperty(window, name, {
        configurable: true,
        value: class extends Event {
          static requestPermission() {
            window.motionTest.requests.push({
              channel,
              activated: navigator.userActivation.isActive,
              gpsWatches: window.surveyGpsWatchCount,
            });
            return Promise.resolve(window.motionTest.permission);
          }
        },
      });
    }
    setInterval(() => {
      const state = window.motionTest;
      if (!state.emit) return;
      window.dispatchEvent(
        Object.assign(new Event('deviceorientation'), {
          alpha: 90,
          beta: 20,
          gamma: 0,
          absolute: false,
          webkitCompassHeading: state.heading,
          webkitCompassAccuracy: 5,
        }),
      );
      window.dispatchEvent(
        Object.assign(new Event('devicemotion'), {
          acceleration: { x: 0, y: 0, z: 0 },
          accelerationIncludingGravity: null,
          rotationRate: { alpha: state.rotation, beta: 0, gamma: 0 },
        }),
      );
    }, 50);
  }, permission);
}

async function setPageHidden(page: Page, hidden: boolean) {
  await page.evaluate((hidden) => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: hidden,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

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
  await page.evaluate(() =>
    window.editorTestMap.jumpTo({ zoom: 19, pitch: 40 }),
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

test('motion assistance survey denial retry, stable entrance crosshair and paused recovery', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await surveyGps(page);
  await sensorHardware(page, 'denied');
  await setup(page);
  await page.getByRole('button', { name: 'Survey', exact: true }).click();
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

async function surveyGps(page: Page) {
  await page.addInitScript(() => {
    window.surveyGpsWatchCount = 0;
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition(callback: (p: GeolocationPosition) => void) {
          window.surveyGps = callback;
          window.surveyGpsWatchCount++;
          return 1;
        },
        clearWatch() {
          window.surveyGps = undefined;
        },
      },
    });
  });
}
async function pushSurveyFix(page: Page, coordinates: Position, accuracy = 5) {
  await page.waitForFunction(() => typeof window.surveyGps === 'function');
  await page.evaluate(
    ({ coordinates, accuracy }) => {
      window.surveyGps?.({
        coords: {
          longitude: coordinates[0],
          latitude: coordinates[1],
          accuracy,
          heading: null,
          speed: null,
          altitude: null,
          altitudeAccuracy: null,
          toJSON() {
            return {};
          },
        },
        timestamp: Date.now(),
        toJSON() {
          return {};
        },
      });
    },
    { coordinates, accuracy },
  );
}
async function aimCrosshair(page: Page, coordinates: Position) {
  await page.evaluate((coordinates) => {
    const map = window.editorTestMap;
    map.stop();
    map.easeTo({
      center: coordinates,
      offset: [
        0,
        map.getCanvas().clientHeight * (innerWidth < 700 ? -0.18 : 0),
      ],
      zoom: 20,
      duration: 0,
    });
  }, coordinates);
}
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
  await page.getByLabel('Test route From').selectOption('gate');
  await page.getByLabel('Test route To').selectOption('library');
  await page
    .getByRole('button', { name: 'Preview route', exact: true })
    .click();
  await expect(page.getByText(/Walked entrance 1/).last()).toBeVisible();
});
test('prepared offline survey cold-starts, records, recovers and privately syncs after reconnecting', async ({
  page,
  context,
}, testInfo) => {
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
  await page.getByRole('button', { name: 'Save survey', exact: true }).click();
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
});
test('prepared public map reopens in 3D offline with its saved view preference', async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    !testInfo.config.configFile?.includes('pwa.config'),
    'Requires the production service worker configuration.',
  );
  await page.emulateMedia({ colorScheme: 'dark' });
  await setup(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.goto('/');
  await attachMap(page);
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  await page.getByRole('button', { name: 'Offline', exact: true }).click();
  await page
    .getByRole('button', { name: 'Download campus map', exact: true })
    .click();
  await expect(
    page.getByText('Ready offline', { exact: true }).first(),
  ).toBeVisible();
  await context.setOffline(true);
  await page.goto('/');
  await attachMap(page);
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
    .toBe(45);
  expect(
    await page.evaluate(async () => {
      const data = (await (
        window.editorTestMap.getSource(
          'campus',
        ) as import('maplibre-gl').GeoJSONSource
      ).getData()) as import('geojson').FeatureCollection;
      return data.features.find(
        (f) => f.properties?.heightKind === 'illustrative',
      )?.properties?.displayHeight;
    }),
  ).toBe(6);
  await page.getByRole('button', { name: 'Switch to 2D', exact: true }).click();
  await page.reload();
  await attachMap(page);
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
    .toBe(0);
});
test('prepared public map verifies enhanced architecture, repairs corruption and reopens it offline', async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    !testInfo.config.configFile?.includes('pwa.config'),
    'Requires production service worker.',
  );
  test.setTimeout(120000);
  await page.emulateMedia({ colorScheme: 'dark' });
  const { campus } = await setup(page, true, true);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.goto('/');
  await attachMap(page);
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  await page.getByRole('button', { name: 'Offline', exact: true }).click();
  await page
    .getByRole('button', { name: 'Download campus map', exact: true })
    .click();
  await expect(
    page.getByText('Enhanced 3D ready offline · all model files verified'),
  ).toBeVisible();
  await page.evaluate(async (url) => {
    const cache = await caches.open('turnright-assets-v1');
    await cache.put(url, new Response('corrupted model file'));
  }, campus.visuals!.sectors[0].url);
  await page.reload();
  await attachMap(page);
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  await page.getByRole('button', { name: 'Offline', exact: true }).click();
  await expect(
    page.getByText('Enhanced 3D ready offline · all model files verified'),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Download campus map', exact: true })
    .click();
  await expect(
    page.getByText('Enhanced 3D ready offline · all model files verified'),
  ).toBeVisible();
  await context.setOffline(true);
  await page.goto('/');
  await attachMap(page);
  await focusModels(page);
  await page.screenshot({ path: 'test-results/miniature-offline.png' });
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
interface RefHook {
  memoizedState?: { current?: unknown };
  next?: RefHook;
}
interface RefFiber {
  memoizedState?: RefHook;
  return?: RefFiber;
}
import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { campusFixture } from '../fixture';
import { contrastFailures } from './contrast';
import type {
  CampusData,
  CampusPackage,
  CampusPhoto,
  MapEdit,
  Position,
} from '../../src/types';
import { createBuildingModel } from '../../src/building-model';
import { buildingRevision } from '../../src/building-visuals';
import type { BuildingVisual } from '../../src/visual-types';

function browserCampus(): CampusData {
  const data = campusFixture();
  data.graph.edges = data.graph.edges
    .filter((e) => ['ab', 'ba', 'bc', 'cb'].includes(e.id))
    .map((e) => ({ ...e, sourceId: 'road' }));
  data.places[0] = {
    ...data.places[0],
    coordinates: [3.20025, 6.4603],
    arrivalKind: 'mapped-approach',
    approachDistance: 30,
    graphNode: 'b',
  };
  data.places.push({
    ...data.places[0],
    id: 'gate',
    name: 'Main gate',
    coordinates: [3.2, 6.46],
    graphNode: 'a',
    category: 'gate',
  });
  data.map.features = [
    {
      type: 'Feature',
      properties: {
        id: 'road',
        name: 'Main walk',
        kind: 'path',
        walkingAccess: 'yes',
      },
      geometry: {
        type: 'LineString',
        coordinates: data.graph.nodes.slice(0, 3).map((n) => n.coordinates),
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 'library',
        name: 'Library',
        kind: 'building',
        height: 15,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [3.2001, 6.4602],
            [3.2004, 6.4602],
            [3.2004, 6.4604],
            [3.2001, 6.4604],
            [3.2001, 6.4602],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 'unknown-building',
        name: 'New lecture hall',
        kind: 'building',
        height: 0,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [3.20065, 6.4602],
            [3.2008, 6.4602],
            [3.2008, 6.4604],
            [3.20065, 6.4604],
            [3.20065, 6.4602],
          ],
        ],
      },
    },
  ];
  return data;
}
async function setup(
  page: Page,
  realCampus = false,
  enhanced = false,
  options: {
    initialEdits?: MapEdit[];
    publishedEdits?: MapEdit[];
    mutateCampus?: (data: CampusData) => void;
    snapshot?: { data: CampusData; manifest: CampusPackage };
  } = {},
) {
  let edits: MapEdit[] = structuredClone(options.initialEdits || []);
  let revision = 0;
  const receipts = new Map<string, MapEdit[]>();
  const campus: CampusData =
    options.snapshot?.data ||
    (realCampus
      ? JSON.parse(
          readFileSync(
            new URL(
              '../../public/packages/lasu-4e4c8008b38b/campus.json',
              import.meta.url,
            ),
            'utf8',
          ),
        )
      : browserCampus());
  if (enhanced) {
    campus.visuals = JSON.parse(
      readFileSync(
        new URL('../../../data/visuals/catalogue.json', import.meta.url),
        'utf8',
      ),
    );
    // This fixture represents acceptance of the reviewed ring corrections.
    for (const visual of campus.visuals!.buildings)
      if (visual.geometryReview) {
        const feature = campus.map.features.find(
          (f) => f.properties?.id === visual.id,
        );
        if (feature) feature.geometry = visual.geometryReview.geometry;
      }
    for (const sector of campus.visuals!.sectors)
      await page.context().route(`**${sector.url}`, (route) =>
        route.fulfill({
          body: readFileSync(
            new URL(
              `../../../data/visuals/${sector.url.split('/').at(-1)}`,
              import.meta.url,
            ),
          ),
          contentType: 'application/json',
        }),
      );
  }
  options.mutateCampus?.(campus);
  let published = options.publishedEdits
    ? {
        version: campus.version,
        edits: structuredClone(options.publishedEdits),
      }
    : null;
  const bytes = JSON.stringify(campus);
  const user = {
    id: 'owner',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'owner@example.test',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  };
  await page.addInitScript(
    ({ user }) => {
      localStorage.setItem(
        'sb-editor-test-auth-token',
        JSON.stringify({
          access_token: 'test-token',
          token_type: 'bearer',
          refresh_token: 'test-refresh',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          user,
        }),
      );
    },
    { user },
  );
  await page.route('https://editor-test.supabase.co/**', (route) =>
    route.fulfill({ json: { user } }),
  );
  await page.context().route('**/packages/latest.json', (route) =>
    route.fulfill({
      json: options.snapshot
        ? {
            ...options.snapshot.manifest,
            dataUrl: '/packages/fixture/campus.json',
            assets: options.snapshot.manifest.assets.map((a) =>
              a.url === options.snapshot!.manifest.dataUrl
                ? {
                    ...a,
                    url: '/packages/fixture/campus.json',
                    sha256: createHash('sha256').update(bytes).digest('hex'),
                    bytes: Buffer.byteLength(bytes),
                  }
                : a,
            ),
            bytes:
              options.snapshot.manifest.bytes -
              options.snapshot.manifest.assets.find(
                (a) => a.url === options.snapshot!.manifest.dataUrl,
              )!.bytes +
              Buffer.byteLength(bytes),
          }
        : {
            schemaVersion: 1,
            version: campus.version,
            createdAt: campus.createdAt,
            summary: 'Test campus',
            dataUrl: '/packages/fixture/campus.json',
            bytes: Buffer.byteLength(bytes) + (campus.visuals?.bytes || 0),
            ...(campus.visuals
              ? {
                  visuals: {
                    bytes: campus.visuals.bytes,
                    assetUrls: campus.visuals.sectors.map((s) => s.url),
                  },
                }
              : {}),
            assets: [
              {
                url: '/packages/fixture/campus.json',
                sha256: createHash('sha256').update(bytes).digest('hex'),
                bytes: Buffer.byteLength(bytes),
              },
              ...(campus.visuals?.sectors || []),
            ],
          },
    }),
  );
  await page
    .context()
    .route('**/packages/fixture/campus.json', (route) =>
      route.fulfill({ body: bytes, contentType: 'application/json' }),
    );
  await page.route('**/api/admin', async (route) => {
    const { action, payload } = route.request().postDataJSON();
    if (action === 'state')
      return route.fulfill({
        json: {
          edits,
          reports: [],
          changes: [],
          jobs: [],
          releases: [],
          published,
        },
      });
    if (action === 'review-status')
      return route.fulfill({
        json: { changes: [], jobs: [], releases: [], published },
      });
    if (action === 'sources') return route.fulfill({ json: { features: [] } });
    if (action === 'survey-list') return route.fulfill({ json: [] });
    if (action === 'save-edits') {
      if (receipts.has(payload.operationId))
        return route.fulfill({ json: receipts.get(payload.operationId) });
      for (const item of payload.edits) {
        const previous = edits.find(
          (e) => e.id === item.edit.id && e.kind === item.edit.kind,
        );
        if ((previous?.updated_at || null) !== item.expectedUpdatedAt)
          return route.fulfill({
            status: 409,
            json: { error: 'Draft changed in another session' },
          });
      }
      const saved = payload.edits.map(({ edit }: { edit: MapEdit }) => ({
        ...edit,
        updated_at: new Date(
          Date.UTC(2026, 8, 11, 12, 0, revision++),
        ).toISOString(),
      }));
      saved.forEach((edit: MapEdit) => {
        edits = [
          ...edits.filter((e) => !(e.id === edit.id && e.kind === edit.kind)),
          edit,
        ];
      });
      receipts.set(payload.operationId, saved);
      return route.fulfill({ json: saved });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/admin');
  await expect(
    page.getByRole('button', { name: 'Draw path', exact: true }),
  ).toBeEnabled();
  await attachMap(page);
  return {
    edits: () => edits,
    setEdits: (value: MapEdit[]) => {
      edits = value;
    },
    publish: () => {
      published = { version: campus.version, edits: structuredClone(edits) };
    },
    campus,
  };
}
for (const width of [1440, 390])
  test(`photo workspace uploads, recovery and covers at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: width === 390 ? 'dark' : 'light' });
    const server = await setup(page);
    const catalogue = JSON.parse(
      readFileSync(
        new URL('../../../data/photos/catalogue.json', import.meta.url),
        'utf8',
      ),
    ) as CampusPhoto[];
    const samples = catalogue.slice(0, 2);
    const records = new Map<
      string,
      {
        metadata: Partial<CampusPhoto>;
        draft: Partial<CampusPhoto>;
        revision: number;
        status: string;
        filename: string;
      }
    >();
    let failed = false,
      approvalInterrupted = false;
    const approvals = new Map<string, number>();
    await page.route('**/api/admin', async (route) => {
      const { action, payload } = route.request().postDataJSON();
      if (!action.startsWith('media-')) return route.fallback();
      if (action === 'media-begin') {
        if (records.has(payload.uploadId))
          return route.fulfill({
            json: {
              id: payload.uploadId,
              bucket: 'building-media',
              path: `owner/${payload.uploadId}/original`,
              token: 'test-only',
            },
          });
        const index = records.size;
        const sample = samples[index];
        const id = `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`;
        records.set(id, {
          filename: payload.filename,
          status: 'pending',
          revision: 0,
          draft: payload.metadata,
          metadata: {
            id: `owner:${id}`,
            url: sample.url,
            sha256: sample.sha256,
            bytes: sample.bytes,
            width: sample.width,
            height: sample.height,
          },
        });
        return route.fulfill({
          json: {
            id,
            bucket: 'building-media',
            path: `owner/${id}/original`,
            token: 'test-only',
          },
        });
      }
      if (action === 'media-library')
        return route.fulfill({
          json: {
            items: [...records].map(([id, r]) => ({
              ...r,
              id,
              previewUrl: r.metadata.url,
            })),
            nextOffset: null,
          },
        });
      const r = records.get(payload.id)!;
      if (action === 'media-status')
        return route.fulfill({ json: { ...r, previewUrl: r.metadata.url } });
      if (action === 'media-process') {
        if (!failed) {
          failed = true;
          return route.fulfill({
            status: 503,
            json: { error: 'Interrupted processing. Retry this photo.' },
          });
        }
        r.status = 'processed';
        return route.fulfill({ json: { ...r, previewUrl: r.metadata.url } });
      }
      if (action === 'media-preview')
        return route.fulfill({ json: { previewUrl: r.metadata.url } });
      if (action === 'media-draft') {
        if (payload.revision !== r.revision)
          return route.fulfill({
            status: 409,
            json: { error: 'Draft changed' },
          });
        r.draft = payload.metadata;
        r.revision++;
        return route.fulfill({ json: { revision: r.revision } });
      }
      if (action === 'media-approve') {
        approvals.set(payload.id, (approvals.get(payload.id) || 0) + 1);
        if (payload.id.endsWith('2') && !approvalInterrupted) {
          approvalInterrupted = true;
          return route.fulfill({
            status: 503,
            json: { error: 'Approval interrupted; retry the ready batch.' },
          });
        }
        expect(payload.authorshipConfirmed).toBe(true);
        r.metadata = payload.metadata;
        r.status = 'approved';
        return route.fulfill({ json: r.metadata });
      }
      return route.fulfill({ json: {} });
    });
    await page.route('https://editor-test.supabase.co/storage/**', (route) =>
      route.fulfill({ json: { Key: 'uploaded' } }),
    );
    for (const p of samples)
      await page.route(`**${p.url}`, (route) =>
        route.fulfill({
          body: readFileSync(
            new URL(`../../../data/photos/${p.sha256}.webp`, import.meta.url),
          ),
          contentType: 'image/webp',
        }),
      );
    await focusCampus(page);
    await page.getByRole('button', { name: 'Collapse explorer' }).click();
    await clickMap(page, [3.20012, 6.46022]);
    await page.getByRole('button', { name: /Manage photos/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Add photos', { exact: true }).setInputFiles(
      samples.map((p, i) => ({
        name: i ? 'courtyard.webp' : 'front.webp',
        mimeType: 'image/webp',
        buffer: readFileSync(
          new URL(`../../../data/photos/${p.sha256}.webp`, import.meta.url),
        ),
      })),
    );
    await expect(
      dialog.getByText('Interrupted processing. Retry this photo.', {
        exact: true,
      }),
    ).toBeVisible();
    await dialog
      .getByRole('button', { name: 'Retry processing', exact: true })
      .click();
    await expect(
      dialog.locator('.photo-queue-card').filter({ hasText: 'front.webp' }),
    ).toContainText('needs details');
    await dialog
      .getByLabel('Caption', { exact: true })
      .fill('Front view saved privately');
    await expect
      .poll(() => [...records.values()][0].draft.caption)
      .toBe('Front view saved privately');
    await page.reload();
    await attachMap(page);
    await focusCampus(page);
    await clickMap(page, [3.20012, 6.46022]);
    await page.getByRole('button', { name: /Manage photos/ }).click();
    await dialog.getByRole('button', { name: /Review uploads/ }).click();
    await expect(dialog.getByLabel('Caption', { exact: true })).toHaveValue(
      'Front view saved privately',
    );
    for (let i = 0; i < 2; i++) {
      if (i === 1)
        await dialog
          .locator('.photo-queue-card')
          .filter({ hasText: 'courtyard.webp' })
          .getByRole('button')
          .first()
          .click();
      await dialog
        .getByLabel('Caption', { exact: true })
        .fill(i ? 'Courtyard view' : 'Front view');
      await dialog
        .getByLabel('Image description (alternative text)')
        .fill(
          i ? 'Courtyard with covered walkway' : 'Building front with windows',
        );
      await dialog
        .getByLabel('Photo source', { exact: true })
        .selectOption('author-upload');
      await dialog
        .getByLabel('Photographer / public credit')
        .fill('Campus photographer');
      await dialog
        .getByLabel('Reuse license', { exact: true })
        .selectOption('CC BY 4.0');
      await dialog
        .getByRole('checkbox', { name: /I took this photograph/ })
        .check();
      await dialog
        .getByRole('checkbox', { name: /I checked the author/ })
        .check();
      await dialog
        .getByRole('checkbox', { name: /I checked visual quality/ })
        .check();
      await dialog
        .getByRole('button', { name: 'Mark ready', exact: true })
        .click();
    }
    await dialog
      .getByRole('button', { name: 'Add reviewed photos to draft' })
      .click();
    await expect(
      dialog.getByText('Approval interrupted; retry the ready batch.', {
        exact: true,
      }),
    ).toBeVisible();
    await dialog
      .getByRole('button', { name: 'Add reviewed photos to draft' })
      .click();
    await expect(dialog.locator('.photo-card')).toHaveCount(2);
    expect(approvals.get([...records.keys()][0])).toBe(1);
    await expect
      .poll(
        () => server.edits().find((e) => e.id === 'library')?.properties.photos,
      )
      .toHaveLength(2);
    await dialog
      .locator('.photo-card')
      .filter({ hasText: 'Courtyard view' })
      .getByRole('button', { name: 'Make cover' })
      .click();
    await expect(dialog.locator('.photo-card').first()).toContainText(
      'Courtyard view',
    );
    await dialog
      .getByRole('button', { name: 'Preview public gallery' })
      .click();
    await expect(
      dialog.getByRole('img', { name: 'Courtyard with covered walkway' }),
    ).toBeVisible();
    await dialog.getByText('Photo credits & license', { exact: true }).click();
    await expect(
      dialog.getByText('Photograph provided by the author', { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`photo-workspace-${width}.png`),
    });
    await dialog.getByRole('button', { name: 'Gallery', exact: true }).click();
    await dialog
      .locator('.photo-card')
      .first()
      .getByRole('button', { name: 'Remove', exact: true })
      .click();
    await expect(dialog.locator('.photo-card')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Undo removal' }).click();
    await expect(dialog.locator('.photo-card')).toHaveCount(2);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(
      page.getByRole('button', { name: /Manage photos/ }),
    ).toBeFocused();
  });

test('an upload keeps its original building when the inspector changes mid-upload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const server = await setup(page);
  const sample = JSON.parse(
    readFileSync(
      new URL('../../../data/photos/catalogue.json', import.meta.url),
      'utf8',
    ),
  )[0] as CampusPhoto;
  const id = '33333333-3333-4333-8333-333333333333';
  let target: Partial<CampusPhoto> = {},
    status = 'pending',
    revision = 0,
    started = false;
  let release!: () => void;
  const upload = new Promise<void>((resolve) => {
    release = resolve;
  });
  const metadata = {
    id: `owner:${id}`,
    url: sample.url,
    sha256: sample.sha256,
    bytes: sample.bytes,
    width: sample.width,
    height: sample.height,
  };
  await page.route('**/api/admin', async (route) => {
    const { action, payload } = route.request().postDataJSON();
    if (!action.startsWith('media-')) return route.fallback();
    if (action === 'media-begin') {
      target = payload.metadata;
      return route.fulfill({
        json: {
          id,
          bucket: 'building-media',
          path: 'owner/original',
          token: 'test-only',
        },
      });
    }
    if (action === 'media-process') {
      status = 'processed';
      return route.fulfill({
        json: {
          metadata,
          draft: target,
          status,
          revision,
          previewUrl: sample.url,
        },
      });
    }
    if (action === 'media-preview')
      return route.fulfill({ json: { previewUrl: sample.url } });
    if (action === 'media-draft') {
      target = payload.metadata;
      revision++;
      return route.fulfill({ json: { revision } });
    }
    return route.fulfill({ json: {} });
  });
  await page.route(
    'https://editor-test.supabase.co/storage/**',
    async (route) => {
      started = true;
      await upload;
      await route.fulfill({ json: { Key: 'uploaded' } });
    },
  );
  await page.route(`**${sample.url}`, (route) =>
    route.fulfill({
      body: readFileSync(
        new URL(`../../../data/photos/${sample.sha256}.webp`, import.meta.url),
      ),
      contentType: 'image/webp',
    }),
  );
  try {
    await focusCampus(page);
    await page.getByRole('button', { name: 'Collapse explorer' }).click();
    await clickMap(page, [3.20012, 6.46022]);
    await page.getByRole('button', { name: /Manage photos/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Add photos', { exact: true }).setInputFiles({
      name: 'front.webp',
      mimeType: 'image/webp',
      buffer: readFileSync(
        new URL(`../../../data/photos/${sample.sha256}.webp`, import.meta.url),
      ),
    });
    await expect.poll(() => started).toBe(true);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page
      .getByRole('button', { name: 'Open explorer', exact: true })
      .click();
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page
      .getByRole('searchbox', { name: 'Search map features' })
      .fill('New lecture hall');
    await page
      .locator('.editor-feature-list button')
      .filter({ hasText: 'New lecture hall' })
      .click();
    await page.getByRole('button', { name: /Manage photos/ }).click();
    await expect(
      dialog.getByRole('heading', { name: 'Photos · New lecture hall' }),
    ).toBeVisible();
    release();
    await expect.poll(() => status).toBe('processed');
    await dialog.getByRole('button', { name: /Review uploads/ }).click();
    await expect(dialog.getByText(/No unfinished photos/)).toBeVisible();
    expect(target.buildingId).toBe('library');
    expect(
      server.edits().flatMap((e) => e.properties.photos || []),
    ).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page
      .getByRole('searchbox', { name: 'Search map features' })
      .fill('Library');
    await page
      .locator('.editor-feature-list button')
      .filter({ hasText: 'Library' })
      .first()
      .click();
    await page.getByRole('button', { name: /Manage photos/ }).click();
    await dialog.getByRole('button', { name: /Review uploads/ }).click();
    await expect(dialog.locator('.photo-queue-card')).toContainText(
      'needs details',
    );
    await expect(
      dialog.getByLabel('Pictured building', { exact: true }),
    ).toHaveValue('library');
  } finally {
    release();
  }
});

for (const width of [1440, 390])
  test(`owner photo review preserves captions through undo and reload at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const originalPhoto = JSON.parse(
      readFileSync(
        new URL('../../../data/photos/catalogue.json', import.meta.url),
        'utf8',
      ),
    )[0];
    const photo = { ...originalPhoto, buildingId: 'library' };
    const feature = browserCampus().map.features.find(
      (f) => f.properties?.id === 'library',
    )!;
    await page.route(`**${photo.url}`, (route) =>
      route.fulfill({
        body: readFileSync(
          new URL(`../../../data/photos/${photo.sha256}.webp`, import.meta.url),
        ),
        contentType: 'image/webp',
      }),
    );
    const server = await setup(page, false, false, {
      initialEdits: [
        {
          id: 'library',
          kind: 'building',
          geometry: feature.geometry,
          properties: { ...feature.properties, photos: [photo] },
          deleted: false,
        },
      ],
    });
    await focusCampus(page);
    await page.getByRole('button', { name: 'Collapse explorer' }).click();
    await clickMap(page, [3.20012, 6.46022]);
    const panel = page.getByRole('complementary', {
      name: 'Feature properties',
    });
    await panel
      .getByRole('button', { name: 'Manage photos · 1', exact: true })
      .click();
    const photosDialog = page.getByRole('dialog');
    await photosDialog
      .getByRole('button', { name: 'Edit details', exact: true })
      .click();
    await photosDialog
      .getByLabel('Caption', { exact: true })
      .fill('Reviewed courtyard view');
    await photosDialog
      .getByRole('checkbox', { name: /I checked visual quality/ })
      .check();
    await photosDialog
      .getByRole('button', { name: 'Mark ready', exact: true })
      .click();
    await photosDialog
      .getByRole('button', { name: 'Add reviewed photos to draft' })
      .click();
    await photosDialog
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await expect(page.locator('.editor-save-state')).toHaveText('Saved');
    await expect
      .poll(
        () =>
          (server.edits()[0].properties.photos as { caption: string }[])[0]
            .caption,
      )
      .toBe('Reviewed courtyard view');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect
      .poll(
        () =>
          (server.edits()[0].properties.photos as { caption: string }[])[0]
            .caption,
      )
      .toBe(originalPhoto.caption);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.locator('.editor-save-state')).toHaveText('Saved');
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Draw path', exact: true }),
    ).toBeEnabled();
    expect(
      (server.edits()[0].properties.photos as { caption: string }[])[0].caption,
    ).toBe('Reviewed courtyard view');
  });
// Read the actual MapLibre instance from the mounted React ref. No map, renderer,
// geometry controller, or pointer event is mocked or replaced by this test.
async function attachMap(page: Page) {
  await page.waitForFunction(() => {
    const element = document.querySelector('.map-canvas') as HTMLElement &
      Record<string, unknown>;
    const key = Object.keys(element || {}).find((k) =>
      k.startsWith('__reactFiber'),
    );
    let fiber = (key ? element[key] : undefined) as RefFiber | undefined;
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const value = hook.memoizedState?.current as MapInstance | undefined;
        if (value?.getCanvas && value?.project) {
          window.editorTestMap = value;
          return value.loaded();
        }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return false;
  });
}
async function position(page: Page, coordinates: Position) {
  return page.evaluate((coordinates) => {
    const map = window.editorTestMap;
    const p = map.project(coordinates),
      rect = map.getCanvas().getBoundingClientRect();
    return { x: rect.left + p.x, y: rect.top + p.y };
  }, coordinates);
}

test('published corrections leave Drafts and map highlights without losing saved edits', async ({
  page,
}) => {
  const correction: MapEdit = {
    id: 'library',
    kind: 'place',
    geometry: { type: 'Point', coordinates: [3.2001, 6.4601] },
    properties: { name: 'Published library' },
  };
  const server = await setup(page, false, false, {
    initialEdits: [correction],
    publishedEdits: [correction],
  });
  const draftIds = () =>
    page.evaluate(() => {
      const source = window.editorTestMap.getSource('editor-drafts');
      const data = source?.serialize().data as
        | { features?: { properties: { id: string } }[] }
        | undefined;
      return data?.features?.map((f) => f.properties.id) || [];
    });
  await page.getByRole('button', { name: 'Drafts', exact: true }).click();
  await expect(
    page.getByText('No unpublished changes. Published work stays on the map.'),
  ).toBeVisible();
  await expect.poll(draftIds).toEqual([]);
  expect(server.edits()).toHaveLength(1);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Search map features' })
    .fill('Published library');
  await page
    .locator('.editor-feature-list button')
    .filter({ hasText: 'Published library' })
    .click();
  await page.getByLabel('Name', { exact: true }).fill('Next library');
  await page.getByLabel('Name', { exact: true }).press('Tab');
  await expect
    .poll(() => server.edits()[0].properties.name)
    .toBe('Next library');
  await expect.poll(draftIds).toEqual(['library']);
  server.publish();
  await page.getByRole('button', { name: 'Releases', exact: true }).click();
  await expect(
    page.getByText('0 unpublished corrections · Saved'),
  ).toBeVisible();
  await expect.poll(draftIds).toEqual([]);
  expect(server.edits()[0].properties.name).toBe('Next library');
});

test('path crossing controls persist automatic connection and bridge choices', async ({
  page,
}) => {
  const server = await setup(page, false, false, {
    initialEdits: [
      {
        id: 'crossing-test',
        kind: 'path',
        geometry: {
          type: 'LineString',
          coordinates: [
            [3.2005, 6.4598],
            [3.2005, 6.46015],
          ],
        },
        properties: {
          name: 'Crossing test',
          vertexIds: ['crossing-test:start', 'crossing-test:end'],
        },
      },
    ],
  });
  const selectPath = async () => {
    await focusCampus(page);
    const point = await position(page, [3.2005, 6.4601]);
    await page.mouse.click(point.x, point.y);
    await expect(
      page.getByRole('checkbox', { name: 'Connect crossings automatically' }),
    ).toBeVisible();
  };
  await selectPath();
  const automatic = page.getByRole('checkbox', {
    name: 'Connect crossings automatically',
  });
  await expect(automatic).toBeChecked();
  await automatic.uncheck();
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === 'crossing-test')?.properties
          .autoConnectCrossings,
    )
    .toBe(false);
  await page
    .getByRole('combobox', { name: 'Crossing level', exact: true })
    .selectOption('bridge');
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === 'crossing-test')?.properties
          .crossingLevel,
    )
    .toBe('bridge');
  await page.reload();
  await attachMap(page);
  await selectPath();
  await expect(automatic).not.toBeChecked();
  await expect(
    page.getByRole('combobox', { name: 'Crossing level', exact: true }),
  ).toHaveValue('bridge');
  await page.screenshot({ path: 'test-results/path-crossing-controls.png' });
  await automatic.check();
  await page
    .getByRole('combobox', { name: 'Crossing level', exact: true })
    .selectOption('ground');
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === 'crossing-test')?.properties
          .crossingLevel,
    )
    .toBe('ground');
  expect(
    server.edits().find((e) => e.id === 'crossing-test')?.properties
      .autoConnectCrossings,
  ).toBe(true);
});
async function clickMap(page: Page, coordinates: Position) {
  // Feature selection can animate the camera. Project only after it settles.
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
  const p = await position(page, coordinates);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
}

test('editor reliability: field typing is one undo step across an autosave', async ({
  page,
}) => {
  await setup(page);
  await focusCampus(page);
  await page.getByRole('button', { name: 'Collapse explorer' }).click();
  await clickMap(page, [3.20012, 6.46022]);
  const name = page
    .getByRole('complementary', { name: 'Feature properties' })
    .getByLabel('Name', { exact: true });
  const original = await name.inputValue();
  await name.press('End');
  await name.pressSequentially(' West');
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  await name.pressSequentially(' entrance');
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(name).toHaveValue(original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(name).toHaveValue(original + ' West entrance');
});

test('editor reliability: export retries export and local recovery downloads offline', async ({
  page,
}) => {
  await setup(page);
  await focusCampus(page);
  let exports = 0,
    saves = 0;
  await page.route('**/api/admin', (route) => {
    const { action } = route.request().postDataJSON();
    if (action === 'export') {
      exports++;
      return route.fulfill({
        status: 503,
        json: { error: 'Export temporarily unavailable' },
      });
    }
    if (action === 'save-edits') saves++;
    return route.fallback();
  });
  await page.getByLabel('Backup options').click();
  await page
    .getByRole('button', { name: 'Export backup', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Retry export', exact: true }),
  ).toBeVisible();
  const initial = exports;
  await page.getByRole('button', { name: 'Retry export', exact: true }).click();
  await expect.poll(() => exports).toBeGreaterThan(initial);
  expect(saves).toBe(0);
  await page.getByRole('button', { name: 'Dismiss action error' }).click();
  await page.getByRole('button', { name: 'Draw path', exact: true }).click();
  await page.context().setOffline(true);
  const download = page.waitForEvent('download');
  await page
    .locator('.editor-backup-menu')
    .getByRole('button', { name: 'Download local recovery' })
    .click();
  const path = await (await download).path();
  const backup = JSON.parse(readFileSync(path!, 'utf8'));
  expect(backup).toMatchObject({
    schemaVersion: 1,
    baselineVersion: expect.any(String),
    workspace: {
      unfinished: { kind: 'path' },
      past: expect.any(Array),
      future: expect.any(Array),
    },
  });
  expect(saves).toBe(0);
});

test('editor reliability: opening duplicates is read-only until the reviewed batch is applied', async ({
  page,
}) => {
  const server = await setup(page, false, false, {
    mutateCampus: (campus) => {
      const gate = campus.places.find((p) => p.id === 'gate')!;
      campus.places.push({ ...gate, id: 'gate-copy' });
    },
  });
  await page.getByRole('button', { name: 'Duplicates', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Review exact duplicate cleanup' }),
  ).toBeVisible();
  expect(server.edits()).toEqual([]);
  await page
    .getByRole('button', { name: 'Review exact duplicate cleanup' })
    .click();
  await expect(
    page.getByRole('region', { name: 'Proposed duplicate cleanup' }),
  ).toContainText('gate-copy');
  expect(server.edits()).toEqual([]);
  await page
    .getByRole('button', { name: 'Apply reviewed duplicate cleanup' })
    .click();
  await expect
    .poll(
      () =>
        server.edits().filter((e) => e.deleted && e.properties.mergedInto)
          .length,
    )
    .toBe(1);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect
    .poll(
      () =>
        server
          .edits()
          .filter(
            (e) =>
              e.deleted &&
              e.properties.mergedInto &&
              !e.properties.revertToSource,
          ).length,
    )
    .toBe(0);
});

for (const firstCorrection of [false, true])
  test(`editor reliability: conflict choices retain unrelated server properties${firstCorrection ? ' on first correction' : ''}`, async ({
    page,
  }) => {
    const f = browserCampus().map.features.find(
      (f) => f.properties?.id === 'library',
    )!;
    const initial: MapEdit = {
      id: 'library',
      kind: 'building',
      geometry: f.geometry,
      properties: { ...f.properties, faculty: 'Original' },
      updated_at: '2026-09-11T10:00:00Z',
    };
    const server = await setup(page, false, false, {
      initialEdits: firstCorrection ? [] : [initial],
      mutateCampus: (campus) => {
        campus.map.features.find(
          (f) => f.properties?.id === 'library',
        )!.properties!.faculty = 'Original';
      },
    });
    await focusCampus(page);
    await page.getByRole('button', { name: 'Collapse explorer' }).click();
    await clickMap(page, [3.20012, 6.46022]);
    server.setEdits([
      {
        ...initial,
        properties: {
          ...initial.properties,
          name: 'Remote library',
          faculty: 'Remote faculty',
        },
        updated_at: '2026-09-11T11:00:00Z',
      },
    ]);
    await page
      .getByRole('complementary', { name: 'Feature properties' })
      .getByLabel('Name', { exact: true })
      .fill('Local library');
    await page
      .getByRole('button', { name: 'Review conflicts', exact: true })
      .click();
    const review = page.getByRole('complementary', {
      name: 'Review draft conflicts',
    });
    await expect(
      review.getByRole('button', { name: 'Apply reviewed choices' }),
    ).toBeDisabled();
    await review.getByLabel('Keep my value').check();
    await review
      .getByRole('button', { name: 'Apply reviewed choices' })
      .click();
    await expect
      .poll(() => server.edits()[0].properties)
      .toMatchObject({ name: 'Local library', faculty: 'Remote faculty' });
  });

test('editor reliability: shared destinations resolve aliases and missing links offer search', async ({
  page,
  context,
  browserName,
}) => {
  const server = await setup(page, false, false, {
    mutateCampus: (campus) => {
      campus.placeIdAliases = { 'old-library': campus.places[0].id };
    },
  });
  await page.goto('/?place=old-library');
  await expect(
    page.getByRole('heading', {
      name: server.campus.places[0].name,
      exact: true,
    }),
  ).toBeVisible();
  let link: string;
  if (browserName === 'webkit') {
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: undefined,
      }),
    );
    await page.getByRole('button', { name: 'Copy link' }).click();
    link = await page
      .getByLabel('Destination link', { exact: true })
      .inputValue();
  } else {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy link' }).click();
    link = await page.evaluate(() => navigator.clipboard.readText());
  }
  expect(new URL(link).searchParams.get('place')).toBe(
    server.campus.places[0].id,
  );
  await page.getByRole('button', { name: 'Directions', exact: true }).click();
  await page.getByLabel('Starting place').selectOption('gate');
  await expect(page.getByLabel('Recorded steps information')).toContainText(
    'unknown',
  );
  await page.goto('/?place=missing-destination');
  await expect(
    page.getByRole('button', { name: 'Search campus places' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Search campus places' }).click();
  await expect(page.getByLabel('Search campus')).toBeFocused();
});

test('editor reliability: retry route replaces a failed worker and calculates the walk', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    let fail = true;
    window.Worker = class extends OriginalWorker {
      private breakRequest: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.breakRequest = String(url).includes('routing.worker');
      }
      postMessage(message: unknown, transfer?: Transferable[]) {
        if (
          this.breakRequest &&
          fail &&
          (message as { type?: string }).type === 'request'
        ) {
          fail = false;
          queueMicrotask(() =>
            this.dispatchEvent(
              new ErrorEvent('error', { message: 'Simulated worker failure' }),
            ),
          );
          return;
        }
        super.postMessage(message, transfer || []);
      }
    };
  });
  const server = await setup(page);
  await page.getByRole('button', { name: 'Test route', exact: true }).click();
  await page.getByLabel('Test route From').selectOption('gate');
  await page
    .getByLabel('Test route To')
    .selectOption(server.campus.places[0].id);
  await page
    .getByRole('button', { name: 'Preview route', exact: true })
    .click();
  await page.getByRole('button', { name: 'Retry route', exact: true }).click();
  await expect(page.locator('.editor-route-test')).toContainText(
    'Shortest walk',
  );
});

test('editor reliability: expired authentication offers sign-in and retains the pending save', async ({
  page,
}) => {
  await setup(page);
  await focusCampus(page);
  await page.route('**/api/admin', (route) => {
    if (route.request().postDataJSON().action === 'save-edits')
      return route.fulfill({ status: 401, json: { error: 'Expired' } });
    return route.fallback();
  });
  await page.getByRole('button', { name: 'Collapse explorer' }).click();
  await clickMap(page, [3.20012, 6.46022]);
  await page
    .getByRole('complementary', { name: 'Feature properties' })
    .getByLabel('Name', { exact: true })
    .fill('Retained local name');
  await expect(
    page.getByRole('button', { name: 'Sign in again', exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page
    .locator('.editor-error-stack')
    .getByRole('button', { name: 'Download local recovery' })
    .click();
  const backup = JSON.parse(
    readFileSync((await (await download).path())!, 'utf8'),
  );
  expect(backup.workspace.pending.edits[0].edit.properties.name).toBe(
    'Retained local name',
  );
});

test('editor reliability: source comparisons and release status refresh without saving', async ({
  page,
}, testInfo) => {
  const server = await setup(page, true);
  let polls = 0,
    saves = 0;
  const before = server.campus.map.features.find(
    (f) => f.properties?.id === 'arcgis:University_Property:120',
  )!;
  const after = structuredClone(before);
  after.properties!.name = 'Reviewed Senate name';
  await page.route('**/api/admin', (route) => {
    const { action } = route.request().postDataJSON();
    if (action === 'save-edits') saves++;
    if (action === 'review-status') {
      polls++;
      return route.fulfill({
        json: {
          jobs: [
            {
              id: 'job-test',
              kind: 'source',
              status: 'complete',
              message: 'Source check complete',
              created_at: '2026-09-14T00:00:00Z',
            },
          ],
          releases: [],
          changes: [
            {
              id: 'change-test',
              source_id: 'source-test',
              kind: 'modify',
              summary: 'Senate name update',
              before: { payload: before },
              after: { payload: after },
              status: 'pending',
            },
          ],
        },
      });
    }
    return route.fallback();
  });
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await expect(
    page.getByText('Source check complete', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'modify Senate name update' }).click();
  await expect(page.locator('.source-comparison table')).toContainText(
    'Reviewed Senate name',
  );
  expect(polls).toBeGreaterThan(0);
  expect(saves).toBe(0);
  await page.getByRole('button', { name: 'Releases', exact: true }).click();
  const impact = page.getByRole('region', { name: 'Release impact' });
  await expect(impact).toContainText('Clinic–Law');
  await expect(impact.locator('tbody')).toContainText('Connected');
  await impact.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('desktop-release-impact.png'),
  });
  expect(saves).toBe(0);
});

test('editor reliability: uncertain jobs check status before resubmission and read errors recover authentication', async ({
  page,
}) => {
  await setup(page);
  let submissions = 0,
    reads = 0,
    expired = false;
  await page.route('**/api/admin', (route) => {
    const { action } = route.request().postDataJSON();
    if (action === 'check-sources') {
      submissions++;
      return route.abort('failed');
    }
    if (action === 'state') reads++;
    if (action === 'review-status' && expired)
      return route.fulfill({ status: 401, json: { error: 'Expired' } });
    return route.fallback();
  });
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await page.getByRole('button', { name: 'Check now', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Check action status', exact: true }),
  ).toBeVisible();
  expect(submissions).toBe(1);
  await page.getByRole('button', { name: 'Check now', exact: true }).click();
  await expect.poll(() => reads).toBeGreaterThan(0);
  await expect(
    page.getByRole('button', { name: 'Check action status', exact: true }),
  ).not.toBeVisible();
  expect(submissions).toBe(1);
  await page.getByRole('button', { name: 'Check now', exact: true }).click();
  await expect.poll(() => submissions).toBe(2);
  expired = true;
  await expect(
    page.getByRole('button', { name: 'Sign in again', exact: true }),
  ).toBeVisible();
});

test('prepared offline survey editor opens its cache after backend failure while the browser is online', async ({
  page,
}, testInfo) => {
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
});

test.describe('phone editor reliability', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('phone editor reliability: guided entrance repair is previewed before saving', async ({
    page,
  }, testInfo) => {
    const point = browserCampus().graph.nodes.find(
      (n) => n.id === 'b',
    )!.coordinates;
    const initial: MapEdit = {
      id: 'door-repair',
      kind: 'entrance',
      geometry: { type: 'Point', coordinates: point },
      properties: {
        name: 'Repair door',
        placeId: '',
        connection: { type: 'node', nodeId: 'b', coordinates: point },
      },
      updated_at: '2026-09-11T10:00:00Z',
    };
    const server = await setup(page, false, false, { initialEdits: [initial] });
    await page.getByRole('button', { name: 'Releases', exact: true }).tap();
    await page
      .getByRole('button', { name: 'Choose entrance’s place' })
      .first()
      .tap();
    await expect(
      page.getByLabel('Entrance place', { exact: true }),
    ).toBeFocused();
    await page
      .getByLabel('Entrance place', { exact: true })
      .selectOption(server.campus.places[0].id);
    await expect(
      page.getByRole('complementary', { name: 'Review proposed repair' }),
    ).toBeVisible();
    expect(server.edits()[0].properties.placeId).toBe('');
    await expect(
      page.getByRole('button', { name: 'Draw path', exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: testInfo.outputPath('phone-repair-preview.png'),
    });
    await page.getByRole('button', { name: 'Cancel repair' }).tap();
    expect(server.edits()[0].properties.placeId).toBe('');
    await page
      .getByLabel('Entrance place', { exact: true })
      .selectOption(server.campus.places[0].id);
    await page.getByRole('button', { name: 'Apply reviewed repair' }).tap();
    await expect
      .poll(() => server.edits()[0].properties.placeId)
      .toBe(server.campus.places[0].id);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});

async function focusModels(page: Page, phone = false) {
  await page.evaluate(
    (phone) =>
      window.editorTestMap.jumpTo({
        center: [3.19978, 6.47109],
        zoom: 18,
        pitch: 50,
        bearing: -18,
        padding: {
          top: 0,
          right: 0,
          bottom: phone ? 350 : 0,
          left: phone ? 0 : 450,
        },
      }),
    phone,
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
      ),
    )
    .toContain('arcgis:University_Property:120');
}
test('release diagnostics preserve the usable campus and identify the captured missing endpoints', async ({
  page,
}) => {
  await setup(page, true);
  const captured = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL('../fixtures/editor-2026-09-14.json.gz', import.meta.url),
      ),
    ).toString(),
  ) as { base: CampusData; edits: MapEdit[] };
  const { map, places, graph, ...meta } = captured.base;
  const record = (entity: string, payload: unknown, id: string) => ({
    entity,
    payload,
    id,
    source: 'fixture',
    hash: 'fixture',
  });
  const features = [
    record('meta', meta, 'meta:campus'),
    ...map.features.map((f, i) => record('feature', f, `feature:${i}`)),
    ...places.map((p) => record('place', p, p.id)),
    ...graph.nodes.map((n) => record('node', n, n.id)),
    ...graph.edges.map((e) => record('edge', e, e.id)),
  ];
  await page.route('**/api/admin', (route) => {
    const { action } = route.request().postDataJSON();
    return route.fulfill({
      json:
        action === 'sources'
          ? { features }
          : action === 'state'
            ? {
                edits: captured.edits,
                reports: [],
                changes: [],
                jobs: [],
                releases: [],
              }
            : [],
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.reload();
  await attachMap(page);
  await page.getByRole('button', { name: 'Releases', exact: true }).click();
  await expect(
    page.getByText('Validation needs attention', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Showing the last usable map/)).toBeVisible();
  await expect(
    page.getByText(/osm:way:1534765716:2297333149:2297333129:1/).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Build review preview' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Retry validation' }).click();
  await expect(
    page.getByRole('button', { name: 'Locate feature' }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download diagnostics' }).click();
  expect((await download).suggestedFilename()).toBe(
    'turnright-validation.json',
  );
  await page.getByRole('button', { name: 'Locate feature' }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.getZoom()))
    .toBeCloseTo(18, 1);
  expect(errors).toEqual([]);
});
test('review separate building wings, edit their geometry, save and undo without changing identity', async ({
  page,
}) => {
  test.setTimeout(90000);
  const server = await setup(page, true);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: 'Collapse explorer' }).click();
  await page.evaluate(() =>
    window.editorTestMap.jumpTo({
      center: [3.19978, 6.47109],
      zoom: 18,
      pitch: 0,
      padding: { top: 0, right: 300, bottom: 0, left: 0 },
    }),
  );
  await clickMap(page, [3.1997, 6.47128]);
  await page.getByRole('button', { name: 'Review corrected wings' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Review proposed repair' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Apply reviewed repair' }).click();
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  const building = () =>
    server
      .edits()
      .find(
        (e) =>
          e.id === 'arcgis:University_Property:120' && e.kind === 'building',
      );
  await expect.poll(() => building()?.geometry.type).toBe('MultiPolygon');
  const before = structuredClone(building()!.geometry);
  await page.getByRole('button', { name: 'Outline', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
  const from = await position(page, [3.1996805, 6.4707775]),
    to = await position(page, [3.19967, 6.47078]);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(() => JSON.stringify(building()?.geometry))
    .not.toBe(JSON.stringify(before));
  expect(building()!.geometry.type).toBe('MultiPolygon');
  await page.keyboard.press('Control+z');
  await expect.poll(() => building()?.geometry).toEqual(before);
  await page.keyboard.press('Control+z');
  await expect.poll(() => building()?.properties.revertToSource).toBe(true);
  expect(errors).toEqual([]);
});
for (const phone of [false, true])
  test(`miniature models: ${phone ? 'phone' : 'desktop'} LOD, picking, appearance and simple preference`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    if (phone) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await setup(page, true, true);
    await page.goto('/');
    await attachMap(page);
    await focusModels(page, phone);
    const p = await position(page, [3.19978, 6.47109]);
    await page.mouse.click(p.x, p.y - 12);
    await expect(
      page.getByRole('heading', { name: 'LASU Senate Building', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Approximately 21 m/)).toBeVisible();
    await page.screenshot({
      path: `test-results/miniature-${phone ? 'phone' : 'desktop'}-light.png`,
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.screenshot({
      path: `test-results/miniature-${phone ? 'phone' : 'desktop'}-dark.png`,
    });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('radio', { name: 'Simple', exact: true }).check();
    await expect
      .poll(() =>
        page.evaluate(() => !!window.editorTestMap.getLayer('campus-models')),
      )
      .toBe(false);
    await page.reload();
    await attachMap(page);
    await page
      .getByRole('button', { name: 'Expand card', exact: true })
      .click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(
      page.getByRole('radio', { name: 'Simple', exact: true }),
    ).toBeChecked();
    await page.getByRole('radio', { name: 'Enhanced', exact: true }).check();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await focusModels(page, phone);
    await page.evaluate(() => window.editorTestMap.jumpTo({ zoom: 14 }));
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
        ),
      )
      .not.toContain('arcgis:University_Property:120');
    await page
      .getByRole('button', { name: 'Switch to 2D', exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() => !!window.editorTestMap.getLayer('campus-models')),
      )
      .toBe(false);
    expect(errors).toEqual([]);
  });
for (const editor of [false, true])
  test(`enhanced zoom restores visible facade detail on the ${editor ? 'editor' : 'public map'}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(150000);
    await page.emulateMedia({ colorScheme: 'dark' });
    const sectorUrl = '/packages/visual-abcdef/zoom-test.json';
    let sectorBody = '';
    let expectedColours: number[][] = [];
    await page
      .context()
      .route(`**${sectorUrl}`, (route) =>
        route.fulfill({ body: sectorBody, contentType: 'application/json' }),
      );
    await setup(page, false, false, {
      mutateCampus(data) {
        const feature = data.map.features.find(
          (f) => f.properties?.id === 'library',
        )!;
        const visual: BuildingVisual = {
          id: 'library',
          name: 'Library',
          geometryRevision: buildingRevision(feature),
          level: 'detailed',
          height: 15,
          heightKind: 'recorded',
          roofForm: 'hip',
          wallColour: '#ddccbb',
          roofColour: '#aa5533',
          confidence: 'inferred',
          sources: [],
          observed: [],
          inferred: [],
          needed: [],
          sectorId: 'zoom-test',
        };
        const model = createBuildingModel(
          feature as import('geojson').Feature<import('geojson').Polygon>,
          visual,
        );
        expectedColours = model.meshes.map((mesh) =>
          new Color(mesh.colour).toArray(),
        );
        // Exercise old packages without surface metadata as well as current meshes.
        if (!editor) for (const mesh of model.meshes) delete mesh.surfaces;
        sectorBody = JSON.stringify({
          schemaVersion: 1,
          id: 'zoom-test',
          models: [model],
        });
        const bytes = Buffer.byteLength(sectorBody);
        data.visuals = {
          schemaVersion: 1,
          revision: 'zoom-test',
          buildings: [visual],
          references: [],
          bytes,
          sectors: [
            {
              id: 'zoom-test',
              url: sectorUrl,
              bytes,
              sha256: createHash('sha256').update(sectorBody).digest('hex'),
              bounds: [
                [3.2001, 6.4602],
                [3.2004, 6.4604],
              ],
              buildingIds: ['library'],
            },
          ],
        };
      },
    });
    if (!editor) {
      await page.goto('/');
      await attachMap(page);
    } else
      await page
        .getByRole('button', { name: 'Switch to 3D', exact: true })
        .click();
    await page.evaluate(() =>
      window.editorTestMap.jumpTo({
        center: [3.20025, 6.4603],
        zoom: 18,
        pitch: 50,
        bearing: 0,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
      }),
    );
    const rendered = () =>
      page.evaluate(() =>
        JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
      );
    await expect.poll(rendered).toContain('library');
    // Count actual Three.js draw calls, not merely the presence of a model ID.
    // Keep real camera gestures and WebGL; only simulate slow frame timing.
    await page.evaluate(() => {
      const map = window.editorTestMap;
      const layer = (
        map.getLayer('campus-models') as unknown as {
          implementation: import('maplibre-gl').CustomLayerInterface;
        }
      ).implementation;
      const render = layer.render;
      const stats = {
        calls: 0,
        indices: 0,
        moving: false,
        slow: false,
        reducedSeen: false,
        frameMs: [] as number[],
        collectColours: true,
        colours: [] as number[][],
      };
      (window as unknown as { zoomDetail: typeof stats }).zoomDetail = stats;
      let clock = performance.now();
      layer.render = function (gl, args) {
        const draw = gl.drawElements,
          now = performance.now;
        const started = now.call(performance);
        stats.calls = 0;
        stats.indices = 0;
        stats.moving = map.isMoving();
        const collectColours = stats.collectColours;
        if (collectColours) stats.colours = [];
        gl.drawElements = function (mode, count, type, offset) {
          stats.calls++;
          stats.indices += count;
          if (collectColours) {
            const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;
            const diffuse = gl.getUniformLocation(program, 'diffuse');
            if (diffuse)
              stats.colours.push(
                Array.from(gl.getUniform(program, diffuse) as Float32Array),
              );
          }
          return draw.call(this, mode, count, type, offset);
        };
        if (stats.slow && map.isMoving()) {
          clock += 70;
          performance.now = () => clock;
        }
        try {
          render.call(this, gl, args);
        } finally {
          gl.drawElements = draw;
          performance.now = now;
          if (!stats.slow && !collectColours)
            stats.frameMs.push(now.call(performance) - started);
          stats.collectColours = false;
        }
        if (
          document
            .querySelector('.map-detail-status')
            ?.textContent?.includes('Detail reduced')
        )
          stats.reducedSeen = true;
      };
      map.triggerRepaint();
    });
    const drawing = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              zoomDetail: {
                calls: number;
                indices: number;
                moving: boolean;
                reducedSeen: boolean;
                frameMs: number[];
                colours: number[][];
              };
            }
          ).zoomDetail,
      );
    await expect.poll(async () => (await drawing()).calls).toBeGreaterThan(2);
    const full = await drawing();
    const checkColours = async () => {
      const { colours } = await drawing();
      // Transparent DoubleSide materials draw front and back faces separately.
      expect(colours.length).toBeGreaterThanOrEqual(expectedColours.length);
      for (const colour of expectedColours)
        expect(colours).toContainEqual(
          colour.map((channel) => expect.closeTo(channel, 5)),
        );
      for (const colour of colours)
        expect(expectedColours).toContainEqual(
          colour.map((channel) => expect.closeTo(channel, 5)),
        );
    };
    // Read the actual shader's diffuse values: walls, roofs, windows and trim
    // must retain their source RGB, rather than merely retaining saved swatches.
    await checkColours();
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator('html')).toHaveClass(
        colorScheme === 'dark' ? /dark/ : /^(?!.*dark)/,
      );
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.editorTestMap.getPaintProperty(
              'background',
              'background-color',
            ),
          ),
        )
        .toBe(colorScheme === 'dark' ? '#293e52' : '#eee9dc');
      await page.evaluate(() => {
        const stats = (
          window as unknown as {
            zoomDetail: { collectColours: boolean; colours: number[][] };
          }
        ).zoomDetail;
        stats.colours = [];
        stats.collectColours = true;
        window.editorTestMap.triggerRepaint();
      });
      await expect
        .poll(async () => (await drawing()).colours.length)
        .toBeGreaterThanOrEqual(expectedColours.length);
      await checkColours();
      expect((await drawing()).indices).toBe(full.indices);
    }
    await page.evaluate(() => {
      (window as unknown as { zoomDetail: { slow: boolean } }).zoomDetail.slow =
        true;
      window.editorTestMap.easeTo({ zoom: 18.5, duration: 5000 });
    });
    await expect.poll(async () => (await drawing()).reducedSeen).toBe(true);
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
      .toBe(false);
    await expect(
      page.getByText('Detail reduced for smoother movement'),
    ).toHaveCount(0);
    await expect.poll(async () => (await drawing()).indices).toBe(full.indices);
    await page.evaluate(() => {
      (window as unknown as { zoomDetail: { slow: boolean } }).zoomDetail.slow =
        false;
    });
    // Cross both LOD boundaries repeatedly without touching the view toggle.
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.evaluate(() => window.editorTestMap.jumpTo({ zoom: 14.9 }));
      await expect.poll(rendered).not.toContain('library');
      await page.evaluate(() => window.editorTestMap.jumpTo({ zoom: 16 }));
      await expect.poll(rendered).toContain('library');
      await expect
        .poll(async () => (await drawing()).indices)
        .toBeLessThan(full.indices);
      await page.evaluate(() => window.editorTestMap.jumpTo({ zoom: 18 }));
      await expect
        .poll(async () => (await drawing()).indices)
        .toBe(full.indices);
    }
    const measured = await drawing();
    const durations = measured.frameMs.slice().sort((a, b) => a - b);
    await testInfo.attach('renderer-performance', {
      body: JSON.stringify({
        calls: full.calls,
        indices: full.indices,
        samples: durations.length,
        medianMs: durations[Math.floor(durations.length / 2)],
        p95Ms: durations[Math.floor(durations.length * 0.95)],
      }),
      contentType: 'application/json',
    });
    await page.screenshot({
      path: `test-results/zoom-detail-${editor ? 'editor' : 'public'}-${page.viewportSize()?.width}.png`,
    });
  });

test('miniature models fall back for unavailable sectors and keep drawing unobstructed', async ({
  page,
}) => {
  test.setTimeout(120000);
  const { campus } = await setup(page, true, true);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await focusModels(page);
  const roof = await position(page, [3.19978, 6.47109]);
  await page.mouse.click(roof.x, roof.y - 12);
  await expect(
    page.getByRole('complementary', { name: 'Feature properties' }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Name', exact: true }),
  ).toHaveValue('LASU Senate Building');
  await page.getByRole('button', { name: 'Close properties' }).click();
  await page.getByRole('button', { name: 'Draw path', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
      ),
    )
    .not.toContain('arcgis:University_Property:120');
  await expect(
    page.getByRole('button', { name: 'Finish', exact: true }),
  ).toBeDisabled();
  await clickMap(page, [3.19945, 6.47115]);
  await expect(page.locator('.drawing-progress')).toContainText('1');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await focusModels(page);
  for (const sector of campus.visuals!.sectors)
    await page.route(`**${sector.url}`, (route) =>
      route.fulfill({ status: 503, body: 'Unavailable' }),
    );
  await page.reload();
  await attachMap(page);
  await page.evaluate(() =>
    window.editorTestMap.jumpTo({
      center: [3.19978, 6.47109],
      zoom: 18,
      pitch: 50,
    }),
  );
  await expect(
    page.getByRole('button', { name: 'Switch to 2D', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
      ),
    )
    .not.toContain('arcgis:University_Property:120');
});
async function focusCampus(page: Page) {
  await page.evaluate(() =>
    window.editorTestMap.jumpTo({
      center: [3.2003, 6.4602],
      zoom: 19,
      bearing: 0,
      pitch: 0,
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
    }),
  );
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
}

for (const touch of [false, true])
  test(`drawing session protects the first point and restores panels with ${touch ? 'touch' : 'mouse'}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:5183',
      viewport: touch
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      hasTouch: touch,
      isMobile: touch,
    });
    const page = await context.newPage();
    try {
      const server = await setup(page);
      await focusCampus(page);
      await page
        .getByRole('button', { name: 'Draw path', exact: true })
        .click();
      await expect(page.locator('.editor-explorer')).toHaveClass(/collapsed/);
      await expect(
        page.getByText('Click or tap the map to place the first point.'),
      ).toBeVisible();
      const finish = page.getByRole('button', { name: 'Finish', exact: true });
      await expect(finish).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Draw building', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Compare base', exact: true }),
      ).toBeDisabled();
      const point = await position(page, [3.20015, 6.4601]);
      if (touch) await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
      await expect(page.locator('.drawing-progress')).toContainText(
        '1 point placed',
      );
      await expect(finish).toBeDisabled();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.editorTestMap
                .queryRenderedFeatures()
                .filter(
                  (f) => /td-/.test(f.layer.id) && f.geometry.type === 'Point',
                ).length,
          ),
        )
        .toBeGreaterThan(0);
      await page
        .getByRole('button', { name: 'Switch to 3D', exact: true })
        .click();
      await expect
        .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
        .toBeGreaterThan(45);
      await expect(page.locator('.drawing-progress')).toContainText(
        '1 point placed',
      );
      const second = await position(page, [3.2004, 6.46]);
      if (touch) await page.touchscreen.tap(second.x, second.y);
      else await page.mouse.click(second.x, second.y);
      await expect(finish).toBeEnabled();
      await expect(page.locator('.editor-guidance')).toContainText(
        'Connect to',
      );
      await finish.click();
      await expect(page.locator('.editor-explorer')).not.toHaveClass(
        /collapsed/,
      );
      await expect
        .poll(() => server.edits().filter((e) => e.kind === 'path').length)
        .toBe(1);
      expect(
        server.edits().find((e) => e.kind === 'path')?.properties.connections
          ?.length,
      ).toBeGreaterThan(0);
      await page
        .getByRole('button', { name: 'Draw path', exact: true })
        .click();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.locator('.editor-explorer')).not.toHaveClass(
        /collapsed/,
      );
      expect(server.edits().filter((e) => e.kind === 'path')).toHaveLength(1);
    } finally {
      await context.close();
    }
  });

test('public map defaults to 3D, frames campus and opens building details', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Campus map:'))
      errors.push(message.text());
  });
  await setup(page);
  await page.goto('/');
  await attachMap(page);
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
    .toBe(45);
  const heights = await page.evaluate(async () => {
    const source = window.editorTestMap.getSource(
      'campus',
    ) as import('maplibre-gl').GeoJSONSource;
    const data =
      (await source.getData()) as import('geojson').FeatureCollection;
    return data.features
      .filter((f) => f.properties?.kind === 'building')
      .map((f) => [
        f.properties?.id,
        f.properties?.displayHeight,
        f.properties?.heightKind,
      ]);
  });
  expect(heights).toContainEqual(['unknown-building', 6, 'illustrative']);
  expect(heights).toContainEqual(['library', 15, 'recorded']);
  await page.getByRole('button', { name: 'Switch to 2D', exact: true }).click();
  await page.reload();
  await attachMap(page);
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
    .toBe(0);
  await focusCampus(page);
  await clickMap(page, [3.20012, 6.46022]);
  await expect(page.getByText('15 m · recorded height')).toBeVisible();
  await page.evaluate(() =>
    window.editorTestMap.jumpTo({
      center: [3.2007, 6.4603],
      zoom: 19,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    }),
  );
  await clickMap(page, [3.2007, 6.4603]);
  await expect(page.getByRole('dialog')).toContainText(
    'Height unknown · illustrative 6 m block',
  );
  await expect(
    page.getByRole('button', { name: 'Report building details' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('public initial camera includes the northern campus', async ({ page }) => {
  const { campus } = await setup(page, true);
  await page.goto('/');
  await attachMap(page);
  const corners = await page.evaluate((bounds) => {
    const map = window.editorTestMap;
    return [
      bounds[0],
      bounds[1],
      [bounds[0][0], bounds[1][1]],
      [bounds[1][0], bounds[0][1]],
    ].map((p) => map.project(p as Position));
  }, campus.bounds);
  for (const point of corners) {
    expect(point.x).toBeGreaterThan(450);
    expect(point.x).toBeLessThan(1440);
    expect(point.y).toBeGreaterThan(0);
    expect(point.y).toBeLessThan(1000);
  }
  await page.screenshot({ path: 'test-results/public-campus-3d-light.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTestMap.getPaintProperty('background', 'background-color'),
      ),
    )
    .toBe('#293e52');
  await page.screenshot({ path: 'test-results/public-campus-3d-dark.png' });
});

test('public phone starts at 40 degrees and frames campus in both preferences', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5183',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    const { campus } = await setup(page, true);
    await page.goto('/');
    await attachMap(page);
    await page
      .getByRole('button', { name: 'Expand card', exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
      .toBe(40);
    await page
      .getByRole('button', { name: 'Switch to 2D', exact: true })
      .click();
    await page.reload();
    await attachMap(page);
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
      .toBe(0);
    const points = await page.evaluate(
      (bounds) =>
        [bounds[0], bounds[1]].map((p) => window.editorTestMap.project(p)),
      campus.bounds,
    );
    for (const p of points) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(390);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(844);
    }
  } finally {
    await context.close();
  }
});

test('duplicate queue keeps same-name campus records separate and supports undo and reload', async ({
  page,
}) => {
  const server = await setup(page, true);
  await page.getByRole('button', { name: 'Duplicates', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Duplicate review', exact: true }),
  ).toBeVisible();
  const pair = page.locator('.duplicate-pair').first();
  await expect(pair).toBeVisible();
  await expect(page.locator('.duplicate-review output')).toHaveText(
    /\d+ pairs to review/,
  );
  const original = await page.locator('.duplicate-review output').textContent();
  await pair
    .getByRole('button', { name: 'Keep these records separate' })
    .click();
  await expect(page.locator('.duplicate-review output')).not.toHaveText(
    original!,
  );
  await expect
    .poll(
      () =>
        server.edits().filter((e) => e.properties.duplicateKeepSeparate).length,
    )
    .toBe(2);
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.locator('.duplicate-review output')).toHaveText(original!);
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  await page
    .locator('.duplicate-pair')
    .first()
    .getByRole('button', { name: 'Keep record 1 and merge' })
    .click();
  await expect
    .poll(
      () =>
        server
          .edits()
          .filter(
            (e) =>
              e.deleted &&
              e.properties.mergedInto &&
              !e.properties.revertToSource,
          ).length,
    )
    .toBe(1);
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  await expect(page.locator('.duplicate-review output')).toHaveText(
    /\d+ pairs to review/,
  );
  const count = await page.locator('.duplicate-review output').textContent();
  await page.reload();
  await attachMap(page);
  await page.getByRole('button', { name: 'Duplicates', exact: true }).click();
  await expect(page.locator('.duplicate-review output')).toHaveText(count!);
});

for (const threeD of [false, true])
  test(`map two entrances and their approaches in ${threeD ? '3D' : '2D'}, save and reload`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const server = await setup(page);
    await focusCampus(page);
    if (threeD) {
      await page
        .getByRole('button', { name: 'Switch to 3D', exact: true })
        .click();
      await expect
        .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
        .toBeGreaterThan(45);
    }
    await page.getByRole('button', { name: 'Collapse explorer' }).click();
    for (const [i, x] of [3.20018, 3.20033].entries()) {
      // Select the existing building surface, then use its entrance action.
      await clickMap(page, [3.20012, 6.46022]);
      await expect(
        page.getByRole('complementary', { name: 'Feature properties' }),
      ).toBeVisible();
      await page
        .getByRole('complementary', { name: 'Feature properties' })
        .getByRole('button', { name: 'Add entrance', exact: true })
        .click();
      await clickMap(page, [x, 6.4602]);
      const inspector = page.getByRole('complementary', {
        name: 'Feature properties',
      });
      await expect(
        inspector.getByRole('button', { name: 'Draw connecting path' }),
      ).toBeVisible();
      await inspector
        .getByLabel('Name', { exact: true })
        .fill(`Library entrance ${i + 1}`);
      await inspector
        .getByRole('button', { name: 'Draw connecting path' })
        .click();
      // In 3D the ground target is behind the bottom drawing toolbar.
      // Pan it into the clear map area, as an owner would before placing it.
      if (threeD)
        await page.evaluate(() =>
          window.editorTestMap.panBy([0, 180], { duration: 0 }),
        );
      await clickMap(page, [x, 6.46]);
      await page.getByRole('button', { name: 'Finish', exact: true }).click();
      await expect(
        inspector.getByText('Path connections', { exact: true }),
      ).toBeVisible();
      await expect
        .poll(() => server.edits().filter((e) => e.kind === 'path').length)
        .toBe(i + 1);
    }
    expect(
      server
        .edits()
        .filter((e) => e.kind === 'entrance' && e.properties.connection),
    ).toHaveLength(2);
    await expect(page.locator('.editor-save-state')).toHaveText('Saved');
    const camera = await page.evaluate(() => {
      const m = window.editorTestMap;
      return [m.getCenter().lng, m.getCenter().lat, m.getZoom(), m.getPitch()];
    });
    await page
      .getByRole('button', { name: 'Compare base', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Back to draft', exact: true })
      .click();
    expect(
      await page.evaluate(() => {
        const m = window.editorTestMap;
        return [
          m.getCenter().lng,
          m.getCenter().lat,
          m.getZoom(),
          m.getPitch(),
        ];
      }),
    ).toEqual(camera);
    await page.reload();
    await attachMap(page);
    await page.getByRole('button', { name: 'Test route', exact: true }).click();
    await page.getByLabel('Test route From').selectOption('gate');
    await page.getByLabel('Test route To').selectOption('library');
    await page
      .getByRole('button', { name: 'Preview route', exact: true })
      .click();
    await expect(page.getByText(/Arrive at Library entrance 1/)).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
      .toBe(false);
    await page.screenshot({
      path: `test-results/editor-${threeD ? '3d' : '2d'}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });

test('undoes the first saved source correction and keeps its building after reload', async ({
  page,
}) => {
  await setup(page);
  await focusCampus(page);
  await page.getByRole('button', { name: 'Collapse explorer' }).click();
  await clickMap(page, [3.20012, 6.46022]);
  const name = page
    .getByRole('complementary', { name: 'Feature properties' })
    .getByLabel('Name', { exact: true });
  const original = await name.inputValue();
  const camera = await page.evaluate(() => {
    const m = window.editorTestMap;
    return [m.getCenter().lng, m.getCenter().lat, m.getZoom(), m.getPitch()];
  });
  await name.fill('Temporary label');
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  expect(
    await page.evaluate(() => {
      const m = window.editorTestMap;
      return [m.getCenter().lng, m.getCenter().lat, m.getZoom(), m.getPitch()];
    }),
  ).toEqual(camera);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  await page.reload();
  await attachMap(page);
  await focusCampus(page);
  await page.getByRole('button', { name: 'Collapse explorer' }).click();
  await clickMap(page, [3.20012, 6.46022]);
  await expect(name).toHaveValue(original);
});

test('edits a path vertex in 3D with undo and redo across autosave', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const server = await setup(page);
  await focusCampus(page);
  await page.getByRole('button', { name: 'Collapse explorer' }).click();
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
  await page.getByRole('button', { name: 'Draw path', exact: true }).click();
  await clickMap(page, [3.2006, 6.46]);
  await clickMap(page, [3.2006, 6.4601]);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  const original = structuredClone(
    server.edits().find((e) => e.kind === 'path')!.geometry,
  );
  const from = await position(page, [3.2006, 6.4601]),
    to = await position(page, [3.20065, 6.46012]);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(() =>
      JSON.stringify(server.edits().find((e) => e.kind === 'path')!.geometry),
    )
    .not.toBe(JSON.stringify(original));
  await page.keyboard.press('Control+z');
  await expect
    .poll(() => server.edits().find((e) => e.kind === 'path')!.geometry)
    .toEqual(original);
  await page.keyboard.press('Control+Shift+z');
  await expect
    .poll(() =>
      JSON.stringify(server.edits().find((e) => e.kind === 'path')!.geometry),
    )
    .not.toBe(JSON.stringify(original));
  expect(errors).toEqual([]);
});

test('renders the full campus in both appearances and keeps camera on draft updates', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page, true);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
  await page.screenshot({ path: 'test-results/full-campus-3d-light.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: 'test-results/full-campus-3d-dark.png' });
  expect(errors).toEqual([]);
});

test('recovers unfinished geometry and preserves it when switching 2D/3D', async ({
  page,
}) => {
  await setup(page);
  await focusCampus(page);
  await page.getByRole('button', { name: 'Draw path', exact: true }).click();
  await expect(page.locator('.drawing-progress')).toContainText('first point');
  await page.reload();
  await attachMap(page);
  await expect(page.getByText('Unfinished drawing recovered')).toBeVisible();
  await page.getByRole('button', { name: 'Resume drawing' }).click();
  await expect(
    page.getByRole('button', { name: 'Finish', exact: true }),
  ).toBeDisabled();
  await focusCampus(page);
  await clickMap(page, [3.2005, 6.4601]);
  await clickMap(page, [3.2006, 6.4601]);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toHaveText('Saved locally');
  await page.reload();
  await attachMap(page);
  await expect(page.getByText('Unfinished drawing recovered')).toBeVisible();
  await page.getByRole('button', { name: 'Resume drawing' }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(
    page.getByRole('complementary', { name: 'Feature properties' }),
  ).toBeVisible();
});

test('supports dark appearance and small-screen review', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await setup(page);
  await page.screenshot({ path: 'test-results/editor-dark.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('button', { name: 'Switch to 3D', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Source review' }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/editor-mobile.png' });
});

for (const phone of [false, true]) {
  test(`building references ${phone ? 'phone' : 'desktop'}: review, apply, undo and reload without moving the map`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    if (phone) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const state = await setup(page);
    await focusCampus(page);
    await page
      .getByRole('button', { name: 'Switch to 3D', exact: true })
      .click();
    await page.evaluate(() =>
      window.editorTestMap.jumpTo({ zoom: 18, pitch: 48 }),
    );
    const camera = await page.evaluate(() => [
      window.editorTestMap.getCenter().toArray(),
      window.editorTestMap.getZoom(),
      window.editorTestMap.getPitch(),
    ]);
    await page.getByRole('button', { name: 'Sources', exact: true }).click();
    await page
      .locator('summary')
      .filter({ hasText: /^Building appearances$/ })
      .click();
    await expect(
      page.getByRole('button', { name: 'Apply 1 reviewed appearances' }),
    ).toBeEnabled();
    await page
      .locator('.building-reference-item:visible')
      .filter({ hasText: 'Library' })
      .locator('summary')
      .click();
    await expect(page.locator('.reference-values')).toContainText(
      'Window spacing',
    );
    expect(state.edits()).toHaveLength(0);
    await page.screenshot({
      path: testInfo.outputPath('reference-review.png'),
    });
    await page
      .getByRole('button', { name: 'Apply 1 reviewed appearances' })
      .click();
    await expect
      .poll(
        () =>
          state.edits().find((e) => e.id === 'library')?.properties.appearance
            ?.windows,
      )
      .toBe(true);
    await expect(
      page.getByRole('button', { name: 'Apply 0 reviewed appearances' }),
    ).toBeDisabled();
    expect(
      await page.evaluate(() => [
        window.editorTestMap.getCenter().toArray(),
        window.editorTestMap.getZoom(),
        window.editorTestMap.getPitch(),
      ]),
    ).toEqual(camera);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect
      .poll(() =>
        state
          .edits()
          .some(
            (e) =>
              e.id === 'library' &&
              !e.deleted &&
              e.properties.appearance?.windows,
          ),
      )
      .toBe(false);
    await expect(
      page.getByRole('button', { name: 'Apply 1 reviewed appearances' }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect
      .poll(() =>
        state
          .edits()
          .some(
            (e) =>
              e.id === 'library' &&
              !e.deleted &&
              e.properties.appearance?.windows,
          ),
      )
      .toBe(true);
    await page.reload();
    await attachMap(page);
    await page.getByRole('button', { name: 'Sources', exact: true }).click();
    await page
      .locator('summary')
      .filter({ hasText: /^Building appearances$/ })
      .click();
    await expect(
      page.getByRole('button', { name: 'Apply 0 reviewed appearances' }),
    ).toBeDisabled();
    expect(errors).toEqual([]);
  });
}

test('building references campus batch: all eligible facades regenerate without preview errors', async ({
  page,
}, testInfo) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const state = await setup(page, true, true);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await page.evaluate(() =>
    window.editorTestMap.jumpTo({
      center: [3.201, 6.4667],
      zoom: 17.6,
      pitch: 48,
    }),
  );
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await page
    .locator('summary')
    .filter({ hasText: /^Building appearances$/ })
    .click();
  const apply = page.getByRole('button', {
    name: /^Apply \d+ reviewed appearances$/,
  });
  await expect(apply).toBeEnabled();
  const count = Number((await apply.innerText()).match(/\d+/)![0]);
  expect(count).toBeGreaterThanOrEqual(50);
  expect(state.edits()).toHaveLength(0);
  await apply.click();
  await expect.poll(() => state.edits().length, { timeout: 45000 }).toBe(count);
  expect(
    state.edits().find((e) => e.id === 'arcgis:University_Property:120')
      ?.properties.appearance?.parts?.['arcgis:University_Property:120:wing:1']
      ?.windows,
  ).toBe(false);
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await expect(page.getByText('Updating 3D preview…')).toHaveCount(0, {
    timeout: 45000,
  });
  await expect(
    page.getByRole('button', { name: 'Retry 3D preview', exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
      ),
    )
    .toContain('arcgis:University_Property:28');
  await page.screenshot({
    path: testInfo.outputPath('campus-appearances.png'),
  });
  expect(errors).toEqual([]);
});

test('building appearance: integrated view, surface inheritance, live preview, roof recovery and undo', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const state = await setup(page);
  await focusCampus(page);
  await page.getByRole('button', { name: 'Collapse explorer' }).click();
  await clickMap(page, [3.20012, 6.46022]);
  await expect(
    page.getByRole('button', { name: 'Appearance', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByText('Updating 3D preview…', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Retry 3D preview', exact: true }),
  ).toHaveCount(0);
  expect(state.edits()).toHaveLength(0);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await expect(page.locator('button.map-view-control')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Enhanced 3D', exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
      ),
    )
    .toContain('library');
  await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
  await page
    .getByLabel('Wall', { exact: true })
    .selectOption({ label: 'Outside wall 1' });
  const camera = await page.evaluate(() => ({
    center: window.editorTestMap.getCenter().toArray(),
    bearing: window.editorTestMap.getBearing(),
    pitch: window.editorTestMap.getPitch(),
    zoom: window.editorTestMap.getZoom(),
  }));
  const colour = page.getByLabel('Wall colour', { exact: true });
  await colour.fill('#cc5533');
  await colour.fill('#bb4422');
  await colour.blur();
  await expect
    .poll(
      () =>
        state.edits().find((e) => e.id === 'library')?.properties.appearance
          ?.walls?.['library:wall:0:0:0']?.wallColour,
    )
    .toBe('#bb4422');
  await expect(page.getByText('Updating 3D preview…')).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      center: window.editorTestMap.getCenter().toArray(),
      bearing: window.editorTestMap.getBearing(),
      pitch: window.editorTestMap.getPitch(),
      zoom: window.editorTestMap.getZoom(),
    })),
  ).toEqual(camera);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(colour).not.toHaveValue('#bb4422');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(colour).toHaveValue('#bb4422');
  await page
    .getByRole('button', { name: 'Use inherited value for wallColour' })
    .click();
  await expect(colour).not.toHaveValue('#bb4422');
  await page.getByRole('button', { name: 'Roof', exact: true }).click();
  await page.getByRole('button', { name: 'Create custom roof' }).click();
  await page
    .getByRole('button', { name: 'Add point with coordinates' })
    .click();
  await page.getByLabel('Point elevation (m)').fill('14');
  await page.getByLabel('Point elevation (m)').press('Enter');
  await expect
    .poll(
      () =>
        state.edits().find((e) => e.id === 'library')?.properties.appearance
          ?.roofs?.['library:wing:0']?.points[0]?.elevation,
    )
    .toBe(14);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect
    .poll(
      () =>
        state.edits().find((e) => e.id === 'library')?.properties.appearance
          ?.roofs?.['library:wing:0']?.points[0]?.elevation,
    )
    .toBe(14);
  await dialog
    .getByRole('button', { name: 'Close workspace', exact: true })
    .click();
  await page.getByRole('button', { name: 'Switch to 2D', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await page.getByRole('button', { name: 'Roof', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Edit custom roof', exact: true })
    .click();
  await expect(dialog.getByLabel('Control point')).toContainText('14 m');
  await page.screenshot({ path: 'test-results/building-roof-editor.png' });
  expect(errors).toEqual([]);
});

test('building previews survive revisiting unedited buildings without rebuilding cached models', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.previewBuilds = [];
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      message,
      ...rest: [Transferable[]?]
    ) {
      if (message?.features)
        window.previewBuilds.push(
          message.features.map(
            (f: { properties: { id: string } }) => f.properties.id,
          ),
        );
      return send.call(this, message, rest[0] || []);
    };
  });
  const state = await setup(page);
  await focusCampus(page);
  await page.getByRole('button', { name: 'Collapse explorer' }).click();
  await clickMap(page, [3.20012, 6.46022]);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  const rendered = () =>
    page.evaluate(() =>
      JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
    );
  await expect.poll(rendered).toContain('library');
  await page.getByRole('button', { name: 'Close properties' }).click();
  await expect.poll(rendered).not.toContain('library');
  await clickMap(page, [3.20068, 6.46022]);
  await expect.poll(rendered).toContain('unknown-building');
  await page.getByRole('button', { name: 'Close properties' }).click();
  await expect.poll(rendered).not.toContain('unknown-building');
  await clickMap(page, [3.20012, 6.46022]);
  await expect(
    page.getByRole('heading', { name: 'Library', exact: true }),
  ).toBeVisible();
  await expect.poll(rendered).toContain('library');
  expect(await page.evaluate(() => window.previewBuilds)).toEqual([
    ['library'],
    ['unknown-building'],
  ]);
  await page.getByLabel('Wall colour', { exact: true }).fill('#123456');
  await page.getByLabel('Wall colour', { exact: true }).blur();
  await expect
    .poll(
      () =>
        state.edits().find((e) => e.id === 'library')?.properties.appearance
          ?.wallColour,
    )
    .toBe('#123456');
  await expect(page.getByText('Updating 3D preview…')).toHaveCount(0);
  await page.getByLabel('Name', { exact: true }).fill('Renamed library');
  await page.getByLabel('Name', { exact: true }).blur();
  await expect
    .poll(() => state.edits().find((e) => e.id === 'library')?.properties.name)
    .toBe('Renamed library');
  expect(await page.evaluate(() => window.previewBuilds)).toEqual([
    ['library'],
    ['unknown-building'],
    ['library'],
  ]);
});

test('building preview survives worker timeout, crash and obsolete replies', async ({
  page,
}) => {
  test.setTimeout(100000);
  await setup(page);
  await focusCampus(page);
  await page.getByRole('button', { name: 'Collapse explorer' }).click();
  await clickMap(page, [3.20012, 6.46022]);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  const rendered = () =>
    page.evaluate(() =>
      JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
    );
  await expect.poll(rendered).toContain('library');
  const colour = page.getByLabel('Wall colour', { exact: true });
  for (const [failure, value, message] of [
    ['timeout', '#223344', '3D preview timed out.'],
    ['crash', '#334455', '3D preview stopped.'],
  ] as const) {
    await page.evaluate((failure) => {
      const send = Worker.prototype.postMessage;
      window.addEventListener(
        'restore-preview-worker',
        () => {
          Worker.prototype.postMessage = send;
        },
        { once: true },
      );
      Worker.prototype.postMessage = function (
        message,
        ...rest: [Transferable[]?]
      ) {
        if (message?.features) {
          if (failure === 'crash')
            this.dispatchEvent(
              new ErrorEvent('error', { message: 'Injected worker crash' }),
            );
          return; // Simulate a worker that cannot reply.
        }
        return send.call(this, message, rest[0] || []);
      };
    }, failure);
    await colour.fill(value);
    await expect(page.getByText(message, { exact: false })).toBeVisible({
      timeout: 25000,
    });
    await expect.poll(rendered).toContain('library');
    await page.evaluate(() =>
      window.dispatchEvent(new Event('restore-preview-worker')),
    );
    if (failure === 'crash') await colour.fill('#335577');
    else
      await page
        .getByRole('button', { name: 'Retry 3D preview', exact: true })
        .click();
    await expect(page.getByText('3D preview is outdated')).toHaveCount(0);
    await expect(page.getByText('Updating 3D preview…')).toHaveCount(0);
  }
  await page.evaluate(() => {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      message,
      ...rest: [Transferable[]?]
    ) {
      if (message?.features) {
        Worker.prototype.postMessage = send;
        // A late error for the previous edit must not replace a valid new result.
        setTimeout(
          () =>
            this.dispatchEvent(
              new MessageEvent('message', {
                data: {
                  revision: message.revision - 1,
                  results: [
                    { id: 'library', error: 'Obsolete preview failure' },
                  ],
                },
              }),
            ),
          700,
        );
      }
      return send.call(this, message, rest[0] || []);
    };
  });
  await colour.fill('#445566');
  await page.waitForTimeout(1000);
  await expect(page.getByText('Updating 3D preview…')).toHaveCount(0);
  await expect(page.getByText('3D preview is outdated')).toHaveCount(0);
  await expect.poll(rendered).toContain('library');
});

test('enhanced editing keeps models through slow frames, outline work and renderer retry', async ({
  page,
}) => {
  test.setTimeout(100000);
  await setup(page);
  await focusCampus(page);
  await page.getByRole('button', { name: 'Collapse explorer' }).click();
  await clickMap(page, [3.20012, 6.46022]);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  const rendered = () =>
    page.evaluate(() =>
      JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
    );
  await expect.poll(rendered).toContain('library');
  const camera = await page.evaluate(() => [
    window.editorTestMap.getCenter().toArray(),
    window.editorTestMap.getZoom(),
    window.editorTestMap.getPitch(),
    window.editorTestMap.getBearing(),
  ]);
  // Exercise the actual renderer with 32 consecutive 70 ms frame intervals.
  // Only the timing/movement observation is controlled, not WebGL or meshes.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const map = window.editorTestMap;
        const layer = (
          map.getLayer('campus-models') as unknown as {
            implementation: import('maplibre-gl').CustomLayerInterface;
          }
        ).implementation;
        const render = layer.render;
        let frame = 0,
          clock = performance.now();
        layer.render = function (gl, args) {
          const now = performance.now,
            moving = map.isMoving;
          clock += 70;
          performance.now = () => clock;
          map.isMoving = () => true;
          try {
            render.call(this, gl, args);
          } finally {
            performance.now = now;
            map.isMoving = moving;
          }
          if (++frame < 32) map.triggerRepaint();
          else {
            layer.render = render;
            resolve();
          }
        };
        map.triggerRepaint();
      }),
  );
  await expect(
    page.getByText('Detail reduced for smoother movement'),
  ).toBeVisible();
  await expect.poll(rendered).toContain('library');
  await page.getByRole('button', { name: 'Outline', exact: true }).click();
  await expect.poll(rendered).not.toContain('library');
  await expect(
    page.getByText('Enhanced models paused for map editing'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect.poll(rendered).toContain('library');
  await page.getByLabel('Wall colour', { exact: true }).fill('#996633');
  await expect(page.getByText('Updating 3D preview…')).toHaveCount(0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const map = window.editorTestMap;
        const layer = (
          map.getLayer('campus-models') as unknown as {
            implementation: import('maplibre-gl').CustomLayerInterface;
          }
        ).implementation;
        const render = layer.render;
        layer.render = function (gl, args) {
          layer.render = render;
          const draw = gl.drawElements;
          gl.drawElements = () => {
            throw new Error('Injected enhanced render failure');
          };
          try {
            render.call(this, gl, args);
          } finally {
            gl.drawElements = draw;
            resolve();
          }
        };
        map.triggerRepaint();
      }),
  );
  await expect(
    page.getByText('Enhanced 3D is unavailable', { exact: true }),
  ).toBeVisible();
  await expect.poll(rendered).not.toContain('library');
  await page
    .getByRole('button', { name: 'Retry enhanced 3D', exact: true })
    .click();
  await expect.poll(rendered).toContain('library');
  await expect(
    page.getByText('Enhanced 3D is unavailable', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Detail reduced for smoother movement'),
  ).toHaveCount(0);
  await expect(page.getByLabel('Wall colour', { exact: true })).toHaveValue(
    '#996633',
  );
  expect(
    await page.evaluate(() => [
      window.editorTestMap.getCenter().toArray(),
      window.editorTestMap.getZoom(),
      window.editorTestMap.getPitch(),
      window.editorTestMap.getBearing(),
    ]),
  ).toEqual(camera);
  await page.screenshot({
    path: 'test-results/building-renderer-recovery.png',
  });
});

test.describe('building roof touch editing', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('building appearance phone: ridge drawing, invalid elevations and opacity', async ({
    page,
  }) => {
    test.setTimeout(150000);
    const state = await setup(page);
    await focusCampus(page);
    const collapse = page.getByRole('button', { name: 'Collapse explorer' });
    if (await collapse.isVisible()) await collapse.click();
    await clickMap(page, [3.20012, 6.46022]);
    await page
      .getByRole('button', { name: 'Switch to 3D', exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
        ),
      )
      .toContain('library');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Building opacity', { exact: true }).fill('0.25');
    await page
      .getByRole('button', { name: 'Close settings', exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
        ),
      )
      .toContain('library');
    await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
    await page.getByRole('button', { name: 'Roof', exact: true }).click();
    await page.getByRole('button', { name: 'Create custom roof' }).click();
    await page.getByRole('button', { name: 'Draw ridge', exact: true }).click();
    const plan = page.getByLabel('Roof plan drawing', { exact: true });
    for (const [x, y] of [
      [140, 150],
      [140, 240],
    ]) {
      await plan.scrollIntoViewIfNeeded();
      const box = (await plan.boundingBox())!;
      await page.touchscreen.tap(
        box.x + (x / 300) * box.width,
        box.y + (y / 300) * box.height,
      );
    }
    await expect(
      page.getByRole('button', { name: 'Remove ridge 1' }),
    ).toBeVisible();
    await page.getByLabel('Point elevation (m)').fill('50');
    await page.getByLabel('Point elevation (m)').press('Enter');
    await expect(page.getByLabel('Point elevation (m)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await page.getByLabel('Point elevation (m)').fill('14.5');
    await page.getByLabel('Point elevation (m)').press('Enter');
    await expect(page.getByLabel('Point elevation (m)')).toHaveAttribute(
      'aria-invalid',
      'false',
    );
    await expect
      .poll(
        () =>
          state.edits().find((e) => e.id === 'library')?.properties.appearance
            ?.roofs?.['library:wing:0']?.lines.length,
      )
      .toBe(1);
    await page
      .getByLabel('Roof surface', { exact: true })
      .selectOption({ index: 1 });
    await page
      .getByRole('button', { name: 'Done editing roof', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Edit custom roof', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: 'test-results/building-phone-roof.png' });
  });
});

test('prepared building editor reopens saved appearance and unfinished roofs offline', async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    !testInfo.config.configFile?.includes('pwa.config'),
    'Requires production service worker.',
  );
  test.setTimeout(120000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await setup(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // The browser's network hint can be false despite a reachable backend.
  // Preparation verifies requests and assets instead of trusting that hint.
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    }),
  );
  await page.getByRole('button', { name: 'Survey', exact: true }).click();
  await page
    .getByRole('button', { name: 'Prepare for offline survey', exact: true })
    .click();
  await expect(page.getByText(/Ready for offline surveying/)).toBeVisible();
  await page.evaluate(() => Reflect.deleteProperty(navigator, 'onLine'));
  await page.getByRole('button', { name: 'Close survey', exact: true }).click();
  await focusCampus(page);
  await page.getByRole('button', { name: 'Collapse explorer' }).click();
  await clickMap(page, [3.20012, 6.46022]);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
  await page
    .getByLabel('Wall', { exact: true })
    .selectOption({ label: 'Outside wall 1' });
  await page.getByLabel('Wall colour', { exact: true }).fill('#884422');
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Roof', exact: true }).click();
  await page.getByRole('button', { name: 'Create custom roof' }).click();
  await page
    .getByRole('button', { name: 'Add point with coordinates' })
    .click();
  await page.getByLabel('Point elevation (m)').fill('14');
  await page.getByLabel('Point elevation (m)').press('Enter');
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  await page.getByLabel('Eaves elevation (m)').fill('');
  await expect(page.getByRole('dialog').locator('header output')).toContainText(
    'Unsaved input',
  );
  await context.setOffline(true);
  await page.reload();
  await attachMap(page);
  await focusCampus(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
      ),
    )
    .toContain('library');
  const downloadPromise = page.waitForEvent('download');
  await page
    .locator('.editor-offline')
    .getByRole('button', { name: 'Download local recovery' })
    .click();
  const download = await downloadPromise;
  const recovery = JSON.parse(
    readFileSync((await download.path())!, 'utf8'),
  ).workspace;
  expect(recovery.modelInputs.library['roof:library:wing:0:eaves']).toBe('');
  expect(
    recovery.edits.find((e: MapEdit) => e.id === 'library').properties
      .appearance.roofs['library:wing:0'].points[0].elevation,
  ).toBe(14);
  expect(
    recovery.edits.find((e: MapEdit) => e.id === 'library').properties
      .appearance.walls['library:wall:0:0:0'].wallColour,
  ).toBe('#884422');
  const collapse = page.getByRole('button', { name: 'Collapse explorer' });
  if (await collapse.isVisible()) await collapse.click();
  await clickMap(page, [3.20012, 6.46022]);
  await page.getByRole('button', { name: 'Roof', exact: true }).click();
  await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
  await page
    .getByRole('button', { name: 'Edit custom roof', exact: true })
    .click();
  await expect(page.getByLabel('Eaves elevation (m)')).toHaveValue('');
  await page.getByLabel('Eaves elevation (m)').fill('8');
  await page.getByLabel('Eaves elevation (m)').press('Enter');
  await page
    .getByRole('button', { name: 'Done editing roof', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Close workspace', exact: true })
    .click();
  await page.reload();
  await attachMap(page);
  await focusCampus(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
      ),
    )
    .toContain('library');
  const secondPromise = page.waitForEvent('download');
  await page
    .locator('.editor-offline')
    .getByRole('button', { name: 'Download local recovery' })
    .click();
  const second = await secondPromise;
  const saved = JSON.parse(
    readFileSync((await second.path())!, 'utf8'),
  ).workspace;
  expect(saved.roofDraft).toBeNull();
  expect(
    saved.modelInputs.library['roof:library:wing:0:eaves'],
  ).toBeUndefined();
  expect(
    saved.edits.find((e: MapEdit) => e.id === 'library').properties.appearance
      .roofs['library:wing:0'].points[0].elevation,
  ).toBe(14);
});

test('public cards: compact start, drag sizing, remembered heights and keyboard limits', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto('/');
  await attachMap(page);
  const panel = page.locator('.explore-panel');
  const handle = page.getByRole('slider', { name: 'Resize search panel' });
  await expect(handle).toHaveAttribute('aria-valuenow', '96');
  await expect(
    page.getByRole('button', { name: 'Settings', exact: true }),
  ).toBeHidden();
  expect((await panel.boundingBox())!.y).toBeGreaterThan(700);
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    grip.x + grip.width / 2,
    grip.y + grip.height / 2 - 300,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '396');
  await expect(
    page.getByRole('button', { name: 'Settings', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Collapse card' }).click();
  await page.reload();
  await attachMap(page);
  await expect(handle).toHaveAttribute('aria-valuenow', '96');
  await page.getByRole('button', { name: 'Expand card' }).click();
  await expect(handle).toHaveAttribute('aria-valuenow', '396');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialogHandle = page.getByRole('slider', { name: 'Resize dialog' });
  await dialogHandle.press('Home');
  await expect(dialogHandle).toHaveAttribute('aria-valuenow', '220');
  await expect(
    page.getByRole('button', { name: 'Close', exact: true }),
  ).toBeVisible();
  await dialogHandle.press('ArrowUp');
  await expect(dialogHandle).toHaveAttribute('aria-valuenow', '252');
  await dialogHandle.press('End');
  await expect(dialogHandle).toHaveAttribute('aria-valuenow', '743');
  const dialog = (await page.getByRole('dialog').boundingBox())!;
  expect(dialog.y).toBeGreaterThan(80);
  expect(dialog.y + dialog.height).toBeLessThanOrEqual(844);
  await dialogHandle.press('Home');
  await dialogHandle.press('ArrowUp');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await attachMap(page);
  await page.getByRole('button', { name: 'Expand card' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(dialogHandle).toHaveAttribute('aria-valuenow', '252');
});

test('view settings: single button, keyboard switching and shared preferences', async ({
  page,
}) => {
  test.setTimeout(90000);
  await setup(page);
  await page.goto('/');
  await attachMap(page);
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  const toggle = page.locator('button.map-view-control');
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAccessibleName('Switch to 2D');
  await expect(toggle).toHaveText('2D');
  await expect(page.locator('.map-rendering-options')).toHaveCount(0);
  await toggle.press('Enter');
  await expect(toggle).toHaveAccessibleName('Switch to 3D');
  await expect(toggle).toHaveText('3D');
  await toggle.press('Space');
  await expect(toggle).toHaveAccessibleName('Switch to 2D');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'Enhanced', exact: true }),
  ).toBeChecked();
  await page.getByRole('radio', { name: 'Simple', exact: true }).check();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await page.reload();
  await attachMap(page);
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'Simple', exact: true }),
  ).toBeChecked();
  await page.goto('/admin');
  await attachMap(page);
  await expect(toggle).toHaveAccessibleName('Switch to 3D');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'Simple', exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel('Map tilt', { exact: true })).toBeDisabled();
  await page.getByRole('radio', { name: 'Enhanced', exact: true }).check();
  await page
    .getByRole('button', { name: 'Close settings', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Settings', exact: true }),
  ).toBeFocused();
  await page.goto('/');
  await attachMap(page);
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'Enhanced', exact: true }),
  ).toBeChecked();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage blocked', 'SecurityError');
    };
  });
  await page.getByRole('radio', { name: 'Simple', exact: true }).check();
  await expect(
    page.getByRole('radio', { name: 'Simple', exact: true }),
  ).toBeChecked();
  await page.screenshot({ path: 'test-results/view-settings-public.png' });
});

test('view settings: preserves the map, roof selection and unfinished drawing', async ({
  page,
}) => {
  test.setTimeout(120000);
  const state = await setup(page);
  await focusCampus(page);
  await page.getByRole('button', { name: 'Collapse explorer' }).click();
  await clickMap(page, [3.20012, 6.46022]);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
  await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
  await page.getByRole('button', { name: 'Roof', exact: true }).click();
  await page.getByRole('button', { name: 'Create custom roof' }).click();
  await page
    .getByRole('button', { name: 'Add point with coordinates' })
    .click();
  await page.getByLabel('Point elevation (m)').fill('14');
  await page.getByRole('button', { name: 'Draw ridge', exact: true }).click();
  const selectedPoint = await page.getByLabel('Control point').inputValue();
  const camera = await page.evaluate(() => ({
    center: window.editorTestMap.getCenter().toArray(),
    bearing: window.editorTestMap.getBearing(),
    pitch: window.editorTestMap.getPitch(),
    zoom: window.editorTestMap.getZoom(),
  }));
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Point elevation (m)')).toBeHidden();
  for (const appearance of ['Light', 'Dark'] as const) {
    const option = page.getByRole('radio', { name: appearance, exact: true });
    await option.focus();
    await option.press('Space');
    await expect(option).toBeChecked();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.editorTestMap.getPaintProperty(
            'background',
            'background-color',
          ),
        ),
      )
      .toBe(appearance === 'Dark' ? '#293e52' : '#eee9dc');
  }
  await expect(page.getByLabel('Map tilt', { exact: true })).toHaveValue(
    String(camera.pitch),
  );
  await page.getByRole('radio', { name: 'Simple', exact: true }).check();
  await page.getByRole('radio', { name: 'Enhanced', exact: true }).check();
  await page.getByLabel('Building opacity', { exact: true }).fill('0.35');
  await page
    .getByRole('button', { name: 'Close settings', exact: true })
    .click();
  await expect(page.getByLabel('Control point')).toHaveValue(selectedPoint);
  await expect(page.getByLabel('Point elevation (m)')).toHaveValue('14');
  await expect(
    page.getByRole('button', { name: 'Draw ridge', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(() => ({
      center: window.editorTestMap.getCenter().toArray(),
      bearing: window.editorTestMap.getBearing(),
      pitch: window.editorTestMap.getPitch(),
      zoom: window.editorTestMap.getZoom(),
    })),
  ).toEqual(camera);
  expect(
    await page.evaluate(
      () =>
        window.editorTestMap.getCanvas() ===
        document.querySelector('.maplibregl-canvas'),
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByLabel('Building opacity', { exact: true }),
  ).toHaveValue('0.35');
  await page.getByLabel('Map tilt', { exact: true }).fill('36');
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
    .toBe(36);
  await page.evaluate(() => window.editorTestMap.setPitch(43));
  await expect(page.getByLabel('Map tilt', { exact: true })).toHaveValue('43');
  await page.screenshot({ path: 'test-results/view-settings-editor.png' });
  await page
    .getByRole('button', { name: 'Close settings', exact: true })
    .click();
  await page.getByRole('button', { name: 'Cancel roof', exact: true }).click();
  await page.getByRole('button', { name: 'Close properties' }).click();
  await page.getByRole('button', { name: 'Switch to 2D', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
  await page.getByRole('button', { name: 'Draw path', exact: true }).click();
  await clickMap(page, [3.2005, 6.4601]);
  await clickMap(page, [3.2006, 6.4601]);
  await expect(page.locator('.drawing-progress')).toContainText(
    '2 points placed',
  );
  const progress = await page.locator('.drawing-progress').innerText();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Device', exact: true }).check();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTestMap.getPaintProperty('background', 'background-color'),
      ),
    )
    .toBe('#eee9dc');
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect(page.getByLabel('Map tilt', { exact: true })).toBeDisabled();
  await page
    .getByRole('button', { name: 'Close settings', exact: true })
    .click();
  await expect(page.locator('.drawing-progress')).toHaveText(progress);
  await expect(
    page.getByRole('button', { name: 'Finish', exact: true }),
  ).toBeEnabled();
  expect(state.edits()).toHaveLength(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.reload();
  await attachMap(page);
  await page.getByRole('button', { name: 'Resume drawing' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTestMap.getPaintProperty('background', 'background-color'),
      ),
    )
    .toBe('#293e52');
  await expect(
    page.getByRole('button', { name: 'Finish', exact: true }),
  ).toBeEnabled();
});

test.describe('view settings touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('view settings phone: single tap toggle and accessible editor settings', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await setup(page);
    const toggle = page.locator('button.map-view-control');
    await expect(toggle).toHaveCount(1);
    await toggle.tap();
    await expect(toggle).toHaveAccessibleName('Switch to 2D');
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    await expect(
      page.getByRole('complementary', { name: 'Editor settings' }),
    ).toBeVisible();
    const settingsCard = await page
      .getByRole('complementary', { name: 'Editor settings' })
      .boundingBox();
    expect(settingsCard!.height).toBeLessThanOrEqual(844 * 0.43);
    expect(settingsCard!.y).toBeGreaterThan(844 * 0.4);
    const header = await page.evaluate(() => ({
      brandRight: document
        .querySelector('.editor-brand strong')!
        .getBoundingClientRect().right,
      navigationLeft: document
        .querySelector('.editor-navigation')!
        .getBoundingClientRect().left,
    }));
    expect(header.brandRight).toBeLessThanOrEqual(header.navigationLeft);
    // Tap the visible label: the semantic radio is visually hidden.
    const appearance = page
      .locator('.appearance-options label')
      .filter({ hasText: 'Dark' });
    await appearance.tap();
    await expect(
      page.getByRole('radio', { name: 'Dark', exact: true }),
    ).toBeChecked();
    const target = await appearance.boundingBox();
    expect(target!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('radio', { name: 'Simple', exact: true }).tap();
    await expect(
      page.getByRole('radio', { name: 'Simple', exact: true }),
    ).toBeChecked();
    await page.getByLabel('Building opacity', { exact: true }).fill('0.4');
    await page.screenshot({
      path: 'test-results/view-settings-editor-phone.png',
    });
    await page
      .getByRole('button', { name: 'Close settings', exact: true })
      .tap();
    await toggle.tap();
    await expect(toggle).toHaveAccessibleName('Switch to 3D');
    await page.goto('/');
    await attachMap(page);
    await page
      .getByRole('button', { name: 'Expand card', exact: true })
      .click();
    await expect(toggle).toHaveAccessibleName('Switch to 2D');
    await toggle.tap();
    await expect(toggle).toHaveAccessibleName('Switch to 3D');
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    await expect(
      page.getByRole('radio', { name: 'Dark', exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole('radio', { name: 'Simple', exact: true }),
    ).toBeChecked();
    await page.getByRole('radio', { name: 'Enhanced', exact: true }).tap();
    const dialogCard = await page.getByRole('dialog').boundingBox();
    expect(dialogCard!.height).toBeLessThanOrEqual(844 * 0.57);
    expect(dialogCard!.y).toBeGreaterThan(844 * 0.4);
    await page.screenshot({ path: 'test-results/compact-mobile-dialog.png' });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close', exact: true })
      .tap();
    await page.screenshot({
      path: 'test-results/view-toggle-public-phone.png',
    });
    await expect(page.locator('.map-rendering-options')).toHaveCount(0);
  });
});

for (const variant of ['dark desktop', 'light desktop', 'dark phone']) {
  test(`readable interface ${variant}: tips, public dialogs and editor panels`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    if (variant.includes('phone'))
      await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({
      colorScheme: variant.startsWith('dark') ? 'dark' : 'light',
      reducedMotion: 'reduce',
    });
    await setup(page);
    await expect(page.locator('html')).toHaveAttribute(
      'style',
      new RegExp(
        `color-scheme: ${variant.startsWith('dark') ? 'dark' : 'light'}`,
      ),
    );
    const failures: Record<string, string[]> = {};
    const audit = async (name: string) => {
      failures[name] = await contrastFailures(page);
    };
    await audit('editor workspace');
    await page
      .getByRole('button', { name: 'Switch to 3D', exact: true })
      .click();
    await page.getByRole('button', { name: 'Draw path', exact: true }).click();
    await expect(page.locator('.map-detail-status')).toHaveText(
      'Enhanced models paused for map editing',
    );
    await audit('editing tips');
    await page.screenshot({ path: testInfo.outputPath('editing-tips.png') });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    for (const section of [
      'Settings',
      'Sources',
      'Duplicates',
      'Reports',
      'Releases',
    ]) {
      await page.getByRole('button', { name: section, exact: true }).click();
      await audit(`editor ${section}`);
    }
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await focusCampus(page);
    if (
      await page.getByRole('button', { name: 'Collapse explorer' }).isVisible()
    )
      await page.getByRole('button', { name: 'Collapse explorer' }).click();
    await clickMap(page, [3.20012, 6.46022]);
    await expect(
      page.getByRole('button', { name: 'Appearance', exact: true }),
    ).toBeVisible();
    await audit('building inspector');
    await page.getByRole('button', { name: 'Roof', exact: true }).click();
    await audit('roof inspector');
    await page.getByRole('button', { name: 'Survey', exact: true }).click();
    await expect(page.locator('.survey-sheet')).toBeVisible();
    await audit('survey');
    await page.goto('/');
    await attachMap(page);
    await page
      .getByRole('button', { name: 'Expand card', exact: true })
      .click();
    await audit('public places');
    await page.getByRole('textbox', { name: 'Search campus' }).fill('Library');
    await page
      .getByRole('button', { name: /Library/ })
      .first()
      .click();
    await page.getByRole('heading', { name: 'Library', exact: true }).waitFor();
    await audit('place details');
    await page.getByRole('button', { name: 'Copy link', exact: true }).click();
    await expect(page.locator('.toast')).toBeVisible();
    await audit('toast');
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await page.getByRole('button', { name: 'Directions', exact: true }).click();
    await page.getByLabel('Starting place').selectOption('gate');
    await expect(
      page.getByRole('button', { name: 'Start walking', exact: true }),
    ).toBeVisible();
    await audit('route details');
    for (const section of ['Settings', 'Offline']) {
      await page.getByRole('button', { name: section, exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await audit(`public ${section}`);
      await page.screenshot({ path: testInfo.outputPath(`${section}.png`) });
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    expect(
      Object.fromEntries(
        Object.entries(failures).filter(([, list]) => list.length),
      ),
    ).toEqual({});
  });
}

for (const phone of [false, true]) {
  test(`roof batch ${phone ? 'phone' : 'desktop'}: review, save, undo and reload`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    if (phone) await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const state = await setup(page);
    await focusCampus(page);
    await page
      .getByRole('button', { name: 'Switch to 3D', exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
      .toBe(false);
    const camera = await page.evaluate(() => [
      window.editorTestMap.getCenter().toArray(),
      window.editorTestMap.getZoom(),
      window.editorTestMap.getPitch(),
    ]);
    await page.getByRole('button', { name: 'Sources', exact: true }).click();
    await page
      .locator('summary')
      .filter({ hasText: /^Building roofs$/ })
      .click();
    const apply = page.getByRole('button', {
      name: 'Apply 1 reviewed roofs',
      exact: true,
    });
    await expect(apply).toBeEnabled();
    await page
      .locator('.building-roof-item')
      .filter({ hasText: 'Library' })
      .locator('summary')
      .click();
    await expect(
      page.getByRole('img', {
        name: 'Proposed roof ridges within the unchanged wing outline',
      }),
    ).toBeVisible();
    expect(state.edits()).toHaveLength(0);
    expect(await contrastFailures(page)).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('roof-batch-review.png'),
    });
    await apply.click();
    const savedRoof = () =>
      state.edits().find((e) => e.id === 'library' && !e.deleted)?.properties
        .appearance?.roofs?.['library:wing:0'];
    await expect.poll(() => savedRoof()?.points.length).toBeGreaterThan(0);
    const saved = structuredClone(savedRoof());
    expect(saved?.provenance).toContain('illustrative');
    expect(
      await page.evaluate(() => [
        window.editorTestMap.getCenter().toArray(),
        window.editorTestMap.getZoom(),
        window.editorTestMap.getPitch(),
      ]),
    ).toEqual(camera);
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await expect(page.getByText('Updating 3D preview…')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Retry 3D preview', exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
        ),
      )
      .toContain('library');
    await page.screenshot({
      path: testInfo.outputPath('pitched-roof-model.png'),
    });
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(savedRoof).toBeUndefined();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect.poll(savedRoof).toEqual(saved);
    await page.reload();
    await attachMap(page);
    await expect(page.locator('.editor-save-state')).toHaveText('Saved');
    expect(savedRoof()).toEqual(saved);
    expect(errors).toEqual([]);
  });
}
test('roof proposal draft survives settings, view changes and recovery before apply', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ colorScheme: 'dark' });
  const state = await setup(page);
  await focusCampus(page);
  await page.getByRole('button', { name: 'Collapse explorer' }).click();
  await clickMap(page, [3.20012, 6.46022]);
  await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
  await page.getByRole('button', { name: 'Roof', exact: true }).click();
  await page
    .getByRole('button', { name: 'Preview approximate hip roof' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Apply roof', exact: true }),
  ).toBeEnabled();
  expect(state.edits()).toHaveLength(0);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Apply roof', exact: true }),
  ).toBeEnabled();
  await page.reload();
  await attachMap(page);
  await page.getByRole('button', { name: 'Resume roof', exact: true }).click();
  await expect(page.getByText(/Approximate hip roof derived/)).toBeVisible();
  await page.getByRole('button', { name: 'Apply roof', exact: true }).click();
  await expect
    .poll(
      () =>
        state.edits().find((e) => e.id === 'library')?.properties.appearance
          ?.roofs?.['library:wing:0']?.points.length,
    )
    .toBeGreaterThan(0);
});
test('roof campus batch: complex roof plans generate without fallback or camera jumps', async ({
  page,
}, testInfo) => {
  test.setTimeout(150000);
  await page.emulateMedia({ colorScheme: 'dark' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const state = await setup(page, true, true);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
  await page.evaluate(() =>
    window.editorTestMap.jumpTo({
      center: [3.1980018, 6.4742127],
      zoom: 18.2,
      pitch: 55,
      bearing: 15,
    }),
  );
  const camera = await page.evaluate(() => [
    window.editorTestMap.getCenter().toArray(),
    window.editorTestMap.getZoom(),
    window.editorTestMap.getPitch(),
  ]);
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await page
    .locator('summary')
    .filter({ hasText: /^Building roofs$/ })
    .click();
  const apply = page.getByRole('button', {
    name: /^Apply \d+ reviewed roofs$/,
  });
  await expect(apply).toBeEnabled();
  const count = Number((await apply.innerText()).match(/\d+/)![0]);
  expect(count).toBeGreaterThanOrEqual(35);
  expect(state.edits()).toHaveLength(0);
  await apply.click();
  await expect.poll(() => state.edits().length, { timeout: 45000 }).toBe(count);
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await expect(page.getByText('Updating 3D preview…')).toHaveCount(0, {
    timeout: 45000,
  });
  await expect(
    page.getByRole('button', { name: 'Retry 3D preview', exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => [
      window.editorTestMap.getCenter().toArray(),
      window.editorTestMap.getZoom(),
      window.editorTestMap.getPitch(),
    ]),
  ).toEqual(camera);
  await page.screenshot({
    path: testInfo.outputPath('campus-pitched-roofs.png'),
  });
  expect(errors).toEqual([]);
});

test('slate map badges select places and street labels omit generic names', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const state = await setup(page, false, false, {
    mutateCampus(data) {
      data.map.features[0].properties!.name = 'LAW road';
      data.map.features.push({
        ...structuredClone(data.map.features[0]),
        properties: {
          ...data.map.features[0].properties,
          id: 'unnamed-path',
          name: 'Campus path',
        },
      });
    },
  });
  await page.goto('/');
  await attachMap(page);
  await focusCampus(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTestMap
          .queryRenderedFeatures({ layers: ['street-labels'] })
          .map((f) => f.properties?.streetLabel),
      ),
    )
    .toContain('LAW road');
  expect(
    await page.evaluate(() =>
      window.editorTestMap
        .queryRenderedFeatures({ layers: ['street-labels'] })
        .some((f) => f.properties?.streetLabel === 'Campus path'),
    ),
  ).toBe(false);
  const point = state.campus.places[0].coordinates;
  await expect
    .poll(() =>
      page.evaluate(
        (point) =>
          window.editorTestMap
            .queryRenderedFeatures(window.editorTestMap.project(point), {
              layers: ['places-label'],
            })
            .map((f) => f.properties?.id),
        point,
      ),
    )
    .toContain(state.campus.places[0].id);
  await clickMap(page, point);
  await expect(
    page.getByRole('button', { name: 'Directions', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTestMap.getFilter('places-label-selected'),
      ),
    )
    .toEqual(['==', ['get', 'id'], state.campus.places[0].id]);
  await page.screenshot({
    path: testInfo.outputPath('selected-badge-and-street.png'),
  });
  expect(state.edits()).toHaveLength(0);
});

for (const editor of [false, true])
  for (const phone of [false, true]) {
    test(`slate map ${editor ? 'editor' : 'public'} ${phone ? 'phone' : 'desktop'}: scales, renderers and theme continuity`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(210000);
      if (phone) await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'dark' });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (
          m.type() === 'error' &&
          /Campus map:|layers\.|Cannot|Error/.test(m.text())
        )
          errors.push(m.text());
      });
      const state = await setup(page, true, true);
      if (!editor) {
        await page.goto('/');
        await attachMap(page);
      } else {
        await page.getByRole('button', { name: 'Collapse explorer' }).click();
        await page
          .getByRole('button', { name: 'Switch to 3D', exact: true })
          .click();
      }
      const toggle = page.locator('.map-view-control');
      await expect(toggle).toHaveCount(1);
      await expect(page.locator('.map-rendering-options')).toHaveCount(0);
      await page.evaluate(() => {
        (window as unknown as { slateCanvas: HTMLCanvasElement }).slateCanvas =
          window.editorTestMap.getCanvas();
      });
      const paint = (layer: string, property: string) =>
        page.evaluate(
          ({ layer, property }) =>
            window.editorTestMap.getPaintProperty(
              layer,
              property as Parameters<MapInstance['getPaintProperty']>[1],
            ),
          { layer, property },
        );
      await expect
        .poll(() => paint('background', 'background-color'))
        .toBe('#293e52');
      expect(
        await page.evaluate(() =>
          window.editorTestMap.hasImage('place-library'),
        ),
      ).toBe(true);
      const sources = await page.evaluate(() =>
        (
          window.editorTestMap.getSource(
            'campus',
          ) as import('maplibre-gl').GeoJSONSource
        ).getData(),
      );
      expect(
        (sources as import('geojson').FeatureCollection).features.some(
          (f) => f.properties?.landClass === 'water',
        ),
      ).toBe(true);
      for (const mode of ['enhanced', 'simple', '2d']) {
        if (mode === 'simple') {
          if (!editor)
            await page
              .getByRole('button', { name: 'Expand card', exact: true })
              .click();
          await page
            .getByRole('button', { name: 'Settings', exact: true })
            .click();
          await page
            .getByRole('radio', { name: 'Simple', exact: true })
            .check();
          await page
            .getByRole('button', {
              name: editor ? 'Close settings' : 'Close',
              exact: true,
            })
            .click();
        }
        if (mode === '2d') await toggle.press('Enter');
        for (const [name, zoom, latitude] of [
          ['campus', 15.2, 6.466],
          ['neighbourhood', 17, 6.471],
          ['building', 19, 6.47109],
        ] as const) {
          await expect
            .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
            .toBe(false);
          await page.evaluate(
            ({ zoom, latitude, phone, mode }) =>
              window.editorTestMap.jumpTo({
                center: [3.19978, latitude],
                zoom,
                bearing: -12,
                pitch: mode === '2d' ? 0 : 50,
                padding: { top: 0, left: 0, right: 0, bottom: phone ? 270 : 0 },
              }),
            { zoom, latitude, phone, mode },
          );
          await expect
            .poll(() => page.evaluate(() => window.editorTestMap.loaded()))
            .toBe(true);
          if (mode === 'enhanced' && zoom === 19) {
            await expect
              .poll(() =>
                page.evaluate(() =>
                  JSON.stringify(
                    window.editorTestMap.getFilter('buildings-3d'),
                  ),
                ),
              )
              .toContain('arcgis');
          }
          await page.screenshot({
            path: testInfo.outputPath(`${mode}-${name}.png`),
          });
        }
      }
      const camera = await page.evaluate(() => [
        window.editorTestMap.getCenter().toArray(),
        window.editorTestMap.getZoom(),
        window.editorTestMap.getPitch(),
        window.editorTestMap.getBearing(),
      ]);
      await page.emulateMedia({ colorScheme: 'light' });
      await expect
        .poll(() => paint('background', 'background-color'))
        .toBe('#eee9dc');
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect
        .poll(() => paint('background', 'background-color'))
        .toBe('#293e52');
      expect(
        await page.evaluate(() => [
          window.editorTestMap.getCenter().toArray(),
          window.editorTestMap.getZoom(),
          window.editorTestMap.getPitch(),
          window.editorTestMap.getBearing(),
        ]),
      ).toEqual(camera);
      expect(
        await page.evaluate(
          () =>
            window.editorTestMap.getCanvas() ===
            (window as unknown as { slateCanvas: HTMLCanvasElement })
              .slateCanvas,
        ),
      ).toBe(true);
      for (const button of await page
        .locator(
          editor
            ? '.editor-view-controls > button:visible'
            : '.map-controls button:visible',
        )
        .all()) {
        const box = await button.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      expect(state.edits()).toHaveLength(0);
      expect(errors).toEqual([]);
    });
  }

test('documentation current gallery: published campus and isolated owner workflow', async ({
  page,
}, info) => {
  test.skip(
    !info.config.configFile?.includes('docs.config'),
    'Explicit production documentation project only.',
  );
  const manifest = JSON.parse(
    readFileSync(
      new URL(
        '../../work/model-benchmark/public/packages/latest.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as CampusPackage;
  const data = JSON.parse(
    readFileSync(
      new URL(
        `../../work/model-benchmark/public${manifest.dataUrl}`,
        import.meta.url,
      ),
      'utf8',
    ),
  ) as CampusData;
  for (const a of manifest.assets)
    await page.context().route(`**${a.url}`, (r) =>
      r.fulfill({
        body: readFileSync(
          new URL(`../../work/model-benchmark/public${a.url}`, import.meta.url),
        ),
        contentType: a.url.endsWith('.webp')
          ? 'image/webp'
          : a.url.endsWith('.json')
            ? 'application/json'
            : 'application/octet-stream',
      }),
    );
  const shot = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
      .toBe(false);
    await page.screenshot({
      path: `../docs/assets/screenshots/${name}-2026-09-25.png`,
    });
  };
  await page.emulateMedia({ colorScheme: 'dark' });
  await setup(page, false, false, { snapshot: { data, manifest } });
  if (!process.env.TURNRIGHT_DOCS_ROUTES_ONLY) {
    const three = page.getByRole('button', {
      name: 'Switch to 3D',
      exact: true,
    });
    if (await three.isVisible()) await three.click();
    await page.evaluate(() =>
      window.editorTestMap.jumpTo({
        center: [3.1998, 6.471],
        zoom: 17.3,
        pitch: 45,
      }),
    );
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.areTilesLoaded()))
      .toBe(true);
    await shot('editor-workspace-current');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByLabel('Search map features').fill('Senate');
    await page
      .locator('.editor-feature-list button')
      .filter({
        has: page.locator('.editor-feature-icon.building'),
        hasText: 'Senate',
      })
      .first()
      .click();
    await page.getByRole('button', { name: 'Collapse explorer' }).click();
    await shot('editor-building-current');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot('editor-building-mobile-current');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await shot('editor-settings-mobile-current');
    await page
      .getByRole('button', { name: 'Close settings', exact: true })
      .click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: /Manage photos/ }).click();
    await expect(page.getByRole('heading', { name: /Photos ·/ })).toBeVisible();
    await shot('editor-photos-current');
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', { name: 'Photo & model', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Roof', exact: true }).click();
    await dialog
      .getByLabel('Building or wing', { exact: true })
      .selectOption({ label: 'Wing 1' });
    const editRoof = dialog.getByRole('button', {
      name: 'Edit custom roof',
      exact: true,
    });
    if (await editRoof.isVisible()) await editRoof.click();
    await shot('editor-roof-current');
    const doneRoof = dialog.getByRole('button', {
      name: 'Done editing roof',
      exact: true,
    });
    if (await doneRoof.isVisible()) await doneRoof.click();
    await dialog.getByRole('button', { name: 'Outline', exact: true }).click();
    await shot('editor-outline-current');
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog.getByLabel('Model editing mode').selectOption('details');
    await dialog
      .getByRole('button', { name: 'Choose wall', exact: true })
      .click();
    if (await dialog.locator('.model-detail-item').count()) {
      await dialog.locator('.model-detail-item').first().click();
      await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    } else {
      await dialog.getByRole('button', { name: 'Done', exact: true }).click();
      await dialog.getByRole('button', { name: 'Add', exact: true }).click();
      await dialog
        .getByRole('button', { name: 'Add window', exact: true })
        .click();
    }
    await dialog
      .getByRole('button', { name: 'Fit selection', exact: true })
      .click();
    await shot('editor-model-canvas-mobile');
    await dialog
      .getByRole('button', { name: 'Selected detail actions', exact: true })
      .click();
    await shot('editor-model-actions-mobile');
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
    await dialog.getByLabel('Width (m)', { exact: true }).click();
    await shot('editor-model-properties-mobile');
    await dialog.getByLabel('Model editing mode').selectOption('appearance');
    await dialog
      .getByRole('spinbutton', {
        name: 'Building height (m)',
        exact: true,
      })
      .focus();
    await expect
      .poll(async () => {
        const canvas = await dialog
          .locator('.photo-model-canvas')
          .boundingBox();
        const sheet = await dialog.locator('.model-sheet-handle').boundingBox();
        return canvas!.y + canvas!.height <= sheet!.y + 2;
      })
      .toBe(true);
    await shot('editor-model-height-mobile');
    await dialog.getByLabel('Model editing mode').selectOption('roof');
    if (await editRoof.isVisible()) await editRoof.click();
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      dialog.getByRole('application', {
        name: 'Roof plan drawing',
        exact: true,
      }),
    ).toBeVisible();
    await shot('editor-model-roof-mobile');
    await dialog.getByLabel('Model editing mode').selectOption('outline');
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await page.emulateMedia({ colorScheme: 'light' });
    await shot('editor-model-outline-mobile');
    await dialog.getByRole('button', { name: 'Photo', exact: true }).click();
    await shot('editor-model-photo-mobile');
    await dialog.getByLabel('Model editing mode').selectOption('review');
    await shot('editor-model-review-mobile');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await dialog.getByRole('button', { name: 'Details', exact: true }).click();
    await dialog.locator('.model-stage').evaluate((element) => {
      element.scrollTop = 0;
    });
    await dialog
      .getByRole('button', { name: 'Reset 3D view', exact: true })
      .click();
    await shot('unified-model-desktop');

    await dialog
      .getByRole('button', { name: 'Close workspace', exact: true })
      .click();
    if (process.env.TURNRIGHT_DOCS_EDITOR_ONLY) return;
    await page.goto('/');
    await attachMap(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() =>
      window.editorTestMap.jumpTo({
        center: [3.1998, 6.471],
        zoom: 17.6,
        pitch: 45,
      }),
    );
    await page.getByLabel('Search campus').fill('Senate');
    await page
      .getByRole('button', { name: /LASU Senate Building/ })
      .first()
      .click();
    await shot('public-place-desktop-current');
    const handle = page.getByRole('slider', { name: 'Resize search panel' });
    await handle.focus();
    await handle.press('Home');
    await shot('public-panel-resized-current');
    await page.setViewportSize({ width: 390, height: 844 });
    await handle.press('End');
    await shot('public-place-mobile-current');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await shot('public-settings-mobile-current');
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', { name: /Offline maps|Offline/, exact: false })
      .first()
      .click();
    await shot('public-offline-mobile-current');
    await page.keyboard.press('Escape');
    const close = page.getByRole('button', {
      name: 'Close place details',
      exact: true,
    });
    if (await close.isVisible()) await close.click();
    const clear = page.getByRole('button', {
      name: 'Clear search',
      exact: true,
    });
    if (await clear.isVisible()) await clear.click();
    const collapse = page.getByRole('button', {
      name: 'Collapse card',
      exact: true,
    });
    if (await collapse.isVisible()) await collapse.click();
    await shot('public-map-mobile-current');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() =>
      window.editorTestMap.jumpTo({
        center: [14, 12],
        zoom: -0.7,
        pitch: 0,
        bearing: 0,
      }),
    );
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.areTilesLoaded()))
      .toBe(true);
    await shot('public-globe-mobile-current');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() =>
      window.editorTestMap.jumpTo({
        center: [14, 12],
        zoom: 1.65,
        pitch: 0,
        bearing: 0,
      }),
    );
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.areTilesLoaded()))
      .toBe(true);
    await shot('public-globe-desktop-current');
  }
  await page.goto('/');
  await attachMap(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByLabel('Search campus').fill('Senate');
  await page
    .getByRole('button', { name: /LASU Senate Building/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Directions', exact: true }).click();
  await page
    .getByLabel('Starting place')
    .selectOption('arcgis:University_Property:129');
  await expect(
    page.getByRole('button', { name: 'Start walking', exact: true }),
  ).toBeVisible();
  const flat = page.getByRole('button', { name: 'Switch to 2D', exact: true });
  if (await flat.isVisible()) await flat.click();
  const frameRoute = async (mobile: boolean) =>
    page.evaluate(async (mobile) => {
      const map = window.editorTestMap;
      const lines = (await (
        map.getSource('routes') as import('maplibre-gl').GeoJSONSource
      ).getData()) as import('geojson').FeatureCollection<
        import('geojson').LineString
      >;
      const points = lines.features.flatMap((f) => f.geometry.coordinates);
      map.fitBounds(
        [
          [
            Math.min(...points.map((p) => p[0])),
            Math.min(...points.map((p) => p[1])),
          ],
          [
            Math.max(...points.map((p) => p[0])),
            Math.max(...points.map((p) => p[1])),
          ],
        ],
        {
          padding: mobile
            ? { top: 110, bottom: 430, left: 35, right: 35 }
            : { top: 60, bottom: 60, left: 510, right: 60 },
          pitch: 0,
          duration: 0,
        },
      );
    }, mobile);
  await frameRoute(false);
  await shot('public-route-desktop-current');
  await page.setViewportSize({ width: 390, height: 844 });
  const routeHandle = page.getByRole('slider', { name: 'Resize search panel' });
  await routeHandle.press('Home');
  for (let i = 0; i < 9; i++) await routeHandle.press('ArrowUp');
  await page
    .getByRole('button', { name: 'Start walking', exact: true })
    .scrollIntoViewIfNeeded();
  await frameRoute(true);
  await shot('public-route-mobile-current');
});

test('documentation capture: editor appearance, roof and settings', async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.TURNRIGHT_DOCS_SCREENSHOTS,
    'Opt-in README captures with local API fixtures.',
  );
  test.setTimeout(240000);
  await page.emulateMedia({ colorScheme: 'dark' });
  const state = await setup(page, true, true);
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await focusModels(page);
  await page.evaluate(() => window.editorTestMap.jumpTo({ zoom: 17.3 }));
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.loaded()))
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('editor-workspace.png') });
  await page.getByRole('button', { name: 'Collapse explorer' }).click();
  await focusModels(page);
  const roof = await position(page, [3.19978, 6.47109]);
  await page.mouse.click(roof.x, roof.y - 80);
  await expect(
    page.getByRole('textbox', { name: 'Name', exact: true }),
  ).toHaveValue('LASU Senate Building');
  await expect(
    page.getByRole('button', { name: 'Appearance', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.loaded()))
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('editor-building.png') });
  await page.getByLabel('Building or wing').selectOption({ label: 'Wing 1' });
  await page.getByRole('button', { name: 'Roof', exact: true }).click();
  await page.getByRole('button', { name: 'Create custom roof' }).click();
  await expect(
    page.getByRole('button', { name: 'Apply roof', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Updating 3D preview…', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Retry 3D preview', exact: true }),
  ).toHaveCount(0);
  // Show the complete roof plan without changing the application's panel layout.
  await page.locator('.editor-inspector-body').evaluate((element) => {
    element.scrollTop = 300;
  });
  await page.screenshot({ path: testInfo.outputPath('editor-roof.png') });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.screenshot({ path: testInfo.outputPath('editor-settings.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('button', { name: 'Retry 3D preview', exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('editor-settings-phone.png'),
  });
  expect(state.edits()).toHaveLength(0);
  await page.goto('/');
  await attachMap(page);
  await focusModels(page, true);
  const place = await position(page, [3.19978, 6.47109]);
  await page.mouse.click(place.x, place.y - 12);
  await expect(
    page.getByRole('heading', { name: 'LASU Senate Building', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('public-place-phone.png'),
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await focusModels(page);
  await page.screenshot({
    path: testInfo.outputPath('public-campus-dark.png'),
  });
});

test('driving road approval persists separately from walking access', async ({
  page,
}) => {
  const server = await setup(page, false, false, {
    initialEdits: [
      {
        id: 'driving-review-road',
        kind: 'path',
        geometry: {
          type: 'LineString',
          coordinates: [
            [3.2005, 6.4598],
            [3.2005, 6.46015],
          ],
        },
        properties: {
          name: 'Driving review road',
          access: 'campus',
          vertexIds: ['drive:start', 'drive:end'],
        },
      },
    ],
  });
  const select = async () => {
    await focusCampus(page);
    const point = await position(page, [3.2005, 6.4601]);
    await page.mouse.click(point.x, point.y);
    await expect(
      page.getByRole('combobox', { name: 'Vehicle access', exact: true }),
    ).toBeVisible();
  };
  await select();
  await expect(
    page.getByRole('combobox', { name: 'Vehicle access', exact: true }),
  ).toHaveValue('unknown');
  await page
    .getByRole('combobox', { name: 'Vehicle access', exact: true })
    .selectOption('reviewed');
  await page.getByLabel('Permitted vehicle audience').fill('Campus visitors');
  await page.getByLabel('Driving approval date').fill('2026-09-22');
  await page
    .getByLabel('Driving approval evidence and restrictions')
    .fill('Owner inspected this road; visitors permitted.');
  await page
    .getByRole('combobox', { name: 'Vehicle direction', exact: true })
    .selectOption('reverse');
  await page.getByLabel('Recorded speed (km/h)').fill('15');
  await expect
    .poll(
      () =>
        (
          server.edits().find((e) => e.id === 'driving-review-road')?.properties
            .vehicle as { speedKph?: number }
        )?.speedKph,
    )
    .toBe(15);
  expect(
    server.edits().find((e) => e.id === 'driving-review-road')?.properties
      .access,
  ).toBe('campus');
  await page.reload();
  await attachMap(page);
  await select();
  await expect(
    page.getByRole('combobox', { name: 'Vehicle access', exact: true }),
  ).toHaveValue('reviewed');
  await expect(
    page.getByRole('combobox', { name: 'Vehicle direction', exact: true }),
  ).toHaveValue('reverse');
  await expect(page.getByLabel('Permitted vehicle audience')).toHaveValue(
    'Campus visitors',
  );
});
async function modelAction(page: Page, name: string) {
  const dialog = page.getByRole('dialog');
  const attached = dialog.getByRole('button', {
    name: 'Selected detail actions',
    exact: true,
  });
  if (await attached.isVisible()) await attached.click();
  else if (
    await dialog
      .getByRole('button', { name: 'Selection actions', exact: true })
      .isVisible()
  )
    await dialog
      .getByRole('button', { name: 'Selection actions', exact: true })
      .click();
  else {
    await dialog.getByRole('button', { name: 'More', exact: true }).click();
    await dialog
      .getByRole('button', { name: 'Selection actions', exact: true })
      .click();
  }
  await page.getByRole('menuitem', { name, exact: true }).click();
}
async function unifiedModelFixture(
  page: Page,
  options: {
    prepareWall?: boolean;
    repairMode?: boolean;
    properties?: Record<string, unknown>;
  } = {},
) {
  const building = browserCampus().map.features.find(
    (f) => f.properties?.id === 'library',
  )!;
  const server = await setup(page, false, false, {
    initialEdits: [
      {
        id: 'library',
        kind: 'building',
        geometry: building.geometry,
        properties: { ...building.properties, ...options.properties },
      },
    ],
  });
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByLabel('Search map features').fill('Library');
  await page
    .locator('.editor-feature-list button')
    .filter({
      has: page.locator('.editor-feature-icon.building'),
      hasText: 'Library',
    })
    .first()
    .click();
  const collapse = page.getByRole('button', { name: 'Collapse explorer' });
  if (await collapse.isVisible()) await collapse.click();
  await page
    .getByRole('button', { name: 'Photo & model', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (options.repairMode) return { server, dialog, wall: () => undefined };
  if (await dialog.getByLabel('Model editing mode').isVisible()) {
    await dialog
      .getByRole('button', { name: 'Choose wall', exact: true })
      .click();
    await dialog.locator('[data-model-wall="library:wall:0:0:0"]').click();
  } else
    await dialog.getByLabel('Mapped wall').selectOption('library:wall:0:0:0');
  if (options.prepareWall !== false) {
    if (await dialog.getByLabel('Model editing mode').isVisible())
      await dialog.getByRole('button', { name: 'More', exact: true }).click();
    await dialog
      .getByRole('button', { name: 'Preview editable layout', exact: true })
      .click();
    await dialog
      .getByRole('button', { name: 'Use editable layout', exact: true })
      .click();
    if (await dialog.getByLabel('Model editing mode').isVisible())
      await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await dialog
      .getByRole('button', { name: 'Add window', exact: true })
      .click();
    await expect
      .poll(
        () =>
          server.edits().find((e) => e.id === 'library')?.properties.appearance
            ?.facades?.['library:wall:0:0:0']?.elements.length,
      )
      .toBe(1);
  }
  return {
    server,
    dialog,
    wall: () =>
      server.edits().find((e) => e.id === 'library')?.properties.appearance
        ?.facades?.['library:wall:0:0:0'],
  };
}
test('unified model repairs empty recovered wall records without crashing or changing other properties', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  const { server, dialog } = await unifiedModelFixture(page, {
    prepareWall: false,
    repairMode: true,
    properties: {
      height: 6,
      heightEstimated: true,
      appearance: { windows: false, facades: { 'library:wall:0:0:0': {} } },
    },
  });
  await expect(
    dialog.getByRole('heading', { name: /Repair wall records/ }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Remove empty wall record' })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Add window', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => server.edits()[0].properties.appearance?.facades)
    .toEqual({});
  expect(server.edits()[0].properties.appearance?.windows).toBe(false);
  expect(server.edits()[0].properties.height).toBe(6);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: /Repair wall records/ }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Remove empty wall record' })
    .click();
  await dialog.getByRole('button', { name: 'Add window', exact: true }).click();
  await expect
    .poll(
      () =>
        server.edits()[0].properties.appearance?.facades?.['library:wall:0:0:0']
          ?.elements.length,
    )
    .toBe(1);
  expect(failures).toEqual([]);
});
test('unified model preserves incomplete nonempty records for recovery', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  const { server, dialog } = await unifiedModelFixture(page, {
    prepareWall: false,
    repairMode: true,
    properties: {
      appearance: {
        facades: { 'library:wall:0:0:0': { notes: 'Keep this observation' } },
      },
    },
  });
  await expect(
    dialog.getByText(/contents have not been discarded/),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Remove empty wall record' }),
  ).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close workspace' }).click();
  expect(
    server.edits()[0].properties.appearance?.facades?.['library:wall:0:0:0']
      ?.notes,
  ).toBe('Keep this observation');
  expect(failures).toEqual([]);
});
for (const width of [390, 1440])
  test(`unified model Add tools preserve generated details at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const { dialog, wall } = await unifiedModelFixture(page, {
      prepareWall: false,
      properties: {
        height: 6,
        floors: 2,
        appearance: { windows: true, roofForm: 'flat' },
      },
    });
    if (width <= 900)
      await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await dialog.getByRole('button', { name: 'Add door', exact: true }).click();
    await expect
      .poll(() => wall()?.elements.some((e) => e.kind === 'door'))
      .toBe(true);
    const first = structuredClone(wall()!);
    expect(first.elements.some((e) => e.kind === 'window' && e.count > 1)).toBe(
      true,
    );
    expect(first.elements.some((e) => e.kind === 'trim')).toBe(true);
    await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(() => wall()).toBeUndefined();
    await expect(
      dialog.getByText('0 selected · 0 details', { exact: true }),
    ).toBeVisible();
    if (width <= 900)
      await dialog.getByRole('button', { name: 'More', exact: true }).click();
    if (width <= 900)
      await dialog
        .getByRole('button', { name: 'Selection actions', exact: true })
        .click();
    else
      await dialog
        .getByRole('application', { name: /Wall canvas/ })
        .click({ button: 'right' });
    await expect(
      page.getByRole('menuitem', { name: 'Duplicate', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect.poll(() => wall()?.elements).toEqual(first.elements);
    for (const kind of [
      'window',
      'column',
      'balcony',
      'canopy',
      'parapet',
      'trim',
    ]) {
      const count = wall()!.elements.length;
      if (
        width <= 900 &&
        !(await dialog
          .getByRole('button', { name: `Add ${kind}`, exact: true })
          .isVisible())
      )
        await dialog.getByRole('button', { name: 'More', exact: true }).click();
      await dialog
        .getByRole('button', { name: `Add ${kind}`, exact: true })
        .click();
      await expect.poll(() => wall()?.elements.length).toBe(count + 1);
      expect(wall()!.elements.at(-1)?.kind).toBe(kind);
    }
    expect(wall()!.elements.slice(0, first.elements.length)).toEqual(
      first.elements,
    );
    await expect(dialog.locator('footer [role="alert"]')).toHaveCount(0);
  });

test('unified model retains a blocked insertion and repairs building height without leaving the workspace', async ({
  page,
}) => {
  const { server, dialog, wall } = await unifiedModelFixture(page, {
    prepareWall: false,
    properties: { heightMode: 'floors', floors: undefined },
  });
  await dialog.getByRole('button', { name: 'Add window', exact: true }).click();
  await expect(dialog.locator('footer [role="alert"]')).toContainText(
    'floor count',
  );
  await expect(dialog.getByLabel('Width (m)', { exact: true })).toHaveValue(
    '1.5',
  );
  expect(wall()).toBeUndefined();
  await dialog
    .getByRole('button', { name: 'Close workspace', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Photo & model', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Save unfinished wall' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Check building height' }).click();
  const floors = dialog.getByLabel('Building floors', { exact: true });
  await floors.fill('3');
  await floors.press('Enter');
  await expect
    .poll(
      () => server.edits().find((e) => e.id === 'library')?.properties.floors,
    )
    .toBe(3);
  await dialog.getByRole('button', { name: 'Details', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save unfinished wall' }).click();
  await expect.poll(() => wall()?.elements.length).toBe(1);
  await expect(
    dialog.getByRole('button', { name: 'Save unfinished wall' }),
  ).toHaveCount(0);
  expect(wall()?.elements[0].kind).toBe('window');
  await dialog.getByRole('button', { name: 'Appearance', exact: true }).click();
  await dialog.getByLabel('Building height information').selectOption('metres');
  await dialog.getByLabel('Building height (m)', { exact: true }).fill('');
  await dialog.getByLabel('Building height (m)', { exact: true }).press('Tab');
  await dialog
    .getByRole('button', { name: 'Use unknown building height' })
    .click();
  await expect
    .poll(
      () => server.edits().find((e) => e.id === 'library')?.properties.height,
    )
    .toBeUndefined();
  expect(
    server.edits().find((e) => e.id === 'library')?.properties.floors,
  ).toBeUndefined();
  await expect(dialog.locator('header output')).not.toContainText(
    'Unsaved input',
  );
});

test('unified model rejected appearance input stays with its wall and selection follows appearance tools', async ({
  page,
}) => {
  const { dialog, server } = await unifiedModelFixture(page, {
    prepareWall: false,
    properties: { heightMode: 'floors', floors: undefined },
  });
  await dialog.getByRole('button', { name: 'Appearance', exact: true }).click();
  const spacing = dialog.getByLabel('Window spacing (m)', { exact: true });
  await spacing.fill('12');
  await spacing.press('Enter');
  await expect(spacing).toHaveAttribute('aria-invalid', 'true');
  await dialog
    .getByLabel('Wall', { exact: true })
    .selectOption('library:wall:0:0:1');
  await expect(dialog.getByLabel('Mapped wall')).toHaveValue(
    'library:wall:0:0:1',
  );
  await expect(spacing).not.toHaveValue('12');
  await dialog
    .getByLabel('Wall', { exact: true })
    .selectOption('library:wall:0:0:0');
  await expect(spacing).toHaveValue('12');
  await dialog.getByLabel('Building floors', { exact: true }).fill('2');
  await dialog.getByLabel('Building floors', { exact: true }).press('Enter');
  await spacing.press('Enter');
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === 'library')?.properties.appearance
          ?.walls?.['library:wall:0:0:0']?.windowSpacing,
    )
    .toBe(12);
  expect(
    server.edits().find((e) => e.id === 'library')?.properties.appearance
      ?.walls?.['library:wall:0:0:1']?.windowSpacing,
  ).toBeUndefined();
  await dialog
    .getByLabel('Wall', { exact: true })
    .selectOption('library:wall:0:0:1');
  await dialog.getByRole('button', { name: 'Details', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add column', exact: true }).click();
  await expect
    .poll(
      () =>
        server
          .edits()
          .find((e) => e.id === 'library')
          ?.properties.appearance?.facades?.['library:wall:0:0:1']?.elements.at(
            -1,
          )?.kind,
    )
    .toBe('column');
});
test('unified model retries failed preview without losing draft or camera', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Base = Worker;
    window.Worker = class extends Base {
      modelPreview: boolean;
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        this.modelPreview = !!document.querySelector('.photo-model-workspace');
      }
      postMessage(message: unknown, ...rest: [Transferable[]?]) {
        if (
          this.modelPreview &&
          document.documentElement.dataset.failModelPreview === 'true'
        ) {
          delete document.documentElement.dataset.failModelPreview;
          throw new DOMException(
            'Injected preview delivery failure',
            'DataCloneError',
          );
        }
        return super.postMessage(message, rest[0] || []);
      }
    };
  });
  const { dialog, wall } = await unifiedModelFixture(page);
  const canvas = await dialog.locator('canvas').elementHandle();
  await page.evaluate(() => {
    document.documentElement.dataset.failModelPreview = 'true';
  });
  await dialog.getByLabel('Width (m)', { exact: true }).fill('1.9');
  await dialog.getByLabel('Width (m)', { exact: true }).press('Enter');
  await expect(
    dialog.getByRole('button', { name: 'Retry model preview', exact: true }),
  ).toBeVisible();
  await expect.poll(() => wall()?.elements[0].width).toBe(1.9);
  await dialog
    .getByRole('button', { name: 'Retry model preview', exact: true })
    .click();
  await expect(
    dialog.getByText('Estimated dimensions · selected wall outlined'),
  ).toBeVisible();
  expect(await canvas!.evaluate((el) => el.isConnected)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Photo & model', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Name', exact: true }),
  ).toHaveValue('Library');
});
test('unified model duplication, patterns, undo and private input recovery', async ({
  page,
}) => {
  const { server, dialog, wall } = await unifiedModelFixture(page);
  await modelAction(page, 'Duplicate');
  await expect.poll(() => wall()?.elements.length).toBe(2);
  expect(new Set(wall()!.elements.map((e) => e.id)).size).toBe(2);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => wall()?.elements.length).toBe(1);
  await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(() => wall()?.elements.length).toBe(2);
  await dialog.locator('.model-detail-item').last().click();
  await dialog.getByText('Groups, patterns & presets', { exact: true }).click();
  await dialog.getByLabel('Name', { exact: true }).fill('Window bays');
  await dialog.getByLabel('Rows', { exact: true }).fill('2');
  await dialog.getByLabel('Columns', { exact: true }).fill('3');
  await dialog
    .getByRole('button', { name: 'Create pattern', exact: true })
    .click();
  await expect.poll(() => wall()?.elements.length).toBe(7);
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === 'library')?.properties
          .modelAuthoring?.patterns.length,
    )
    .toBe(1);
  await dialog.locator('.model-detail-item').first().click();
  const beforeWidth = wall()!.elements[0].width;
  await dialog.getByLabel('Width (m)', { exact: true }).fill('');
  await dialog
    .getByRole('button', { name: 'Close workspace', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Photo & model', exact: true })
    .click();
  await dialog.locator('.model-detail-item').first().click();
  await expect(dialog.getByLabel('Width (m)', { exact: true })).toHaveValue('');
  expect(wall()!.elements[0].width).toBe(beforeWidth);
  await dialog.getByLabel('Width (m)', { exact: true }).fill('1.7');
  await dialog.getByLabel('Width (m)', { exact: true }).press('Enter');
  await expect.poll(() => wall()?.elements[0].width).toBe(1.7);
});
test('unified model keyboard placement, locking, copy preview and targeted review', async ({
  page,
}) => {
  const { dialog, wall } = await unifiedModelFixture(page);
  const before = wall()!.elements[0].x;
  const canvas = dialog.getByRole('application', { name: /Wall canvas/ });
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => wall()?.elements[0].x || 0).toBeGreaterThan(before);
  await modelAction(page, 'Lock');
  const locked = wall()!.elements[0].x;
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  expect(wall()!.elements[0].x).toBe(locked);
  await modelAction(page, 'Unlock');
  await modelAction(page, 'Copy');
  await modelAction(page, 'Paste / copy to…');
  await dialog
    .getByLabel('Target wall', { exact: true })
    .selectOption('library:wall:0:0:1');
  await expect(
    dialog.getByLabel('Copied layout preview on target wall', { exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm placement' }).click();
  await expect(dialog.getByLabel('Mapped wall')).toHaveValue(
    'library:wall:0:0:1',
  );
  await dialog.getByText('Evidence & wall review', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Mark this wall reviewed' }).click();
  expect(wall()?.reviewedAt).toBeUndefined();
});

test('selected detail menu supports context actions, keyboard focus and undo', async ({
  page,
}) => {
  const { dialog, wall } = await unifiedModelFixture(page);
  const canvas = dialog.getByRole('application', { name: /Wall canvas/ });
  const selected = canvas.locator('[data-element-id]').first();
  await selected.click({ button: 'right' });
  await expect(
    page.getByRole('menuitem', { name: 'Duplicate', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('menuitem', { name: 'Edit details', exact: true })
    .click();
  await expect(dialog.getByLabel('Detail name', { exact: true })).toBeFocused();
  await canvas.focus();
  await page.keyboard.press('Shift+F10');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(canvas).toBeFocused();
  await modelAction(page, 'Hide in editor');
  await expect(canvas.locator('[data-element-id]')).toHaveCount(0);
  await modelAction(page, 'Show in editor');
  await expect(canvas.locator('[data-element-id]')).toHaveCount(1);
  await canvas.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByLabel('Detail name', { exact: true })).toBeFocused();
  await modelAction(page, 'Duplicate');
  await expect.poll(() => wall()?.elements.length).toBe(2);
  await modelAction(page, 'Delete');
  await expect.poll(() => wall()?.elements.length).toBe(1);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => wall()?.elements.length).toBe(2);
  await canvas.focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu')).toContainText('2 details selected');
  await page.keyboard.press('Escape');
});
test('unified model retains an invalid pattern privately and repairs it after reopening', async ({
  page,
}) => {
  const { server, dialog, wall } = await unifiedModelFixture(page);
  await dialog.getByText('Groups, patterns & presets', { exact: true }).click();
  await dialog.getByLabel('Horizontal step (m)', { exact: true }).fill('50');
  await dialog
    .getByRole('button', { name: 'Create pattern', exact: true })
    .click();
  await expect(dialog.locator('header output')).toContainText('Unsaved input');
  expect(wall()?.elements.length).toBe(1);
  await dialog
    .getByRole('button', { name: 'Close workspace', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Photo & model', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Pattern · Repeated details', exact: true })
    .click();
  await dialog.getByText('Groups, patterns & presets', { exact: true }).click();
  await dialog.getByLabel('Horizontal step (m)', { exact: true }).fill('2');
  await dialog
    .getByRole('button', { name: 'Update pattern', exact: true })
    .click();
  await expect.poll(() => wall()?.elements.length).toBe(3);
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === 'library')?.properties
          .modelAuthoring?.patterns.length,
    )
    .toBe(1);
});

for (const viewport of [
  { width: 740, height: 390 },
  { width: 320, height: 450 },
])
  test(`unified model controls remain reachable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const { dialog } = await unifiedModelFixture(page);
    await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
    const width = dialog.getByLabel('Width (m)', { exact: true });
    await width.fill('1.8');
    await width.press('Enter');
    await expect(width).toHaveValue('1.8');
    const close = dialog.getByRole('button', {
      name: 'Close workspace',
      exact: true,
    });
    await close.scrollIntoViewIfNeeded();
    const box = await close.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    await close.click();
    await expect(
      page.getByRole('button', { name: 'Photo & model', exact: true }),
    ).toBeFocused();
  });
test('unified model roof and outline tools share draft history', async ({
  page,
}) => {
  const { server, dialog } = await unifiedModelFixture(page);
  await dialog.getByRole('button', { name: 'Roof', exact: true }).click();
  await dialog
    .getByLabel('Building or wing', { exact: true })
    .selectOption({ label: 'Wing 1' });
  await dialog
    .getByRole('button', { name: 'Create custom roof', exact: true })
    .click();
  await expect
    .poll(
      () =>
        Object.keys(
          server.edits().find((e) => e.id === 'library')?.properties.appearance
            ?.roofs || {},
        ).length,
    )
    .toBe(1);
  await dialog
    .getByRole('button', { name: 'Done editing roof', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Outline', exact: true }).click();
  await expect(dialog.getByLabel('Top-down building outline')).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Insert midpoint after vertex' })
    .click();
  await expect(
    dialog.getByLabel('Outline vertex').locator('option'),
  ).toHaveCount(5);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    dialog.getByLabel('Outline vertex').locator('option'),
  ).toHaveCount(4);
});
for (const width of [320, 390, 768, 1440])
  for (const dark of [false, true])
    test(`photo model workspace ${width}px ${dark ? 'dark' : 'light'}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 850 });
      await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
      const sample = JSON.parse(
        readFileSync(
          new URL('../../../data/photos/catalogue.json', import.meta.url),
          'utf8',
        ),
      )[0] as CampusPhoto;
      const building = browserCampus().map.features.find(
        (f) => f.properties?.id === 'library',
      )!;
      const edit: MapEdit = {
        id: 'library',
        kind: 'building',
        geometry: building.geometry,
        properties: {
          ...building.properties,
          photos: [{ ...sample, buildingId: 'library' }],
        },
      };
      await page.route(`**${sample.url}`, (r) =>
        r.fulfill({
          body: readFileSync(
            new URL(
              `../../../data/photos/${sample.sha256}.webp`,
              import.meta.url,
            ),
          ),
          contentType: 'image/webp',
        }),
      );
      const server = await setup(page, false, false, { initialEdits: [edit] });
      await focusCampus(page);
      await page.getByRole('button', { name: 'Collapse explorer' }).click();
      await clickMap(page, [3.20012, 6.46022]);
      const trigger = page.getByRole('button', {
        name: 'Photo & model',
        exact: true,
      });
      await trigger.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      if (width <= 900) {
        await dialog
          .getByRole('button', { name: 'Choose wall', exact: true })
          .click();
        await dialog.locator('[data-model-wall="library:wall:0:0:0"]').click();
        await dialog.getByRole('button', { name: 'More', exact: true }).click();
      } else
        await dialog
          .getByLabel('Mapped wall')
          .selectOption('library:wall:0:0:0');
      await dialog
        .getByRole('button', { name: 'Preview editable layout', exact: true })
        .click();
      await dialog
        .getByRole('button', { name: 'Use editable layout', exact: true })
        .click();
      if (width <= 900)
        await dialog.getByRole('button', { name: 'Add', exact: true }).click();
      await dialog
        .getByRole('button', { name: 'Add window', exact: true })
        .click();
      if (width <= 900)
        await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
      await dialog.getByLabel('Width (m)', { exact: true }).fill('1.8');
      await dialog.getByLabel('Width (m)', { exact: true }).press('Enter');
      await expect
        .poll(
          () =>
            server
              .edits()
              .find((e) => e.id === 'library')
              ?.properties.appearance?.facades?.[
                'library:wall:0:0:0'
              ]?.elements.at(-1)?.width,
        )
        .toBe(1.8);
      if (width <= 900)
        await dialog.getByRole('button', { name: 'More', exact: true }).click();
      await dialog.getByText('Evidence & wall review', { exact: true }).click();
      await dialog
        .getByLabel('Evidence and measurement provenance')
        .fill('Illustrative visible window; dimensions estimated.');
      await dialog
        .getByLabel('Evidence and measurement provenance')
        .press('Enter');
      await dialog
        .getByRole('button', { name: 'Mark this wall reviewed', exact: true })
        .click();
      if (width <= 800)
        await dialog.getByRole('button', { name: '3D', exact: true }).click();
      await expect(dialog.locator('canvas')).toBeVisible();
      await expect(
        dialog.getByText('Estimated dimensions · selected wall outlined'),
      ).toBeVisible();
      const canvas = await dialog.locator('canvas').elementHandle();
      await expect
        .poll(() =>
          dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        )
        .toBe(true);
      await expect
        .poll(() => canvas!.evaluate((el) => el.isConnected))
        .toBe(true);
      await page.screenshot({ path: info.outputPath('photo-model.png') });
      await expect(dialog.getByText(/Saved to map draft/)).toBeVisible();
      await dialog
        .getByRole('button', { name: 'Close workspace', exact: true })
        .click();
      await expect(trigger).toBeFocused();
    });

test('mobile canvas editing uses focused sheets and deliberate move tools', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  const { dialog, wall } = await unifiedModelFixture(page, {
    prepareWall: false,
    properties: { height: 6, appearance: { windows: false, roofForm: 'flat' } },
  });
  await expect(
    dialog.getByRole('application', { name: /Wall canvas/ }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add window', exact: true }).click();
  await expect.poll(() => wall()?.elements.length).toBe(1);
  const initial = structuredClone(wall()!.elements[0]);
  const shape = dialog.locator(`[data-element-id="${initial.id}"]`).first();
  const b = (await shape.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 25, b.y + b.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  expect(wall()!.elements[0]).toEqual(initial);
  await dialog.getByRole('button', { name: 'Reset view', exact: true }).click();
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Nudge right', exact: true })
    .click();
  await expect
    .poll(() => wall()?.elements[0].x || 0)
    .toBeGreaterThan(initial.x);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => wall()?.elements[0].x).toBe(initial.x);
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
  const width = dialog.getByLabel('Width (m)', { exact: true });
  await width.fill('1.8');
  await width.press('Enter');
  await expect.poll(() => wall()?.elements[0].width).toBe(1.8);
  await page.screenshot({ path: info.outputPath('mobile-edit.png') });
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await dialog.getByRole('button', { name: 'More', exact: true }).click();
  await modelAction(page, 'Duplicate');
  await expect.poll(() => wall()?.elements.length).toBe(2);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await dialog.getByLabel('Model editing mode').selectOption('outline');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    dialog.getByRole('application', { name: 'Top-down building outline' }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('mobile-outline.png') });
  await dialog.getByLabel('Model editing mode').selectOption('appearance');
  await expect(
    dialog.getByLabel('Building height (m)', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1))
    .toBe(true);
  expect(failures).toEqual([]);
});

test('model editor height and floor count resize custom roofs with undo', async ({
  page,
}) => {
  const { dialog, server } = await unifiedModelFixture(page, {
    prepareWall: false,
    properties: {
      height: 6,
      heightMode: 'metres',
      appearance: {
        windows: false,
        roofForm: 'flat',
        roofs: { 'library:wing:0': { eaves: 6, points: [], lines: [] } },
      },
    },
  });
  await dialog.getByRole('button', { name: 'Appearance', exact: true }).click();
  const height = dialog.getByLabel('Building height (m)', { exact: true });
  await height.fill('14');
  await height.press('Enter');
  await expect
    .poll(
      () =>
        server.edits()[0].properties.appearance?.roofs?.['library:wing:0']
          .eaves,
    )
    .toBe(14);
  await dialog.getByLabel('Building height information').selectOption('floors');
  const floors = dialog.getByLabel('Building floors', { exact: true });
  await floors.fill('5');
  await floors.press('Enter');
  await expect
    .poll(
      () =>
        server.edits()[0].properties.appearance?.roofs?.['library:wing:0']
          .eaves,
    )
    .toBe(15);
  await expect(
    dialog.getByText('Estimated dimensions · selected wall outlined'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(
      () =>
        server.edits()[0].properties.appearance?.roofs?.['library:wing:0']
          .eaves,
    )
    .toBe(14);
  await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect
    .poll(
      () =>
        server.edits()[0].properties.appearance?.roofs?.['library:wing:0']
          .eaves,
    )
    .toBe(15);
});

test('mobile touch moves, resizes, cancels for pinch and restores unfinished inputs', async ({
  page,
  context,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const { dialog, wall } = await unifiedModelFixture(page, {
    prepareWall: false,
    properties: { height: 9, appearance: { windows: false, roofForm: 'flat' } },
  });
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add window', exact: true }).click();
  await expect.poll(() => wall()?.elements.length).toBe(1);
  await dialog
    .getByRole('button', { name: 'Fit selection', exact: true })
    .click();
  const send = async (
    type: string,
    points: { x: number; y: number; id: number }[],
  ) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const drag = async (x: number, y: number, dx: number, dy: number) => {
    await send('touchStart', [{ id: 1, x, y }]);
    for (let i = 1; i <= 5; i++)
      await send('touchMove', [
        { id: 1, x: x + (dx * i) / 5, y: y + (dy * i) / 5 },
      ]);
    await send('touchEnd', []);
  };
  let b = (await dialog.locator('[data-element-id]').first().boundingBox())!;
  const initial = structuredClone(wall()!.elements);
  await drag(b.x + b.width / 2, b.y + b.height / 2, 20, 10);
  expect(wall()!.elements).toEqual(initial);
  await dialog.getByRole('button', { name: 'Reset view', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Fit selection', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();
  b = (await dialog.locator('[data-element-id]').first().boundingBox())!;
  await drag(b.x + b.width / 2, b.y + b.height / 2, 25, -10);
  await expect
    .poll(() => wall()?.elements[0].x || 0)
    .toBeGreaterThan(initial[0].x);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => wall()?.elements).toEqual(initial);
  await dialog.getByRole('button', { name: 'Resize', exact: true }).click();
  b = (await dialog
    .getByLabel('Resize selected detail', { exact: true })
    .boundingBox())!;
  await drag(b.x + b.width / 2, b.y + b.height / 2, 25, -15);
  await expect
    .poll(() => wall()?.elements[0].width || 0)
    .toBeGreaterThan(initial[0].width);
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();
  b = (await dialog.locator('[data-element-id]').first().boundingBox())!;
  const stable = structuredClone(wall()!.elements),
    x = b.x + b.width / 2,
    y = b.y + b.height / 2;
  await send('touchStart', [{ id: 1, x, y }]);
  await send('touchMove', [{ id: 1, x: x + 12, y }]);
  await send('touchStart', [
    { id: 1, x: x + 12, y },
    { id: 2, x: x + 40, y: y + 50 },
  ]);
  await send('touchMove', [
    { id: 1, x: x + 8, y },
    { id: 2, x: x + 55, y: y + 65 },
  ]);
  await send('touchEnd', []);
  expect(wall()!.elements).toEqual(stable);
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByLabel('Width (m)', { exact: true }).fill('');
  await dialog
    .getByRole('button', { name: 'Close workspace', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Photo & model', exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Choose wall', exact: true })
    .click();
  await dialog.locator('.model-detail-item').first().click();
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(dialog.getByLabel('Width (m)', { exact: true })).toHaveValue('');
  expect(wall()!.elements).toEqual(stable);
  await page.screenshot({ path: info.outputPath('mobile-recovery.png') });
});

test.describe('compact plan and photograph tools', () => {
  test.use({ hasTouch: true });
  for (const viewport of [
    { width: 320, height: 720 },
    { width: 768, height: 900 },
    { width: 1024, height: 390 },
  ])
    test(`all modes preserve the canvas at ${viewport.width}x${viewport.height}`, async ({
      page,
    }, info) => {
      await page.setViewportSize(viewport);
      const failures: string[] = [];
      page.on('pageerror', (e) => failures.push(e.message));
      const sample = JSON.parse(
        readFileSync(
          new URL('../../../data/photos/catalogue.json', import.meta.url),
          'utf8',
        ),
      )[0] as CampusPhoto;
      await page.route(`**${sample.url}`, (r) =>
        r.fulfill({
          body: readFileSync(
            new URL(
              `../../../data/photos/${sample.sha256}.webp`,
              import.meta.url,
            ),
          ),
          contentType: 'image/webp',
        }),
      );
      const { dialog, server, wall } = await unifiedModelFixture(page, {
        prepareWall: false,
        properties: {
          height: 9,
          appearance: { windows: false, roofForm: 'flat' },
          photos: [{ ...sample, buildingId: 'library' }],
        },
      });
      await expect(dialog.getByLabel('Model editing mode')).toBeVisible();
      await dialog.getByRole('button', { name: 'Add', exact: true }).click();
      await dialog
        .getByRole('button', { name: 'Add window', exact: true })
        .click();
      await expect.poll(() => wall()?.elements.length).toBe(1);
      await dialog.getByRole('button', { name: 'More', exact: true }).click();
      await dialog
        .getByRole('button', { name: 'Multi-select', exact: true })
        .click();
      await expect(
        dialog.getByRole('checkbox', { name: 'Window', exact: true }),
      ).toBeVisible();
      await dialog
        .getByRole('checkbox', { name: 'Window', exact: true })
        .click();
      await dialog
        .getByRole('checkbox', { name: 'Window', exact: true })
        .click();
      await dialog.getByRole('button', { name: 'Done', exact: true }).click();
      await dialog.getByLabel('Model editing mode').selectOption('roof');
      await dialog
        .getByRole('button', { name: 'Create custom roof', exact: true })
        .click();
      await dialog
        .getByRole('button', {
          name: 'Add point with coordinates',
          exact: true,
        })
        .click();
      await expect
        .poll(
          () =>
            server.edits()[0].properties.appearance?.roofs?.['library:wing:0']
              ?.points.length,
        )
        .toBe(1);
      await dialog.getByRole('button', { name: 'Done', exact: true }).click();
      const roof = dialog.getByRole('application', {
        name: 'Roof plan drawing',
        exact: true,
      });
      await expect(roof).toBeVisible();
      const roofValue = structuredClone(
        server.edits()[0].properties.appearance!.roofs,
      );
      const circle = roof.locator('[data-roof-point] circle').first(),
        b = (await circle.boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(43.9);
      expect(b.height).toBeGreaterThanOrEqual(43.9);
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 2, {
        steps: 5,
      });
      await page.mouse.up();
      expect(server.edits()[0].properties.appearance!.roofs).toEqual(roofValue);
      await dialog.getByLabel('Model editing mode').selectOption('outline');
      await dialog.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(
        dialog.getByRole('application', {
          name: 'Top-down building outline',
          exact: true,
        }),
      ).toBeVisible();
      await dialog.getByLabel('Model editing mode').selectOption('details');
      await dialog.getByRole('button', { name: 'Photo', exact: true }).click();
      await dialog.getByRole('button', { name: 'More', exact: true }).click();
      await dialog
        .getByRole('button', { name: 'Start / reset alignment', exact: true })
        .click();
      await expect.poll(() => wall()?.texture?.corners.length).toBe(4);
      await dialog.getByRole('button', { name: 'Done', exact: true }).click();
      const recipe = structuredClone(wall()!.texture);
      await dialog
        .getByRole('button', { name: 'Enlarge photo', exact: true })
        .click();
      await dialog
        .getByRole('button', { name: 'Fit photo', exact: true })
        .click();
      expect(wall()!.texture).toEqual(recipe);
      await dialog
        .getByRole('button', { name: 'Align texture', exact: true })
        .click();
      await dialog
        .getByRole('button', { name: 'Move corner', exact: true })
        .click();
      const corner = await dialog
        .getByRole('button', { name: /Top left texture corner/ })
        .boundingBox();
      expect(corner!.width).toBeGreaterThanOrEqual(43.9);
      expect(corner!.height).toBeGreaterThanOrEqual(43.9);
      await dialog
        .getByRole('button', { name: 'Edit alignment', exact: true })
        .click();
      await expect(
        dialog.getByLabel('Top left X', { exact: true }),
      ).toBeVisible();
      await dialog.getByLabel('Top left X', { exact: true }).fill('0.12');
      await dialog.getByLabel('Top left X', { exact: true }).press('Enter');
      await expect.poll(() => wall()?.texture?.corners[0][0]).toBe(0.12);
      await dialog.getByLabel('Model editing mode').selectOption('review');
      await expect(dialog.locator('.model-review')).toBeVisible();
      await expect
        .poll(() =>
          dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        )
        .toBe(true);
      await page.screenshot({ path: info.outputPath('compact-review.png') });
      expect(failures).toEqual([]);
    });
});
