import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import type { Map as MapInstance } from 'maplibre-gl';
import { campusFixture } from '../fixture';
import { lasuCampus } from '../../src/campus-context';

type Hook = { memoizedState?: { current?: MapInstance }; next?: Hook };
type Fiber = { memoizedState?: Hook; return?: Fiber };
async function attach(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('.map-canvas');
    const key = Object.keys(el || {}).find((k) => k.startsWith('__reactFiber'));
    let fiber =
      el && key ? (el as unknown as Record<string, Fiber>)[key] : undefined;
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const value = hook.memoizedState?.current;
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
async function setup(
  page: Page,
  world: 'normal' | 'slow' | 'failed' = 'normal',
) {
  const data = campusFixture();
  data.places.push({
    id: 'gate',
    name: 'Main gate',
    category: 'entrance',
    coordinates: [3.2, 6.46],
    aliases: [],
    source: 'test',
    sourceId: 'gate',
    graphNode: 'a',
    arrivalKind: 'entrance',
  });
  const bytes = JSON.stringify(data);
  const manifest = {
    schemaVersion: 1,
    version: data.version,
    createdAt: data.createdAt,
    summary: 'Test campus',
    dataUrl: '/packages/globe-fixture/campus.json',
    bytes: Buffer.byteLength(bytes),
    assets: [
      {
        url: '/packages/globe-fixture/campus.json',
        bytes: Buffer.byteLength(bytes),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    ],
  };
  await page.addInitScript(() => {
    if (!localStorage.getItem('turnright:world-animation'))
      localStorage.setItem(
        'turnright:world-animation',
        JSON.stringify({ rotation: false, clouds: false }),
      );
  });
  await page.route('**/packages/campuses.json', (r) =>
    r.fulfill({
      json: {
        schemaVersion: 1,
        campuses: [
          { ...lasuCampus, manifestUrl: '/packages/latest.json' },
          {
            ...lasuCampus,
            id: 'north',
            slug: 'north-campus',
            name: 'North campus',
            manifestUrl: '/packages/north/manifest.json',
          },
        ],
      },
    }),
  );
  await page.route('**/packages/latest.json', (r) =>
    r.fulfill({ json: manifest }),
  );
  await page.route('**/packages/north/manifest.json', (r) =>
    r.fulfill({
      json: {
        ...manifest,
        campus: { id: 'north', slug: 'north-campus', name: 'North campus' },
      },
    }),
  );
  await page.route('**/packages/globe-fixture/campus.json', (r) =>
    r.fulfill({ body: bytes, contentType: 'application/json' }),
  );
  let release: (() => void) | undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  if (world !== 'normal')
    await page.route('**/world/countries-50m-v5.1.2.geojson', async (r) => {
      if (world === 'failed')
        return r.fulfill({ status: 503, body: 'Offline' });
      await wait;
      await r.continue();
    });
  await page.goto('/');
  await attach(page);
  return { release: release!, data };
}
async function open(page: Page) {
  await page
    .getByRole('button', { name: 'Choose a campus', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Choose a campus' }),
  ).toBeVisible();
}
async function camera(page: Page) {
  return page.evaluate(() => {
    const m = window.editorTestMap;
    return {
      center: m.getCenter().toArray(),
      zoom: m.getZoom(),
      pitch: m.getPitch(),
      bearing: m.getBearing(),
    };
  });
}
async function pixels(page: Page) {
  const encoded = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const map = window.editorTestMap;
        map.once('render', () => {
          const gl = map.getCanvas().getContext('webgl2')!;
          const data = new Uint8Array(
            gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
          );
          gl.readPixels(
            0,
            0,
            gl.drawingBufferWidth,
            gl.drawingBufferHeight,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            data,
          );
          const chunks = [];
          for (let i = 0; i < data.length; i += 8192)
            chunks.push(String.fromCharCode(...data.subarray(i, i + 8192)));
          resolve(btoa(chunks.join('')));
        });
        map.triggerRepaint();
      }),
  );
  return Buffer.from(encoded, 'base64');
}

test('globe search frames the current campus, restores focus, and preserves the mounted map', async ({
  page,
}) => {
  await setup(page);
  await open(page);
  await expect.poll(async () => (await camera(page)).zoom).toBeLessThan(4);
  await page.waitForFunction(() => !window.editorTestMap.isMoving());
  expect((await camera(page)).pitch).toBe(0);
  expect((await camera(page)).bearing).toBe(0);
  await page.evaluate(() =>
    window.editorTestMap.getCanvas().setAttribute('data-identity', 'original'),
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Choose a campus', exact: true }),
  ).toBeFocused();
  expect((await camera(page)).zoom).toBeLessThan(4);
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.getPadding().right))
    .toBe(24);
  await open(page);
  await page
    .getByRole('button', { name: lasuCampus.name, exact: true })
    .click();
  await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThan(12);
  await expect(page.locator('.maplibregl-canvas')).toHaveAttribute(
    'data-identity',
    'original',
  );
  await page.context().setOffline(true);
  await open(page);
  await expect.poll(async () => (await camera(page)).zoom).toBeLessThan(4);
  await page.context().setOffline(false);
  await page.getByRole('button', { name: 'North campus', exact: true }).click();
  await expect(page).toHaveURL(/campus=north-campus/);
});

