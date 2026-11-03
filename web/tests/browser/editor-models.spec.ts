import { collapseExplorer } from './editor-navigation';
import { test, expect } from './coverage-fixture';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { CampusPhoto } from '../../src/types';
import { createBuildingModel } from '../../src/building-model';
import type { BuildingVisual } from '../../src/visual-types';
import { setup } from './editor-fixture';
import {
  attachMap,
  position,
  clickMap,
  focusCampus,
} from './editor-map-helpers';
import { openBuildingModel, focusModels } from './editor-model-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test(
  'prepared public map verifies enhanced architecture, repairs corruption and reopens it offline',
  { tag: '@offline' },
  async ({ page, context }, testInfo) => {
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
    await page
      .getByRole('button', { name: 'Expand card', exact: true })
      .click();
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
    await page
      .getByRole('button', { name: 'Expand card', exact: true })
      .click();
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
  },
);

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
    await collapseExplorer(page);
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
    await page
      .getByRole('dialog', { name: 'Edit & optimise photos' })
      .getByRole('button', { name: 'Use for map', exact: true })
      .click();
    await expect.poll(() => started).toBe(true);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page
      .getByRole('button', { name: 'Toggle explorer', exact: true })
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

test('review separate building wings, edit their geometry, save and undo without changing identity', async ({
  page,
}) => {
  test.setTimeout(120000);
  const server = await setup(page, true);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await collapseExplorer(page);
  await page.evaluate(
    () =>
      void window.editorTestMap.jumpTo({
        center: [3.19978, 6.47109],
        zoom: 18,
        pitch: 0,
        padding: { top: 0, right: 300, bottom: 0, left: 0 },
      }),
  );
  await clickMap(page, [3.1997, 6.47128]);
  const chooser = page.getByRole('dialog', {
    name: 'Choose overlapping feature',
  });
  if (await chooser.isVisible())
    await chooser.getByRole('button', { name: /building .*120$/ }).click();
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
  const model = await openBuildingModel(page, 'outline');
  await model
    .getByRole('button', { name: 'Edit surface', exact: true })
    .click();
  const handle = model.locator('[data-outline-vertex]').first();
  const from = (await handle.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from.x + from.width / 2 + 10,
    from.y + from.height / 2,
    { steps: 6 },
  );
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
  test(`published legacy models remain visible on the ${phone ? 'phone' : 'desktop'} public map`, async ({
    page,
  }, info) => {
    if (phone) await page.setViewportSize({ width: 390, height: 844 });
    const {
      buildings: [{ feature, visual }],
    } = JSON.parse(
      readFileSync(
        new URL('../fixtures/published-model-revisions.json', import.meta.url),
        'utf8',
      ),
    ) as {
      buildings: {
        feature: import('geojson').Feature<
          import('geojson').Polygon | import('geojson').MultiPolygon
        >;
        visual: BuildingVisual;
      }[];
    };
    const sectorUrl = '/packages/visual-abcdef/published-legacy.json';
    const sectorBody = JSON.stringify({
      schemaVersion: 1,
      id: 'published-legacy',
      models: [
        {
          ...createBuildingModel(feature, visual),
          detailRevision: visual.detailRevision,
        },
      ],
    });
    await page
      .context()
      .route(`**${sectorUrl}`, (route) =>
        route.fulfill({ body: sectorBody, contentType: 'application/json' }),
      );
    await setup(page, true, false, {
      mutateCampus(data) {
        data.map.features = data.map.features.map((f) =>
          f.properties?.id === visual.id ? feature : f,
        );
        data.visuals = {
          schemaVersion: 1,
          revision: 'published-legacy',
          buildings: [visual],
          references: [],
          bytes: Buffer.byteLength(sectorBody),
          sectors: [
            {
              id: 'published-legacy',
              url: sectorUrl,
              bytes: Buffer.byteLength(sectorBody),
              sha256: createHash('sha256').update(sectorBody).digest('hex'),
              bounds: data.bounds,
              buildingIds: [visual.id],
            },
          ],
        };
      },
    });
    await page.goto('/');
    await attachMap(page);
    await focusModels(page, phone);
    const calls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const map = window.editorTestMap;
          const layer = (
            map.getLayer('campus-models') as unknown as {
              implementation: import('maplibre-gl').CustomLayerInterface;
            }
          ).implementation;
          const render = layer.render;
          layer.render = function (gl, args) {
            const draw = gl.drawElements;
            let calls = 0;
            gl.drawElements = function (...args) {
              calls++;
              return draw.apply(this, args);
            };
            try {
              render.call(this, gl, args);
            } finally {
              gl.drawElements = draw;
              layer.render = render;
              resolve(calls);
            }
          };
          map.triggerRepaint();
        }),
    );
    expect(calls).toBeGreaterThan(0);
    await page.screenshot({
      path: info.outputPath('published-legacy-model.png'),
    });
  });

for (const phone of [false, true])
  test(`miniature models: ${phone ? 'phone' : 'desktop'} LOD, picking, appearance and simple preference`, async ({
    page,
  }) => {
    test.setTimeout(180000);
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
    await page.evaluate(() => void window.editorTestMap.jumpTo({ zoom: 14 }));
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
