import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { campusFixture } from '../fixture';
import { lasuCampus, type CampusIdentity } from '../../src/campus-context';
import type {
  CampusImport,
  CampusSource,
  ImportPreview,
} from '../../src/map-import-types';
import type { CampusData, CampusPackage } from '../../src/types';

const north: CampusIdentity = {
  id: 'campus-north',
  slug: 'north-campus',
  name: 'University · North campus',
  bounds: lasuCampus.bounds,
};
const boundary = campusFixture().boundary;
const config = {
  layers: [],
  attribution: 'University GIS team',
  license: 'CC0',
  redistributionConfirmed: true,
};
const source: CampusSource = {
  id: 'source-one',
  campus_id: 'lasu',
  name: 'Campus buildings and paths',
  kind: 'file',
  configuration: config,
  schedule: 'manual',
  updated_at: '2026-09-26T08:00:00Z',
};
const summary: ImportPreview = {
  layers: [
    {
      name: 'Buildings',
      count: 24,
      geometryTypes: ['Polygon'],
      crs: 'EPSG:4326',
      sourceCrs: 'EPSG:3857',
      suggestedRole: 'building',
      fields: [
        { name: 'id', alias: 'Building identifier' },
        { name: 'name', alias: 'Official building name' },
        { name: 'height' },
        { name: 'floors' },
      ],
    },
    {
      name: 'Footpaths',
      count: 18,
      geometryTypes: ['LineString'],
      crs: 'EPSG:4326',
      suggestedRole: 'path',
      fields: [{ name: 'id' }, { name: 'name' }, { name: 'access' }],
    },
  ],
  counts: { added: 42, modified: 0, removed: 0, skipped: 2 },
  warnings: [
    'Imported line endpoints are separate until connected in the editor. Review path access and junctions before routing.',
  ],
  errors: [],
  duplicates: [],
  features: { type: 'FeatureCollection', features: [] },
  totalFeatures: 44,
};

