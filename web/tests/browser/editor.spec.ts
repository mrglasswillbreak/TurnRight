import type { Map as MapInstance } from 'maplibre-gl';
declare global {
  interface Window {
    editorTestMap: MapInstance;
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
    .getByRole('button', { name: 'Mark entrance here', exact: true })
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
        page.getByRole('button', { name: 'Mark entrance here', exact: true }),
      ).toBeEnabled();
    }
    await page
      .getByRole('button', { name: 'Mark entrance here', exact: true })
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
  await setup(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.goto('/');
  await attachMap(page);
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
  const { campus } = await setup(page, true, true);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.goto('/');
  await attachMap(page);
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
import type { CampusData, MapEdit, Position } from '../../src/types';

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
    mutateCampus?: (data: CampusData) => void;
  } = {},
) {
  let edits: MapEdit[] = structuredClone(options.initialEdits || []);
  let revision = 0;
  const receipts = new Map<string, MapEdit[]>();
  const campus: CampusData = realCampus
    ? JSON.parse(
        readFileSync(
          new URL(
            '../../public/packages/lasu-4e4c8008b38b/campus.json',
            import.meta.url,
          ),
          'utf8',
        ),
      )
    : browserCampus();
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
      json: {
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
        json: { edits, reports: [], changes: [], jobs: [], releases: [] },
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
    campus,
  };
}
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
async function clickMap(page: Page, coordinates: Position) {
  const p = await position(page, coordinates);
  await page.mouse.click(p.x, p.y);
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
    .toBe('#182727');
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
  await page.getByRole('button', { name: 'Switch to 2D', exact: true }).click();
  await expect(page.getByLabel('Point elevation (m)')).toHaveValue('14');
  await page.getByRole('button', { name: 'Switch to 3D', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply roof' })).toBeEnabled();
  await page.reload();
  await attachMap(page);
  await page.getByRole('button', { name: 'Resume roof', exact: true }).click();
  await expect(page.getByLabel('Control point')).toContainText('14 m');
  await page.getByRole('button', { name: 'Apply roof', exact: true }).click();
  await expect
    .poll(
      () =>
        state.edits().find((e) => e.id === 'library')?.properties.appearance
          ?.roofs?.['library:wing:0']?.points[0]?.elevation,
    )
    .toBe(14);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Create custom roof' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Edit custom roof' }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/building-roof-editor.png' });
  expect(errors).toEqual([]);
});

test('building previews survive revisiting unedited buildings without rebuilding cached models', async ({
  page,
}) => {
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
  await page.getByRole('button', { name: 'Close properties' }).click();
  await expect.poll(rendered).not.toContain('library');
  await clickMap(page, [3.20012, 6.46022]);
  await expect(
    page.getByRole('heading', { name: 'Library', exact: true }),
  ).toBeVisible();
  await expect.poll(rendered).toContain('library');
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

test.describe('building roof touch editing', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('building appearance phone: ridge drawing, invalid elevations, opacity and worker recovery', async ({
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
    await expect(
      page.getByRole('button', { name: 'Apply roof', exact: true }),
    ).toBeDisabled();
    await expect(page.getByText('3D preview is outdated')).toBeVisible();
    await page.getByLabel('Point elevation (m)').fill('15');
    await expect(page.getByText('3D preview is outdated')).toHaveCount(0);
    await page.evaluate(() => {
      const send = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (
        message,
        ...rest: [Transferable[]?]
      ) {
        if (message?.features) {
          Worker.prototype.postMessage = send;
          throw new DOMException(
            'Injected worker delivery failure',
            'DataCloneError',
          );
        }
        return send.call(this, message, rest[0] || []);
      };
    });
    await page.getByLabel('Point elevation (m)').fill('14.5');
    await expect(
      page.getByRole('button', { name: 'Retry 3D preview', exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
        ),
      )
      .toContain('library');
    await page
      .getByRole('button', { name: 'Retry 3D preview', exact: true })
      .click();
    await expect(page.getByText('3D preview is outdated')).toHaveCount(0);
    await page
      .getByLabel('Roof surface', { exact: true })
      .selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Apply roof', exact: true }).click();
    await expect
      .poll(
        () =>
          state.edits().find((e) => e.id === 'library')?.properties.appearance
            ?.roofs?.['library:wing:0']?.lines.length,
      )
      .toBe(1);
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
  await context.setOffline(true);
  await page.reload();
  await attachMap(page);
  await page.getByRole('button', { name: 'Resume roof', exact: true }).click();
  await expect(page.getByLabel('Control point')).toContainText('14 m');
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
  expect(recovery.roofDraft.roof.points[0].elevation).toBe(14);
  expect(
    recovery.edits.find((e: MapEdit) => e.id === 'library').properties
      .appearance.walls['library:wall:0:0:0'].wallColour,
  ).toBe('#884422');
  await page.getByRole('button', { name: 'Apply roof', exact: true }).click();
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
    saved.edits.find((e: MapEdit) => e.id === 'library').properties.appearance
      .roofs['library:wing:0'].points[0].elevation,
  ).toBe(14);
});

test('view settings: single button, keyboard switching and shared preferences', async ({
  page,
}) => {
  test.setTimeout(90000);
  await setup(page);
  await page.goto('/');
  await attachMap(page);
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
    const header = await page.evaluate(() => ({
      brandRight: document
        .querySelector('.editor-brand strong')!
        .getBoundingClientRect().right,
      navigationLeft: document
        .querySelector('.editor-navigation')!
        .getBoundingClientRect().left,
    }));
    expect(header.brandRight).toBeLessThanOrEqual(header.navigationLeft);
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
    await expect(toggle).toHaveAccessibleName('Switch to 2D');
    await toggle.tap();
    await expect(toggle).toHaveAccessibleName('Switch to 3D');
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    await expect(
      page.getByRole('radio', { name: 'Simple', exact: true }),
    ).toBeChecked();
    await page.getByRole('radio', { name: 'Enhanced', exact: true }).tap();
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
