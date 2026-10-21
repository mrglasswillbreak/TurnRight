import { expect, type Page } from './coverage-fixture';
import { createHash } from 'node:crypto';
import type { Map as MapInstance } from 'maplibre-gl';
import { campusFixture } from '../fixture';
import { lasuCampus } from '../../src/campus-context';
import { registerSearchAndNavigation } from './globe-search-search-and-navigation';
import { registerRendering } from './globe-search-rendering';
export type Hook = { memoizedState?: { current?: MapInstance }; next?: Hook };
export type Fiber = { memoizedState?: Hook; return?: Fiber };
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
        if (
          typeof value?.getCanvas === 'function' &&
          typeof value?.project === 'function'
        ) {
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
    category: 'other',
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
async function settledWorld(page: Page) {
  await page.waitForFunction(() => {
    const map = window.editorTestMap;
    return (
      map.loaded() &&
      !map.isMoving() &&
      !!map.getLayer('world-stars') &&
      map.queryRenderedFeatures({ layers: ['world-country-labels'] }).length > 5
    );
  });
  // The map's label fade continues after tiles become queryable.
  await page.waitForTimeout(350);
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
const fixture = () => ({ attach, setup, open, camera, settledWorld, pixels });
export type GlobeSearchFixture = ReturnType<typeof fixture>;
registerSearchAndNavigation(fixture);
registerRendering(fixture);
