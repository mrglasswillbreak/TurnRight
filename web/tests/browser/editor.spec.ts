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
async function setup(page: Page, realCampus = false) {
  let edits: MapEdit[] = [];
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
  await page.route('**/packages/latest.json', (route) =>
    route.fulfill({
      json: {
        schemaVersion: 1,
        version: 'fixture',
        createdAt: campus.createdAt,
        summary: 'Test campus',
        dataUrl: '/packages/fixture/campus.json',
        bytes: Buffer.byteLength(bytes),
        assets: [
          {
            url: '/packages/fixture/campus.json',
            sha256: createHash('sha256').update(bytes).digest('hex'),
            bytes: Buffer.byteLength(bytes),
          },
        ],
      },
    }),
  );
  await page.route('**/packages/fixture/campus.json', (route) =>
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
  return { edits: () => edits, campus };
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
  test(`drawing session protects the first point and restores panels with ${touch ? 'touch' : 'mouse'}`, async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:5183',
      viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      hasTouch: touch, isMobile: touch,
    });
    const page = await context.newPage();
    try {
      const server = await setup(page);
      await focusCampus(page);
      await page.getByRole('button', { name: 'Draw path', exact: true }).click();
      await expect(page.locator('.editor-explorer')).toHaveClass(/collapsed/);
      await expect(page.getByText('Click or tap the map to place the first point.')).toBeVisible();
      const finish = page.getByRole('button', { name: 'Finish', exact: true });
      await expect(finish).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Draw building', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Compare base', exact: true })).toBeDisabled();
      const point = await position(page, [3.20015, 6.4601]);
      if (touch) await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
      await expect(page.locator('.drawing-progress')).toContainText('1 point placed');
      await expect(finish).toBeDisabled();
      await expect.poll(() => page.evaluate(() => window.editorTestMap.queryRenderedFeatures().filter(f => /td-/.test(f.layer.id) && f.geometry.type === 'Point').length)).toBeGreaterThan(0);
      await page.getByRole('button', { name: '3D', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.editorTestMap.getPitch())).toBeGreaterThan(45);
      await expect(page.locator('.drawing-progress')).toContainText('1 point placed');
      const second = await position(page, [3.2004, 6.4601]);
      if (touch) await page.touchscreen.tap(second.x, second.y);
      else await page.mouse.click(second.x, second.y);
      await expect(finish).toBeEnabled();
      await finish.click();
      await expect(page.locator('.editor-explorer')).not.toHaveClass(/collapsed/);
      await expect.poll(() => server.edits().filter(e => e.kind === 'path').length).toBe(1);
      await page.getByRole('button', { name: 'Draw path', exact: true }).click();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.locator('.editor-explorer')).not.toHaveClass(/collapsed/);
      expect(server.edits().filter(e => e.kind === 'path')).toHaveLength(1);
    } finally { await context.close(); }
  });

test('public map defaults to 3D, frames campus and opens building details', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && message.text().includes('Campus map:')) errors.push(message.text()); });
  await setup(page);
  await page.goto('/');
  await attachMap(page);
  await expect.poll(() => page.evaluate(() => window.editorTestMap.getPitch())).toBe(45);
  const heights = await page.evaluate(async () => {
    const source = window.editorTestMap.getSource('campus') as import('maplibre-gl').GeoJSONSource;
    const data = await source.getData() as import('geojson').FeatureCollection;
    return data.features.filter(f => f.properties?.kind === 'building').map(f => [f.properties?.id, f.properties?.displayHeight, f.properties?.heightKind]);
  });
  expect(heights).toContainEqual(['unknown-building', 6, 'illustrative']);
  expect(heights).toContainEqual(['library', 15, 'recorded']);
  await page.getByRole('button', { name: 'Switch to 2D', exact: true }).click();
  await page.reload();
  await attachMap(page);
  await expect.poll(() => page.evaluate(() => window.editorTestMap.getPitch())).toBe(0);
  await focusCampus(page);
  await clickMap(page, [3.20012, 6.46022]);
  await expect(page.getByText('15 m · recorded height')).toBeVisible();
  await page.evaluate(() => window.editorTestMap.jumpTo({ center: [3.2007, 6.4603], zoom: 19, padding: { top: 0, right: 0, bottom: 0, left: 0 } }));
  await clickMap(page, [3.2007, 6.4603]);
  await expect(page.getByRole('dialog')).toContainText('Height unknown · illustrative 6 m block');
  await expect(page.getByRole('button', { name: 'Report building details' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('public initial camera includes the northern campus', async ({ page }) => {
  const { campus } = await setup(page, true);
  await page.goto('/');
  await attachMap(page);
  const corners = await page.evaluate(bounds => {
    const map = window.editorTestMap;
    return [bounds[0], bounds[1], [bounds[0][0], bounds[1][1]], [bounds[1][0], bounds[0][1]]].map(p => map.project(p as Position));
  }, campus.bounds);
  for (const point of corners) {
    expect(point.x).toBeGreaterThan(450);
    expect(point.x).toBeLessThan(1440);
    expect(point.y).toBeGreaterThan(0);
    expect(point.y).toBeLessThan(1000);
  }
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
      await page.getByRole('button', { name: '3D', exact: true }).click();
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
  await page.getByRole('button', { name: '3D', exact: true }).click();
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
  await page.getByRole('button', { name: '3D', exact: true }).click();
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
  await clickMap(page, [3.2005, 6.4601]);
  await clickMap(page, [3.2006, 6.4601]);
  await page.getByRole('button', { name: '3D', exact: true }).click();
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
    page.getByRole('button', { name: '3D', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Source review' }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/editor-mobile.png' });
});
