import type { Map as MapInstance } from 'maplibre-gl';
declare global {
  interface Window {
    editorTestMap: MapInstance;
    surveyGps?: (fix: GeolocationPosition) => void;
    surveyGpsWatchCount: number;
  }
}

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