async function setup(page: Page, { photo = false }: { photo?: boolean } = {}) {
  const data: CampusData = photo
    ? JSON.parse(
        readFileSync(
          new URL(
            '../../public/packages/lasu-4e4c8008b38b/campus.json',
            import.meta.url,
          ),
          'utf8',
        ),
      )
    : campusFixture();
  const bytes = JSON.stringify(data);
  const manifest: CampusPackage = {
    schemaVersion: 1,
    version: data.version,
    createdAt: data.createdAt,
    summary: 'Reviewed campus',
    dataUrl: '/packages/import-fixture/campus.json',
    bytes: Buffer.byteLength(bytes),
    assets: [
      {
        url: '/packages/import-fixture/campus.json',
        bytes: Buffer.byteLength(bytes),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    ],
  };
  const campusSummary = structuredClone(summary);
  campusSummary.features = {
    type: 'FeatureCollection',
    features: data.map.features
      .filter((f) => f.properties?.kind === 'building')
      .slice(0, 80),
  };
  const jobs: CampusImport[] = [];
  const sources: CampusSource[] = [];
  const campuses = [
    { ...lasuCampus, boundary },
    { ...north, boundary },
  ];
  const calls: {
    action: string;
    campus: string;
    payload: Record<string, unknown>;
  }[] = [];
  const user = {
    id: 'campus-test-owner',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'owner@example.test',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  };
  await page.addInitScript(
    ({ user }) =>
      localStorage.setItem(
        'sb-editor-test-auth-token',
        JSON.stringify({
          access_token: 'test-token',
          refresh_token: 'test-refresh',
          token_type: 'bearer',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        }),
      ),
    { user },
  );
  await page.route('https://editor-test.supabase.co/**', (r) =>
    r.fulfill({ json: { user } }),
  );
  await page.route('**/packages/campuses.json', (r) =>
    r.fulfill({
      json: {
        schemaVersion: 1,
        campuses: campuses.map((c) => ({
          ...c,
          manifestUrl:
            c.id === 'lasu'
              ? '/packages/lasu-fixture/manifest.json'
              : '/packages/north-fixture/manifest.json',
        })),
      },
    }),
  );
  await page.route('**/packages/latest.json', (r) =>
    r.fulfill({ json: manifest }),
  );
  await page.route('**/packages/lasu-fixture/manifest.json', (r) =>
    r.fulfill({ json: manifest }),
  );
  await page.route('**/packages/north-fixture/manifest.json', (r) =>
    r.fulfill({
      json: {
        ...manifest,
        campus: { id: north.id, slug: north.slug, name: north.name },
      },
    }),
  );
  await page.route('**/packages/import-fixture/campus.json', (r) =>
    r.fulfill({ body: bytes, contentType: 'application/json' }),
  );
  await page.route('**/__campus-upload', (r) =>
    r.fulfill({ json: { ok: true } }),
  );
  await page.route('**/api/admin', async (r) => {
    const request = r.request().postDataJSON();
    calls.push(request);
    const { action, payload } = request;
    let result: unknown = {};
    if (action === 'state')
      result = {
        base: data,
        campus: request.campus === 'north-campus' ? north : lasuCampus,
        edits: [],
        changes: [],
        reports: [],
        jobs: [],
        releases: [],
        published: null,
      };
    if (action === 'sources') result = { features: [] };
    if (action === 'survey-list') result = [];
    if (action === 'review-status')
      result = { changes: [], jobs: [], releases: [], published: null };
    if (action === 'campus-list') result = { campuses };
    if (action === 'campus-create') {
      const campus = { ...north, id: 'campus-new', ...payload };
      campuses.push(campus);
      result = { campus };
    }
    if (action === 'import-list')
      result = { sources, imports: jobs, scheduledOsmEnabled: false };
    if (action === 'import-start') {
      if (!sources.length)
        sources.push({ ...source, kind: payload.kind || 'file' });
      const job: CampusImport = {
        id: `import-${jobs.length + 1}`,
        source_id: source.id,
        campus_id: 'lasu',
        status: 'draft',
        phase: 'inspect',
        configuration: config,
        run_token: 'test-run',
        created_at: '2026-09-26T08:00:00Z',
        updated_at: '2026-09-26T08:00:00Z',
      };
      jobs.unshift(job);
      result = { job };
    }
    const job = jobs.find((j) => j.id === payload?.importId);
    if (action === 'import-upload')
      result = { url: 'http://127.0.0.1:5183/__campus-upload' };
    if (action === 'import-run' && job) {
      Object.assign(job, {
        status: 'queued',
        phase: payload.phase,
        configuration: payload.configuration,
      });
      result = { job };
    }
    if (action === 'import-get' && job) {
      if (job.status === 'queued')
        Object.assign(job, {
          status: job.phase === 'inspect' ? 'mapping' : 'preview',
          summary: campusSummary,
        });
      result = { job };
    }
    if (action === 'import-cancel' && job) {
      job.status = 'cancelled';
      result = { ok: true };
    }
    if (action === 'import-queue' && job) {
      job.status = 'reviewed';
      result = { count: 42 };
    }
    return r.fulfill({ json: result });
  });
  return { calls, jobs, summary: campusSummary, data };
}
async function workspace(page: Page) {
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Campuses', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Campuses workspace' }),
  ).toBeVisible();
}
async function fileImport(page: Page) {
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  await page
    .getByLabel('Source name', { exact: true })
    .fill('Campus buildings and paths');
  await page.getByRole('button', { name: 'Upload files', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'campus.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(
      JSON.stringify({ type: 'FeatureCollection', features: [] }),
    ),
  });
  await page
    .getByRole('button', { name: 'Inspect layers', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Build preview', exact: true }),
  ).toBeEnabled({ timeout: 15000 });
}

test('campus imports preserve mappings through rotation and queue only a reviewed preview', async ({
  page,
}) => {
  const state = await setup(page);
  await workspace(page);
  await fileImport(page);
  const building = page.locator('.import-layer').first();
  await building
    .getByRole('combobox', { name: 'Height', exact: true })
    .selectOption('height');
  await building.getByLabel('Height units').selectOption('ft');
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(building.getByLabel('Height units')).toHaveValue('ft');
  await page.getByRole('button', { name: 'Back to sources' }).click();
  await page
    .getByRole('button', { name: /Campus buildings and paths.*mapping/ })
    .click();
  await expect(building.getByLabel('Height units')).toHaveValue('ft');
  await page
    .getByRole('button', { name: 'Build preview', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Queue for review', exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  await page
    .getByRole('button', { name: 'Queue for review', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Open source review' }),
  ).toBeVisible();
  expect(state.calls.filter((c) => c.action === 'import-queue')).toHaveLength(
    1,
  );
  expect(state.calls.every((c) => c.campus === 'lasu')).toBe(true);
  const preview = state.calls.find(
    (c) => c.action === 'import-run' && c.payload.phase === 'preview',
  );
  const mappings = (
    preview!.payload.configuration as { layers: { crs?: string }[] }
  ).layers;
  expect(mappings[0].crs).toBeUndefined();
});

test('campus imports restore campus creation and public handoff keeps the campus context', async ({
  page,
}) => {
  await setup(page);
  await workspace(page);
  await page.getByRole('button', { name: 'New campus' }).click();
  await page
    .getByLabel('Campus name', { exact: true })
    .fill('University · East campus');
  await page
    .getByLabel('Boundary GeoJSON', { exact: true })
    .fill(JSON.stringify(boundary));
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'New campus' }).click();
  await expect(page.getByLabel('Campus name', { exact: true })).toHaveValue(
    'University · East campus',
  );
  await page
    .getByRole('button', { name: 'Create campus', exact: true })
    .click();
  await expect(page).toHaveURL(/campus=university-east-campus/);
  await page.goto('/?campus=north-campus');
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Editor', exact: true }),
  ).toHaveAttribute('href', '/admin?campus=north-campus');
  await page
    .getByRole('button', { name: 'Choose a campus', exact: true })
    .click();
  await page
    .getByRole('searchbox', { name: 'Search published campuses' })
    .fill('LASU');
  await expect(
    page.getByRole('button', { name: 'LASU · Ojo', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: north.name, exact: true }),
  ).toHaveCount(0);
});

