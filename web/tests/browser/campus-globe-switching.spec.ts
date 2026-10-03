import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import type { Map as MapInstance } from 'maplibre-gl';
import { campusFixture } from '../fixture';
import { lasuCampus } from '../../src/campus-context';

type Hook = { memoizedState?: { current?: MapInstance }; next?: Hook };
type Fiber = { memoizedState?: Hook; return?: Fiber };
let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(() =>
  expect(errors, 'No camera or application errors').toEqual([]),
);
async function attach(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('.map-canvas');
    const key = Object.keys(el || {}).find((k) => k.startsWith('__reactFiber'));
    let fiber =
      el && key ? (el as unknown as Record<string, Fiber>)[key] : undefined;
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const map = hook.memoizedState?.current;
        if (map?.getCanvas && map?.project) {
          window.editorTestMap = map;
          return map.loaded() && !!map.getSource('published-campuses');
        }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return false;
  });
  await page
    .locator('.maplibregl-canvas')
    .evaluate((el) => el.setAttribute('data-instance', 'original'));
}

async function setup(page: Page, overlap = false) {
  const entries = ['lasu', 'north', 'east'].map((slug, index) => {
    const data = campusFixture();
    const offset = index * 0.2;
    data.version = `globe-${slug}`;
    data.sources = [{ id: slug, name: slug, url: 'https://example.test', license: 'Test',
      attribution: `${slug} campus source`, retrievedAt: data.createdAt }];
    data.bounds = data.bounds.map(([x, y]) => [
      x + offset,
      y,
    ]) as typeof data.bounds;
    if (data.boundary.geometry.type === 'Polygon')
      data.boundary.geometry.coordinates =
        data.boundary.geometry.coordinates.map((ring) =>
          ring.map(([x, y]) => [x + offset, y]),
        );
    data.places = data.places.map((p) => ({
      ...p,
      name: `${slug} library`,
      coordinates: [p.coordinates[0] + offset, p.coordinates[1]],
    }));
    data.graph.nodes = data.graph.nodes.map((p) => ({
      ...p,
      coordinates: [p.coordinates[0] + offset, p.coordinates[1]],
    }));
    const bytes = JSON.stringify(data);
    const campus = {
      id: slug,
      slug,
      name: slug === 'lasu' ? lasuCampus.name : `${slug} campus`,
    };
    const url = `/packages/globe-${slug}/campus.json`;
    return {
      data,
      bytes,
      campus,
      manifest: {
        schemaVersion: 1,
        version: data.version,
        createdAt: data.createdAt,
        summary: 'Test campus',
        campus,
        dataUrl: url,
        bytes: Buffer.byteLength(bytes),
        assets: [
          {
            url,
            bytes: Buffer.byteLength(bytes),
            sha256: createHash('sha256').update(bytes).digest('hex'),
          },
        ],
      },
    };
  });
  const directory = {
    schemaVersion: 1,
    campuses: entries.map(({ campus, data }) => ({
      ...campus,
      bounds: data.bounds,
      outline: overlap
        ? entries[1].data.boundary.geometry
        : data.boundary.geometry,
      manifestUrl: `/packages/globe-${campus.slug}/manifest.json`,
    })),
  };
  await page.addInitScript(() =>
    localStorage.setItem(
      'turnright:world-animation',
      JSON.stringify({ rotation: false, clouds: false }),
    ),
  );
  await page.route('**/packages/campuses.json', (route) =>
    route.fulfill({ json: directory }),
  );
  for (const { manifest, bytes, campus } of entries) {
    await page.route(`**/packages/globe-${campus.slug}/manifest.json`, (r) =>
      r.fulfill({ json: manifest }),
    );
    await page.route(`**${manifest.dataUrl}`, (r) =>
      r.fulfill({ body: bytes, contentType: 'application/json' }),
    );
  }
  await page.route('**/packages/latest.json', (r) =>
    r.fulfill({ json: entries[0].manifest }),
  );
  await page.goto('/?campus=lasu');
  await attach(page);
  return entries;
}
async function choose(page: Page, name: string) {
  await page
    .getByRole('button', { name: 'Choose a campus', exact: true })
    .click();
  await page.getByRole('button', { name, exact: true }).click();
}
async function selected(page: Page, slug: string) {
  await expect(page).toHaveURL(new RegExp(`campus=${slug}`));
  await expect(page.locator('.maplibregl-canvas')).toHaveAttribute(
    'data-instance',
    'original',
  );
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('turnright:last-campus')),
    )
    .toBe(slug);
}
async function point(page: Page, coords: [number, number]) {
  return page.evaluate((coordinates) => {
    const p = window.editorTestMap.project(coordinates);
    const rect = window.editorTestMap.getCanvas().getBoundingClientRect();
    return { x: rect.left + p.x, y: rect.top + p.y };
  }, coords);
}