test('globe search cancels deferred framing when closed and remains usable on world failure', async ({
  page,
}) => {
  const slow = await setup(page, 'slow');
  await open(page);
  const before = await camera(page);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  slow.release();
  await page.waitForFunction(() => !!window.editorTestMap.getSource('world'));
  expect(await camera(page)).toEqual(before);
  await page.unroute('**/world/countries-50m-v5.1.2.geojson');
  await page.route('**/world/countries-50m-v5.1.2.geojson', (r) =>
    r.fulfill({ status: 503, body: 'Offline' }),
  );
  await page.reload();
  await attach(page);
  await open(page);
  await page
    .getByRole('searchbox', { name: 'Search published campuses' })
    .fill('North');
  await expect(
    page.getByRole('button', { name: 'North campus', exact: true }),
  ).toBeVisible();
  expect((await camera(page)).zoom).toBeGreaterThan(12);
});

test('globe search protects active directions and follow until a campus switch is confirmed', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition(callback: (p: GeolocationPosition) => void) {
          window.surveyGps = callback;
          return 1;
        },
        clearWatch() {
          window.surveyGps = undefined;
        },
      },
    }),
  );
  await setup(page);
  await page.getByRole('textbox', { name: 'Search campus' }).fill('Library');
  await page
    .getByRole('button', { name: /Library/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Directions', exact: true }).click();
  await page.getByLabel('Starting place').selectOption('gate');
  await page
    .getByRole('button', { name: 'Start walking', exact: true })
    .click();
  await page.waitForFunction(() => !!window.surveyGps);
  await page.evaluate(() =>
    window.surveyGps!({
      coords: {
        longitude: 3.20002,
        latitude: 6.46,
        accuracy: 5,
        heading: 90,
        speed: 1,
      } as GeolocationCoordinates,
      timestamp: Date.now(),
    } as GeolocationPosition),
  );
  await expect(
    page.getByRole('button', { name: 'Stop navigation', exact: true }),
  ).toBeVisible();
  await page.waitForFunction(() => !window.editorTestMap.isMoving());
  const before = await camera(page);
  await open(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await camera(page)).toEqual(before);
  await page.getByRole('button', { name: 'North campus', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Stop and switch campus', exact: true }),
  ).toBeVisible();
  expect(await camera(page)).toEqual(before);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Stop navigation', exact: true }),
  ).toBeVisible();
  const watches = await page.evaluate(() => !!window.surveyGps);
  expect(watches).toBe(true);
  await open(page);
  await page.getByRole('button', { name: 'North campus', exact: true }).click();
  await page
    .getByRole('button', { name: 'Stop and switch campus', exact: true })
    .click();
  await expect(page).toHaveURL(/campus=north-campus/);
});

test('globe search mobile landscape observes container changes without a window resize', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await open(page);
  await expect.poll(async () => (await camera(page)).zoom).toBeLessThan(4);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  for (const size of [
    { width: 844, height: 390 },
    { width: 667, height: 375 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(() =>
        page.evaluate(() => window.editorTestMap.getCanvas().clientHeight),
      )
      .toBe(size.height);
    await open(page);
    await page.waitForFunction(() => !window.editorTestMap.isMoving());
    const layout = await page.evaluate(() => {
      const m = window.editorTestMap,
        r = m.getContainer().getBoundingClientRect(),
        p = m.getPadding();
      const c = m.project(m.getCenter());
      return {
        y: c.y,
        expected: (p.top + r.height - p.bottom) / 2,
        pitch: m.getPitch(),
      };
    });
    expect(layout.y).toBeCloseTo(layout.expected, 0);
    expect(layout.pitch).toBe(0);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.screenshot({
      path: info.outputPath(`globe-${size.width}x${size.height}.png`),
    });
  }
  // Reproduces dynamic CSS/browser chrome sizing: no synthetic window.resize.
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('.app-shell')!.style.height = '350px';
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.editorTestMap.getCanvas().clientHeight),
    )
    .toBe(350);
});