test('campus imports responsive screens and documentation captures', async ({
  page,
}) => {
  test.setTimeout(120000);
  await setup(page, { photo: true });
  await workspace(page);
  const capture = async (name: string) => {
    if (process.env.UPDATE_CAMPUS_SCREENSHOTS === 'true')
      await page.screenshot({
        path: `../docs/assets/screenshots/campus-${name}-2026-09-26.png`,
      });
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await capture('workspace');
  await page.getByRole('button', { name: 'New campus' }).click();
  await page
    .getByLabel('Campus name', { exact: true })
    .fill('University · East campus');
  await page
    .getByLabel('Boundary GeoJSON', { exact: true })
    .fill(JSON.stringify(boundary));
  await page.locator('.campus-content').evaluate((e) => (e.scrollTop = 0));
  await capture('creation');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  await page
    .getByLabel('Source name', { exact: true })
    .fill('University GIS buildings');
  await page.getByRole('button', { name: 'ArcGIS', exact: true }).click();
  await page
    .getByLabel('Public ArcGIS URL')
    .fill(
      'https://services.arcgis.com/example/arcgis/rest/services/Campus/FeatureServer',
    );
  await capture('sources');
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  await fileImport(page);
  await page.locator('.campus-content').evaluate((e) => (e.scrollTop = 0));
  await capture('mapping');
  await page
    .getByRole('button', { name: 'Build preview', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Queue for review', exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 1024, height: 768 },
    { width: 667, height: 375 },
    { width: 844, height: 390 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await expect(
      page.getByRole('button', { name: 'Close campuses' }),
    ).toBeInViewport();
    expect(
      await page
        .locator('.campus-workspace')
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
    await page
      .getByRole('button', { name: 'Queue for review', exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('button', { name: 'Queue for review', exact: true }),
    ).toBeInViewport();
    if (size.width === 844) await capture('landscape');
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const zoom of [1.25, 1.5]) {
    await page
      .locator('html')
      .evaluate((e, z) => (e.style.zoom = String(z)), zoom);
    await expect(
      page.getByRole('button', { name: 'Close campuses' }),
    ).toBeInViewport();
    expect(
      await page
        .locator('.campus-workspace')
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
  }
  await page.locator('html').evaluate((e) => (e.style.zoom = '1'));
  await page
    .getByRole('button', { name: 'Queue for review', exact: true })
    .scrollIntoViewIfNeeded();
  await capture('review');
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Choose a campus', exact: true })
    .click();
  await capture('switcher');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  await page.getByRole('button', { name: 'Offline', exact: true }).click();
  await capture('offline');
});

test('campus imports retain readable headers and fields in light and dark themes', async ({
  page,
}) => {
  await setup(page);
  await page.addInitScript(() =>
    localStorage.setItem('turnright:appearance', 'system'),
  );
  await workspace(page);
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  await page
    .getByLabel('Source name', { exact: true })
    .fill('Reference survey');
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator('html')).toHaveAttribute(
      'style',
      new RegExp(`color-scheme: ${colorScheme}`),
    );
    for (const selector of [
      '.campus-workspace-header',
      '.campus-search input',
      '.import-source-form',
      '.import-source-form input:not([type=checkbox])',
    ]) {
      const contrasts = await page.locator(selector).evaluateAll((elements) => {
        const luminance = (value: string) => {
          const channels = value
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((n) => {
              const c = n / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
          return (
            channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
          );
        };
        return elements.map((element) => {
          const style = getComputedStyle(element);
          const foreground = luminance(style.color),
            background = luminance(style.backgroundColor);
          return (
            (Math.max(foreground, background) + 0.05) /
            (Math.min(foreground, background) + 0.05)
          );
        });
      });
      expect(contrasts.length).toBeGreaterThan(0);
      for (const contrast of contrasts)
        expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
    await expect(page.getByLabel('Source name', { exact: true })).toHaveValue(
      'Reference survey',
    );
    if (
      colorScheme === 'dark' &&
      process.env.UPDATE_CAMPUS_SCREENSHOTS === 'true'
    )
      await page.screenshot({
        path: '../docs/assets/screenshots/campus-dark-2026-09-26.png',
      });
  }
});
