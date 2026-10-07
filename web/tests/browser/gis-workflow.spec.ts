import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CampusData, CampusPackage } from '../../src/types';
import type { Map as MapInstance } from 'maplibre-gl';
import { campusLayers } from '../../src/campus-layers';
import { campusFixture } from '../fixture';
import { lasuCampus } from '../../src/campus-context';
import type {
  Dataset,
  GisActionMap,
  ProcessingJob,
  ReviewSubmission,
  WorkspaceCapabilities,
} from '../../src/gis-types';
type GisCall = {
  [A in keyof GisActionMap]: { action: A; payload: GisActionMap[A]['request'] };
}[keyof GisActionMap];
type LegacyCall = {
  action: 'state' | 'sources' | 'review-status' | 'survey-list' | 'save-edits';
  payload: Record<string, unknown>;
};
async function setup(
  page: Page,
  roles: WorkspaceCapabilities['roles'] = ['administrator'],
) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const capture = process.env.TURNRIGHT_GIS_SCREENSHOTS === '1';
  const manifest: CampusPackage | undefined = capture
    ? JSON.parse(
        readFileSync(
          new URL(
            '../../work/model-benchmark/public/packages/latest.json',
            import.meta.url,
          ),
          'utf8',
        ),
      )
    : undefined;
  const data: CampusData = manifest
    ? JSON.parse(
        readFileSync(
          new URL(
            '../../work/model-benchmark/public' + manifest.dataUrl,
            import.meta.url,
          ),
          'utf8',
        ),
      )
    : campusFixture();
  if (manifest)
    for (const asset of manifest.assets)
      await page.route('**' + asset.url, (r) =>
        r.fulfill({
          body: readFileSync(
            new URL(
              '../../work/model-benchmark/public' + asset.url,
              import.meta.url,
            ),
          ),
          contentType: asset.url.endsWith('.json')
            ? 'application/json'
            : asset.url.endsWith('.webp')
              ? 'image/webp'
              : 'application/octet-stream',
        }),
      );
  if (capture) data.layers = campusLayers(data);
  const bytes = JSON.stringify(data),
    user = {
      id: '11111111-1111-4111-8111-111111111111',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'gis@example.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    };
  const capabilities: WorkspaceCapabilities = {
    campusId: 'lasu',
    userId: user.id,
    roles,
    capabilities: roles.includes('administrator')
      ? ['read', 'edit', 'review', 'publish', 'manage']
      : ['read', 'review'],
  };
  const datasets: Dataset[] = [
    {
      id: 'trees',
      campus_id: 'lasu',
      name: 'Campus trees',
      revision: 1,
      count: 100000,
      source_crs: 'EPSG:4326',
      analysis_crs: 'EPSG:32631',
      schema: {
        version: 1,
        fields: [
          { name: 'asset', type: 'text', public: false },
          { name: 'height', type: 'number', public: false },
        ],
      },
      style: { mode: 'single', color: '#228844' },
      included: false,
      provenance: {},
      saved_filters: [],
    },
  ];
  const calls: (GisCall | LegacyCall)[] = [],
    jobs: ProcessingJob[] = [],
    reviews: ReviewSubmission[] = [];
  let nextHeight = 5;
  await page.addInitScript(
    ({ user }) => {
      localStorage.setItem('turnright:editor-welcome-dismissed', 'true');
      localStorage.setItem(
        'sb-editor-test-auth-token',
        JSON.stringify({
          access_token: 'test-token',
          refresh_token: 'test-refresh',
          token_type: 'bearer',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        }),
      );
    },
    { user },
  );
  await page.route('https://editor-test.supabase.co/**', (r) =>
    r.fulfill({ json: { user } }),
  );
  await page.route('**/packages/campuses.json', (r) =>
    r.fulfill({
      json: {
        schemaVersion: 1,
        campuses: [{ ...lasuCampus, manifestUrl: '/packages/latest.json' }],
      },
    }),
  );
  await page.route('**/packages/latest.json', (r) =>
    r.fulfill({
      json: manifest ?? {
        schemaVersion: 1,
        version: data.version,
        createdAt: data.createdAt,
        summary: 'Test map',
        dataUrl: '/packages/gis-fixture/campus.json',
        assets: [
          {
            url: '/packages/gis-fixture/campus.json',
            bytes: Buffer.byteLength(bytes),
            sha256: createHash('sha256').update(bytes).digest('hex'),
          },
        ],
        bytes: Buffer.byteLength(bytes),
      },
    }),
  );
  await page.route('**/packages/gis-fixture/campus.json', (r) =>
    r.fulfill({ body: bytes, contentType: 'application/json' }),
  );
  await page.route('**/api/admin', async (route) => {
    const { action, payload = {} } = route.request().postDataJSON();
    calls.push({ action, payload });
    let result: unknown = {};
    if (action === 'state')
      result = {
        base: data,
        campus: lasuCampus,
        capabilities,
        edits: [],
        changes: [],
        reports: [],
        jobs: [],
        releases: [],
        published: null,
      };
    else if (action === 'sources') result = { features: [] };
    else if (action === 'workspace-capabilities') result = capabilities;
    else if (action === 'gis-datasets') result = datasets;
    else if (action === 'gis-query')
      result = {
        revision: datasets[0].revision,
        total: 100000,
        nextCursor: payload.cursor ? null : 'page-two',
        features: Array.from({ length: 100 }, (_, i) => ({
          type: 'Feature',
          id: 'overlay:tree-' + (i + (payload.cursor ? 100 : 0)),
          geometry: { type: 'Point', coordinates: [3.2 + i * 0.000001, 6.46] },
          properties: {
            asset: String(i).padStart(3, '0'),
            height: i === 0 ? nextHeight : 5,
          },
        })),
      };
    else if (action === 'gis-attributes-save') {
      nextHeight = payload.features[0].values.height;
      datasets[0].revision++;
      result = { revision: datasets[0].revision };
    } else if (action === 'gis-dataset-save') {
      Object.assign(
        datasets.find((d) => d.id === payload.dataset.id)!,
        payload.dataset,
        { revision: payload.expectedRevision + 1 },
      );
      result = datasets.find((d) => d.id === payload.dataset.id);
    } else if (action === 'gis-csv-import') {
      const d = {
        ...datasets[0],
        id: 'assets',
        name: payload.name,
        count: 2,
        provenance: { kind: 'table' },
      };
      datasets.push(d);
      result = d;
    } else if (action === 'gis-jobs') result = jobs;
    else if (action === 'gis-job-start') {
      const job: ProcessingJob = {
        id: payload.operationId,
        actor: user.id,
        tool: payload.tool,
        request: payload,
        status: 'succeeded',
        progress: 100,
        input_revision: payload.input.revision,
        created_at: new Date().toISOString(),
        message: '2 output features ready',
      };
      jobs.unshift(job);
      result = job;
    } else if (action === 'gis-job-preview')
      result = [
        {
          type: 'Feature',
          id: 'buffered',
          geometry: { type: 'Point', coordinates: [3.2, 6.46] },
          properties: { asset: '001' },
        },
      ];
    else if (action === 'gis-job-apply') {
      const j = jobs.find((j) => j.id === payload.id)!;
      j.status = 'applied';
      const d = {
        ...datasets[0],
        id: 'buffered',
        name: j.request.name,
        count: 2,
      };
      datasets.push(d);
      result = { datasetId: d.id };
    } else if (action === 'gis-reviews') result = reviews;
    else if (action === 'gis-review-submit') {
      const review: ReviewSubmission = {
        id: payload.operationId,
        summary: payload.summary,
        status: 'submitted',
        content_hash: 'a'.repeat(64),
        contributors: [user.id],
        submitted_by: user.id,
        created_at: new Date().toISOString(),
      };
      reviews.push(review);
      result = review;
    } else if (action === 'gis-review-details')
      result = {
        ...reviews[0],
        datasets,
        edits: [],
        editCount: 0,
        sourceCount: 100000,
        current: true,
      };
    else if (action === 'gis-review-decide') {
      reviews[0].status = 'approved';
      result = reviews[0];
    } else if (
      ['gis-issues', 'gis-quality', 'gis-views', 'survey-list'].includes(action)
    )
      result = [];
    else if (action === 'gis-members') result = [{ user_id: user.id, roles }];
    else if (action === 'review-status')
      result = { changes: [], jobs: [], releases: [], published: null };
    else if (action === 'save-edits') result = [];
    await route.fulfill({ json: result });
  });
  await page.goto('/admin');
  await expect(
    page.getByRole('navigation', { name: 'Editor sections' }),
  ).toBeVisible();
  return { calls, data, datasets, jobs, reviews };
}
test('paged GIS data, typed edit, buffer inspection and immutable review stay connected', async ({
  page,
}) => {
  const { calls } = await setup(page);
  const nav = page.getByRole('navigation', { name: 'Editor sections' });
  await nav.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(page.getByText(/100,000 matching/)).toBeVisible();
  await expect(
    page.locator('.gis-table-scroll').first().locator('tbody tr'),
  ).toHaveCount(100);
  await page.getByRole('checkbox', { name: 'Select this page' }).check();
  await expect(
    page.getByRole('checkbox', { name: 'Select this page' }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect
    .poll(
      () =>
        calls.filter((c) => c.action === 'gis-query').at(-1)?.payload.cursor,
    )
    .toBe('page-two');
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  const height = page
    .getByRole('textbox', { name: 'height', exact: true })
    .first();
  await height.fill('12');
  await height.press('Tab');
  await expect
    .poll(() =>
      calls.some(
        (c) =>
          c.action === 'gis-attributes-save' &&
          c.payload.features[0].values.height === 12,
      ),
    )
    .toBe(true);
  await nav.getByRole('button', { name: 'Analyze', exact: true }).click();
  await page.getByLabel('Result name', { exact: true }).fill('Tree buffers');
  await page.getByRole('button', { name: 'Run buffer', exact: true }).click();
  await expect(page.getByText('Tree buffers', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect staged output' }).click();
  await page
    .getByRole('checkbox', { name: 'I inspected the result and diagnostics' })
    .check();
  await page.getByRole('button', { name: 'Apply as private layer' }).click();
  await expect
    .poll(() => calls.some((c) => c.action === 'gis-job-apply'))
    .toBe(true);
  await nav.getByRole('button', { name: 'Review', exact: true }).click();
  await page
    .getByLabel('Summary', { exact: true })
    .fill('Trees and buffers checked');
  await page
    .getByRole('button', { name: 'Validate and submit snapshot' })
    .click();
  await page
    .getByRole('button', { name: 'Inspect immutable submission' })
    .click();
  await page
    .getByLabel('Decision reason', { exact: true })
    .fill('Independent review is unavailable for this owner test');
  await expect(
    page.getByRole('button', { name: 'Approve exact snapshot' }),
  ).toBeDisabled();
  await page.getByRole('checkbox', { name: /Original-owner override/ }).check();
  await page.getByRole('button', { name: 'Approve exact snapshot' }).click();
  await expect
    .poll(() =>
      calls.some(
        (c) => c.action === 'gis-review-decide' && c.payload.override === true,
      ),
    )
    .toBe(true);
  expect(
    calls
      .filter((c) => c.action === 'gis-query')
      .every((c) => (c.payload.limit ?? 100) <= 500),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/gis-workflow.png',
    fullPage: true,
  });
});
test('review-only members have no geometry or attribute editing controls', async ({
  page,
}) => {
  await setup(page, ['reviewer']);
  await page
    .getByRole('navigation', { name: 'Editor sections' })
    .getByRole('button', { name: 'Data', exact: true })
    .click();
  await expect(page.getByText(/100,000 matching/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit geometry' })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('textbox', { name: 'height', exact: true }).first(),
  ).toBeDisabled();
});

test('GIS styling, asset CSV join and map PNG export are reachable', async ({
  page,
}) => {
  const { calls } = await setup(page);
  const nav = page.getByRole('navigation', { name: 'Editor sections' });
  await nav.getByRole('button', { name: 'Data', exact: true }).click();
  await page
    .getByText('Schema, styling and publication fields', { exact: true })
    .click();
  const domain = page.getByLabel('height coded domain', { exact: true });
  await domain.fill('not a number');
  await page.getByRole('button', { name: 'Save schema and style' }).click();
  await expect(page.getByRole('alert')).toContainText('finite number');
  expect(calls.some((c) => c.action === 'gis-dataset-save')).toBe(false);
  await domain.fill('');
  await page
    .getByRole('combobox', { name: 'Style', exact: true })
    .selectOption('graduated');
  await page
    .getByRole('combobox', { name: 'Classification field', exact: true })
    .selectOption('height');
  await page.getByRole('button', { name: 'Add legend class' }).click();
  await page.getByLabel('Class 1 value', { exact: true }).fill('10');
  await page.getByLabel('Class 1 label', { exact: true }).fill('Small trees');
  await page.getByRole('button', { name: 'Save schema and style' }).click();
  await expect
    .poll(
      () =>
        calls.find((c) => c.action === 'gis-dataset-save')?.payload.dataset
          .style.classes?.[0].maximum,
    )
    .toBe(10);
  await page.getByText('Import an attribute CSV', { exact: true }).click();
  await page.getByLabel('Import CSV', { exact: true }).setInputFiles({
    name: 'assets.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('asset,height\n001,7\n002,8'),
  });
  await expect
    .poll(() => calls.some((c) => c.action === 'gis-csv-import'))
    .toBe(true);
  await nav.getByRole('button', { name: 'Analyze', exact: true }).click();
  await page
    .getByRole('button', { name: 'attribute join', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Overlay / join table', exact: true })
    .selectOption('assets');
  await page
    .getByRole('combobox', { name: 'Input key', exact: true })
    .selectOption('asset');
  await page
    .getByRole('combobox', { name: 'Table key', exact: true })
    .selectOption('asset');
  await page
    .getByRole('button', { name: 'Run attribute join', exact: true })
    .click();
  await expect
    .poll(() => calls.find((c) => c.action === 'gis-job-start')?.payload.tool)
    .toBe('attribute-join');
  await nav.getByRole('button', { name: 'Publish', exact: true }).click();
  await page
    .getByText('Map layout: A4 / A3 PNG and PDF', { exact: true })
    .click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const png = await download;
  expect(png.suggestedFilename()).toBe('Campus_map.png');
  const { readFile } = await import('node:fs/promises');
  const exported = await readFile((await png.path())!);
  expect(exported.toString('utf8')).toContain('TurnRightLayout');
  expect(exported.toString('utf8')).toContain('"kind":"turnright-map-layout"');
  const sharp = (await import('sharp')).default;
  const bytes = sharp((await png.path())!);
  expect(await bytes.metadata()).toMatchObject({
    width: 1754,
    height: 1240,
    format: 'png',
  });
  const pixels = await bytes
    .extract({ left: 300, top: 200, width: 800, height: 500 })
    .stats();
  expect(pixels.channels[0].stdev).toBeGreaterThan(2);
});

test('GIS released layouts retain immutable package identity and reject a different release', async ({
  page,
}) => {
  const { data } = await setup(page);
  await page.goto(
    '/?mapLayout=1&layoutVersion=' + encodeURIComponent(data.version),
  );
  const panel = page.getByRole('complementary', {
    name: 'Released map layout',
  });
  await expect(panel).toContainText('Release ' + data.version);
  await panel.getByRole('button', { name: 'Set flat view' }).click();
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Export released PNG' }).click();
  const file = await download;
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile((await file.path())!);
  expect(bytes.toString('utf8')).toContain('"status":"released"');
  expect(bytes.toString('utf8')).toContain(
    '"version":' + JSON.stringify(data.version),
  );
  expect(bytes.toString('utf8')).toContain('"assets":');
  await page.goto('/?mapLayout=1&layoutVersion=different-release');
  await expect(panel.getByRole('alert')).toContainText(
    'differs from the requested release',
  );
  await expect(
    panel.getByRole('button', { name: 'Export released PNG' }),
  ).toBeDisabled();
});

test('GIS documentation gallery uses the current workspace and an isolated team fixture', async ({
  page,
}) => {
  test.skip(
    process.env.TURNRIGHT_GIS_SCREENSHOTS !== '1',
    'Opt-in documentation capture only',
  );
  const { reviews, data } = await setup(page);
  await page.waitForFunction(() => {
    type Hook = { memoizedState?: { current?: MapInstance }; next?: Hook };
    type Fiber = { memoizedState?: Hook; return?: Fiber };
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
          return map.loaded();
        }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return false;
  });
  const nav = page.getByRole('navigation', { name: 'Editor sections' });
  const shot = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
      (bounds) =>
        window.editorTestMap.fitBounds(bounds, {
          padding: { left: 36, right: 36, top: 100, bottom: 100 },
          pitch: 0,
          bearing: 0,
          duration: 0,
        }),
      data.bounds,
    );
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.areTilesLoaded()))
      .toBe(true);
    await page
      .locator('.gis-workspace')
      .first()
      .evaluate((e) => {
        e.scrollTop = 0;
      });
    await page.screenshot({
      path: fileURLToPath(
        new URL(
          '../../../docs/assets/screenshots/redesign-gis-' +
            name +
            '-2026-10-07.png',
          import.meta.url,
        ),
      ),
    });
  };
  await nav.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(page.getByText(/100,000 matching/)).toBeVisible();
  await page
    .getByRole('textbox', { name: 'height', exact: true })
    .first()
    .fill('12');
  await page
    .getByRole('textbox', { name: 'height', exact: true })
    .first()
    .press('Tab');
  await shot('data');
  await nav.getByRole('button', { name: 'Analyze', exact: true }).click();
  await page
    .getByLabel('Result name', { exact: true })
    .fill('Demonstration tree buffers');
  await shot('analyze');
  reviews.push({
    id: '22222222-2222-4222-8222-222222222222',
    summary: 'Demonstration tree survey and buffer review',
    status: 'submitted',
    content_hash: 'a'.repeat(64),
    contributors: ['33333333-3333-4333-8333-333333333333'],
    submitted_by: '33333333-3333-4333-8333-333333333333',
    created_at: '2026-10-05T00:00:00Z',
  });
  await nav.getByRole('button', { name: 'Review', exact: true }).click();
  await page
    .getByRole('button', { name: 'Inspect immutable submission' })
    .click();
  await page.getByText(/^Map validation \(/).click();
  await shot('review');
  reviews[0].status = 'approved';
  await nav.getByRole('button', { name: 'Publish', exact: true }).click();
  await page
    .getByText('Map layout: A4 / A3 PNG and PDF', { exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Approved snapshot', exact: true })
    .selectOption('22222222-2222-4222-8222-222222222222');
  await page
    .getByLabel('Release summary', { exact: true })
    .fill('Demonstration campus review');
  await shot('publish');
});

test('workspace panes preserve the canvas, restore preferences and dismiss the legend', async ({
  page,
}, info) => {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  await setup(page);
  const canvas = await page.locator('.map-canvas').elementHandle();
  await page
    .getByRole('button', { name: 'Close map legend', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Map legend', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Map legend', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Map legend', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Close map legend', exact: true }),
  ).toBeVisible();
  const retainedCanvas = await page.locator('.map-canvas').elementHandle();
  await page.getByRole('button', { name: /^Activity/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Activity/ })).toBeFocused();
  await page.getByRole('button', { name: 'Focus canvas', exact: true }).click();
  await expect(page.locator('.workspace-frame')).toHaveAttribute(
    'data-focus',
    'true',
  );
  const workspaceMenu = page.locator('.editor-header-right .workspace-menu');
  await workspaceMenu.locator('summary').click();
  await workspaceMenu
    .getByRole('button', { name: 'Reset layout', exact: true })
    .click();
  await expect(page.locator('.workspace-frame')).toHaveAttribute(
    'data-focus',
    'false',
  );
  await workspaceMenu.locator('summary').click();

  await page
    .getByRole('navigation', { name: 'Editor sections' })
    .getByRole('button', { name: 'Data', exact: true })
    .click();
  await expect(
    page.getByRole('checkbox', { name: 'Select this page' }),
  ).toBeVisible();
  expect(await retainedCanvas!.evaluate((node) => node.isConnected)).toBe(true);
  await page
    .getByRole('separator', { name: 'Resize explorer', exact: true })
    .focus();
  await page.keyboard.press('ArrowRight');
  await page
    .getByRole('button', { name: 'Maximize table', exact: true })
    .click();
  await expect(page.locator('.workspace-frame')).toHaveAttribute(
    'data-maximized',
    'true',
  );
  await page
    .getByRole('button', { name: 'Restore table', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Maximize table', exact: true })
    .click();
  await expect(page.locator('.workspace-canvas')).toHaveAttribute('inert', '');
  await page
    .getByRole('button', { name: 'Collapse table and activity', exact: true })
    .click();
  await expect(page.locator('.workspace-canvas')).not.toHaveAttribute(
    'inert',
    '',
  );
  await page
    .getByRole('button', { name: 'Toggle table and activity', exact: true })
    .click();
  await page.screenshot({ path: info.outputPath('data-desktop.png') });
  await page.reload();
  await expect(
    page
      .getByRole('navigation', { name: 'Editor sections' })
      .getByRole('button', { name: 'Data', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^Activity/ }).click();
  const activityBounds = (await page.locator('#process-list').boundingBox())!;
  expect(activityBounds.x).toBeGreaterThanOrEqual(0);
  expect(activityBounds.x + activityBounds.width).toBeLessThanOrEqual(390);
  expect(activityBounds.y + activityBounds.height).toBeLessThanOrEqual(844);
  await page.keyboard.press('Escape');
  const tableToggle = page.getByRole('button', {
    name: 'Toggle table and activity',
    exact: true,
  });
  if ((await tableToggle.getAttribute('aria-pressed')) !== 'true')
    await tableToggle.click();
  await expect(
    page.getByRole('checkbox', { name: 'Select this page' }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('data-phone.png') });
  await page.getByLabel('Workspace', { exact: true }).selectOption('map');
  await page
    .getByRole('button', { name: 'Reset layout', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: 'Close map legend', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('edit-phone.png') });
  expect(failures).toEqual([]);
  await canvas?.dispose();
  await retainedCanvas?.dispose();
});