test('campus globe switches in place, restores scoped preferences and follows browser history', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(async () => {
    const { setPreference } = await import('/src/offline.ts');
    await setPreference('saved', ['library'], 'north');
    await setPreference('recent', ['library'], 'north');
    await setPreference('saved', [], 'lasu');
  });
  await choose(page, 'north campus');
  await selected(page, 'north');
  await expect(page.locator('.maplibregl-ctrl-attrib-inner')).toContainText('north campus source');
  await expect(page.locator('.maplibregl-ctrl-attrib-inner')).not.toContainText('lasu campus source');
  await page.waitForFunction(() => window.editorTestMap.getZoom() > 12 && !window.editorTestMap.isMoving());
  expect(await page.evaluate(() => window.editorTestMap.getBearing())).toBe(0);
  expect(
    await page.evaluate(() => window.editorTestMap.getZoom()),
  ).toBeGreaterThan(12);
  await page.getByRole('textbox', { name: 'Search campus' }).fill('north');
  await expect(
    page.getByRole('button', { name: /north library Library/ }),
  ).toBeVisible();
  await choose(page, 'east campus');
  await selected(page, 'east');
  await expect(
    page.getByRole('textbox', { name: 'Search campus' }),
  ).toHaveValue('');
  await page.goBack();
  await selected(page, 'north');
  await page.getByRole('button', { name: 'Saved', exact: true }).click();
  await expect(page.getByRole('button', { name: /north library Library/ })).toBeVisible();
  await page.goBack();
  await selected(page, 'lasu');
  await page.getByRole('button', { name: 'Saved', exact: true }).click();
  await expect(page.getByRole('button', { name: /lasu library Library/ })).toHaveCount(0);
  await page.goForward();
  await selected(page, 'north');
});

test('campus globe resolves shared history against the target campus and cancels a pending selection on Back', async ({ page }) => {
  const entries = await setup(page);
  await page.evaluate(() => {
    history.replaceState(null, '', '/?campus=lasu&place=library');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'lasu library', exact: true })).toBeVisible();
  await choose(page, 'north campus');
  await selected(page, 'north');
  await page.goBack();
  await selected(page, 'lasu');
  await expect(page.getByRole('heading', { name: 'lasu library', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'north library', exact: true })).toHaveCount(0);
  await page.evaluate(() => history.pushState(null, '', '/?campus=lasu'));
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/packages/globe-north/campus.json', async (r) => { await held; await r.fulfill({ body: entries[1].bytes, contentType: 'application/json' }).catch(() => {}); });
  await choose(page, 'north campus');
  await expect(page.getByText('Opening north campus…', { exact: true })).toBeVisible();
  await page.goBack();
  await selected(page, 'lasu');
  release();
  await expect(page.getByText('Opening north campus…', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'lasu library', exact: true })).toBeVisible();
});

test('campus globe manual gestures interrupt flights without reverting the campus or 2D preference', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Switch to 2D', exact: true }).click();
  await choose(page, 'east campus');
  await selected(page, 'east');
  await page.waitForFunction(() => window.editorTestMap.isMoving());
  const box = (await page.locator('.maplibregl-canvas').boundingBox())!;
  const x = box.x + box.width * 0.8, y = box.y + box.height * 0.25;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 65, y + 45, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => !window.editorTestMap.isMoving());
  await selected(page, 'east');
  await expect(page.getByRole('button', { name: 'Switch to 3D', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.editorTestMap.getPitch())).toBe(0);
});

