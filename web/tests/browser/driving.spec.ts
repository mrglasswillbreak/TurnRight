import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { campusFixture } from '../fixture';

async function setup(page: Page, driving = true) {
  const campus = campusFixture();
  campus.places.push({
    ...campus.places[0],
    id: 'gate',
    name: 'Main gate',
    graphNode: 'a',
    coordinates: campus.graph.nodes.find((n) => n.id === 'a')!.coordinates,
  });
  if (driving) {
    campus.schemaVersion = 2;
    campus.driving = {
      version: 1,
      restrictions: [],
      parking: [
        {
          id: 'parking',
          name: 'Library parking',
          kind: 'parking',
          access: 'yes',
          vehicleNodeId: 'b',
          walkingNodeId: 'b',
        },
      ],
    };
    campus.graph.edges.forEach((e) => {
      e.vehicle = { access: 'yes', direction: 'both' };
      e.vehicleAllowed = true;
    });
  }
  const bytes = JSON.stringify(campus);
  await page.context().route('**/packages/latest.json', (route) =>
    route.fulfill({
      json: {
        schemaVersion: campus.schemaVersion,
        version: campus.version,
        createdAt: campus.createdAt,
        summary: 'Driving fixture',
        dataUrl: '/packages/fixture/campus.json',
        bytes: Buffer.byteLength(bytes),
        assets: [
          {
            url: '/packages/fixture/campus.json',
            bytes: Buffer.byteLength(bytes),
            sha256: createHash('sha256').update(bytes).digest('hex'),
          },
        ],
      },
    }),
  );
  await page
    .context()
    .route('**/packages/fixture/campus.json', (route) =>
      route.fulfill({ json: campus }),
    );
  await page.addInitScript(() => {
    const callbacks = new Map<number, PositionCallback>();
    let id = 0;
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: (callback: PositionCallback) => {
          callbacks.set(++id, callback);
          return id;
        },
        clearWatch: (key: number) => callbacks.delete(key),
        getCurrentPosition: () => {},
      },
    });
    Object.assign(window, {
      drivingFix: (longitude: number, latitude: number) =>
        callbacks.forEach((callback) =>
          callback({
            coords: {
              longitude,
              latitude,
              accuracy: 3,
              speed: 0,
              heading: 90,
              altitude: null,
              altitudeAccuracy: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition),
        ),
    });
  });
  await page.goto('/?place=library');
  await page.getByRole('button', { name: 'Directions', exact: true }).click();
  await page.getByLabel('Starting place').selectOption('gate');
  await expect(
    page.getByRole('button', { name: 'Start walking', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Travel mode', { exact: true }).selectOption('driving');
  return campus;
}

for (const width of [1440, 390])
  test(`drive, park, and walk at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const campus = await setup(page);
    await expect(
      page.getByRole('button', { name: 'Start driving', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Fastest estimated journey', { exact: false }),
    ).toBeVisible();
    await page
      .getByLabel('Parking or drop-off', { exact: true })
      .selectOption('parking');
    await page
      .getByRole('button', { name: 'Start driving', exact: true })
      .click();
    const fix = async (id: string) => {
      const coordinates = campus.graph.nodes.find(
        (n) => n.id === id,
      )!.coordinates;
      await page.evaluate(
        ([lng, lat]) =>
          (
            window as unknown as {
              drivingFix: (lng: number, lat: number) => void;
            }
          ).drivingFix(lng, lat),
        coordinates,
      );
    };
    await fix('a');
    await expect(
      page.getByRole('button', { name: 'Stop navigation', exact: true }),
    ).toBeVisible();
    for (let i = 0; i < 3; i++) {
      await fix('b');
      await page.waitForTimeout(100);
    }
    await expect(
      page.getByRole('button', { name: 'Parked—start walking', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Parked—start walking', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Parked—start walking', exact: true }),
    ).not.toBeVisible();
    for (let i = 0; i < 3; i++) {
      await fix('c');
      await page.waitForTimeout(100);
    }
    await expect(
      page.getByText('Mapped route complete', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Finish navigation', exact: true })
      .click();
    await page.reload();
    await page.getByRole('button', { name: 'Directions', exact: true }).click();
    await expect(page.getByLabel('Travel mode', { exact: true })).toHaveValue(
      'driving',
    );
  });

test('older campus package explains driving unavailability and still routes walking', async ({
  page,
}) => {
  await setup(page, false);
  await expect(
    page.getByRole('alert').filter({ hasText: 'updated campus map' }),
  ).toBeVisible();
  await page.getByLabel('Travel mode', { exact: true }).selectOption('walking');
  await expect(
    page.getByRole('button', { name: 'Start walking', exact: true }),
  ).toBeVisible();
});

test('prepared offline driving survives a cold reload with bundled voice', async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    !testInfo.config.configFile?.includes('pwa.config'),
    'Requires production service worker.',
  );
  await setup(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.goto('/');
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  await page.getByRole('button', { name: 'Offline', exact: true }).click();
  await page
    .getByRole('button', { name: 'Download campus map', exact: true })
    .click();
  await expect(
    page.getByText('Ready offline', { exact: true }).first(),
  ).toBeVisible();
  await context.setOffline(true);
  await page.goto('/?place=library');
  await page.getByRole('button', { name: 'Directions', exact: true }).click();
  await page.getByLabel('Starting place').selectOption('gate');
  await expect(page.getByLabel('Travel mode', { exact: true })).toHaveValue(
    'driving',
  );
  await expect(
    page.getByRole('button', { name: 'Start driving', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const response = await fetch('/voice/en-GB-v1/manifest.json');
      if (!response.ok) return false;
      const pack = await response.json();
      return (
        await Promise.all(
          ['depart-driving', 'arrive-parking', 'roundabout'].map((key) =>
            fetch(pack.clips[key].url).then(
              async (response) =>
                response.ok &&
                (await response.arrayBuffer()).byteLength ===
                  pack.clips[key].bytes,
            ),
          ),
        )
      ).every(Boolean);
    }),
  ).toBe(true);
});