test('globe search stars change with orientation, occlude behind Earth, persist and recover WebGL', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  await open(page);
  await expect.poll(async () => (await camera(page)).zoom).toBeLessThan(4);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Hide stars', exact: true }),
  ).toBeVisible();
  await page.waitForFunction(() => !window.editorTestMap.isMoving());
  const initial = await camera(page),
    a = await pixels(page);
  await page.screenshot({ path: info.outputPath('stars-africa.png') });
  await page.evaluate(() =>
    window.editorTestMap.jumpTo({ center: [150, -20], bearing: 25, pitch: 10 }),
  );
  const b = await pixels(page);
  expect(a).not.toEqual(b);
  await page.screenshot({ path: info.outputPath('stars-pacific.png') });
  await page.evaluate(
    (c) =>
      window.editorTestMap.jumpTo({
        ...c,
        center: c.center as [number, number],
      }),
    initial,
  );
  const restored = await pixels(page);
  // Compare the sky, independently of asynchronously fading map labels/tiles.
  const sky = (pixels: Buffer) =>
    createHash('sha256')
      .update(pixels.subarray(0, 844 * 32 * 4))
      .digest('hex');
  expect(sky(restored)).toBe(sky(a));
  await page.getByRole('button', { name: 'Hide stars', exact: true }).click();
  // Settle symbol placement separately so the occlusion check measures stars.
  await page.waitForFunction(
    () => window.editorTestMap.loaded() && !window.editorTestMap.isMoving(),
  );
  const without = await pixels(page);
  await page.getByRole('button', { name: 'Show stars', exact: true }).click();
  const withStars = await pixels(page);
  let differences = 0,
    middle = 0;
  const centre = await page.evaluate(() => {
    const m = window.editorTestMap,
      p = m.project(m.getCenter());
    return [p.x, m.getCanvas().height - p.y];
  });
  for (let i = 0; i < withStars.length; i += 4)
    if (
      withStars[i] !== without[i] ||
      withStars[i + 1] !== without[i + 1] ||
      withStars[i + 2] !== without[i + 2]
    ) {
      differences++;
      const x = (i / 4) % 844,
        y = Math.floor(i / 4 / 844);
      if (Math.hypot(x - centre[0], y - centre[1]) < 45) middle++;
    }
  expect(differences).toBeGreaterThan(30);
  expect(middle).toBe(0);
  await page.getByRole('button', { name: 'Hide stars', exact: true }).click();
  await page.reload();
  await attach(page);
  await open(page);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Show stars', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Show stars', exact: true }).click();
  const supported = await page.evaluate(() => {
    const gl = window.editorTestMap.getCanvas().getContext('webgl2')!;
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 150);
    return true;
  });
  if (supported) {
    await page.waitForFunction(
      () =>
        !window.editorTestMap
          .getCanvas()
          .getContext('webgl2')!
          .isContextLost() &&
        !!window.editorTestMap.getLayer('world-stars') &&
        window.editorTestMap.loaded(),
    );
    const recovered = await pixels(page);
    expect(recovered.some((v, i) => i % 4 !== 3 && v > 32)).toBe(true);
    await expect(
      page.getByText('Map graphics paused.', { exact: false }),
    ).toBeHidden();
    await expect(
      page.getByText('Stars unavailable', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Hide stars', exact: true }),
    ).toBeEnabled();
  }
});

test('globe search keeps navy stars in both themes and the sunlit horizon only in light mode', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await setup(page);
  await open(page);
  await expect.poll(async () => (await camera(page)).zoom).toBeLessThan(4);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.waitForFunction(
    () => window.editorTestMap.loaded() && !window.editorTestMap.isMoving(),
  );
  const light = await page.evaluate(() => window.editorTestMap.getSky());
  expect(light['atmosphere-blend']).toEqual([
    'interpolate',
    ['linear'],
    ['zoom'],
    0,
    0.55,
    5,
    0.55,
    8,
    0,
  ]);
  const a = await pixels(page);
  await page.screenshot({ path: info.outputPath('globe-light-africa.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect
    .poll(() =>
      page.evaluate(() => window.editorTestMap.getSky()['atmosphere-blend']),
    )
    .toBe(0);
  await pixels(page);
  await page.screenshot({ path: info.outputPath('globe-dark-africa.png') });
  const darkSky = await page.evaluate(() => window.editorTestMap.getSky());
  expect(darkSky['horizon-color']).toBe('#080f20');
  const hashes = new Set<string>();
  for (const centre of [
    [150, -20],
    [-179, 20],
    [179, 20],
    [0, 85],
    [0, -85],
  ]) {
    await page.evaluate(
      (center) =>
        window.editorTestMap.jumpTo({
          center: center as [number, number],
          bearing: 25,
          pitch: 10,
        }),
      centre,
    );
    const data = await pixels(page);
    hashes.add(
      createHash('sha256')
        .update(data.subarray(0, 1440 * 24 * 4))
        .digest('hex'),
    );
  }
  expect(hashes.size).toBe(5);
  await page.evaluate(() =>
    window.editorTestMap.jumpTo({ center: [150, -20], bearing: 0, pitch: 0 }),
  );
  await pixels(page);
  await page.screenshot({ path: info.outputPath('globe-dark-pacific.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect
    .poll(() =>
      page.evaluate(() => window.editorTestMap.getSky()['horizon-color']),
    )
    .toBe('#d8e8f2');
  await pixels(page);
  await page.screenshot({ path: info.outputPath('globe-light-pacific.png') });
  expect(a.some((v, i) => i % 4 !== 3 && v > 32)).toBe(true);
  await page.evaluate(() => window.editorTestMap.jumpTo({ zoom: 6 }));
  await expect
    .poll(() =>
      page
        .locator('.map-canvas')
        .evaluate((el) =>
          (el as HTMLElement).style.getPropertyValue('--space'),
        ),
    )
    .toBe('0%');
});