test('campus globe silhouette and pin clicks share selection and leave detailed places clickable', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() =>
    window.editorTestMap.jumpTo({
      center: [3.4025, 6.4725],
      zoom: 11.4,
      pitch: 0,
    }),
  );
  await page.waitForFunction(() => window.editorTestMap.loaded());
  let hit = await point(page, [3.405, 6.48]);
  await page.mouse.click(hit.x, hit.y);
  await selected(page, 'north');
  await page.waitForFunction(() => window.editorTestMap.getZoom() > 12 && !window.editorTestMap.isMoving());
  await page.evaluate(() => window.editorTestMap.jumpTo({ center: [3.401, 6.46], zoom: 17 }));
  await page.waitForFunction(() => window.editorTestMap.loaded());
  const library = await point(page, [3.401, 6.46]);
  await page.mouse.click(library.x, library.y);
  await expect(
    page.getByRole('button', { name: 'Directions', exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.editorTestMap.jumpTo({
      center: [3.6025, 6.4725],
      zoom: 8,
      pitch: 0,
    }),
  );
  await page.waitForFunction(() => window.editorTestMap.loaded());
  hit = await point(page, [3.6025, 6.4725]);
  await page.mouse.click(hit.x, hit.y);
  await selected(page, 'east');
});

test('campus globe overlap chooser stays non-modal and can select on the map while open', async ({
  page,
}) => {
  await setup(page, true);
  await page.evaluate(() =>
    window.editorTestMap.jumpTo({
      center: [3.4025, 6.4725],
      zoom: 11.3,
      pitch: 0,
    }),
  );
  await page.waitForFunction(() => window.editorTestMap.loaded());
  const hit = await point(page, [3.405, 6.48]);
  await page.mouse.click(hit.x, hit.y);
  await expect(
    page.getByRole('dialog', { name: 'Choose a campus here' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).not.toHaveAttribute(
    'aria-modal',
    'true',
  );
  await expect(page.locator('.maplibregl-canvas')).not.toHaveAttribute('inert');
  await page.getByRole('button', { name: 'east campus', exact: true }).click();
  await selected(page, 'east');
});

test('campus globe failed and superseded loads keep the last successful selection, with retry', async ({
  page,
}) => {
  const entries = await setup(page);
  await page.route('**/packages/globe-north/campus.json', (r) =>
    r.fulfill({ status: 503 }),
  );
  await choose(page, 'north campus');
  await expect(page.getByText(/Could not open north campus/)).toBeVisible();
  await selected(page, 'lasu');
  await page.unroute('**/packages/globe-north/campus.json');
  await page.route('**/packages/globe-north/campus.json', (r) =>
    r.fulfill({ body: entries[1].bytes, contentType: 'application/json' }),
  );
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await selected(page, 'north');
  await choose(page, lasuCampus.name);
  await selected(page, 'lasu');
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/packages/globe-north/campus.json', async (r) => {
    await held;
    await r
      .fulfill({ body: entries[1].bytes, contentType: 'application/json' })
      .catch(() => {});
  });
  await choose(page, 'north campus');
  await expect(
    page.getByText('Opening north campus…', { exact: true }),
  ).toBeVisible();
  await choose(page, 'east campus');
  await selected(page, 'east');
  release();
  await expect(
    page.getByText('Opening north campus…', { exact: true }),
  ).toHaveCount(0);
  await page.waitForTimeout(500);
  await selected(page, 'east');
});

test('campus globe uses verified offline targets, refuses missing downloads and respects reduced motion', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const entries = await setup(page);
  await page.evaluate(async (manifest) => {
    const { installPackage } = await import('/src/offline.ts');
    await installPackage(manifest, () => {});
  }, entries[1].manifest);
  // Vite has no service worker: prepare the lazy globe UI before disconnecting.
  await page.getByRole('button', { name: 'Choose a campus', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hide stars', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await context.setOffline(true);
  await choose(page, 'north campus');
  await selected(page, 'north');
  await page.waitForFunction(() => window.editorTestMap.getZoom() > 12);
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
  await choose(page, 'east campus');
  await expect(page.getByText(/This campus is not downloaded/)).toBeVisible();
  await selected(page, 'north');
  await context.setOffline(false);
});
