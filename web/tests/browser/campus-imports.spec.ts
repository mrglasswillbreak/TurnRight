import { expect, type Page } from './coverage-fixture';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { campusFixture } from '../fixture';
import { lasuCampus, type CampusIdentity } from '../../src/campus-context';
import type {
  CampusImport,
  CampusSource,
  ImportPreview,
} from '../../src/map-import-types';
import type { CampusData, CampusPackage, MapEdit } from '../../src/types';
import type { SaveBatch } from '../../src/editor-workspace';
import { registerMappingAndRecovery } from './campus-imports-mapping-and-recovery';
import { registerIsolationAndReview } from './campus-imports-isolation-and-review';
import { registerCancellation } from './campus-imports-cancellation';
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
async function setup(
  page: Page,
  {
    photo = false,
    outsideLasu = false,
    overlay = false,
  }: { photo?: boolean; outsideLasu?: boolean; overlay?: boolean } = {},
) {
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
  const activeNorth = outsideLasu
    ? {
        ...north,
        bounds: [
          [3.383488, 6.499619],
          [3.404971, 6.524281],
        ] as CampusIdentity['bounds'],
      }
    : north;
  if (outsideLasu) {
    data.bounds = activeNorth.bounds;
    data.boundary = {
      type: 'Feature',
      properties: { name: north.name },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [3.383488, 6.499619],
            [3.404971, 6.499619],
            [3.404971, 6.524281],
            [3.383488, 6.524281],
            [3.383488, 6.499619],
          ],
        ],
      },
    };
    data.map.features = [
      {
        type: 'Feature',
        properties: {
          id: 'unilag-road',
          kind: 'path',
          name: 'OZOLUA RD.',
          walkingAccess: 'private',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [3.391, 6.51],
            [3.392, 6.511],
          ],
        },
      },
    ];
    data.places = [];
    data.graph.nodes = [];
    data.graph.edges = [];
  }
  if (overlay)
    data.map.features.push({
      type: 'Feature',
      properties: {
        id: 'survey-area',
        kind: 'overlay',
        name: 'Survey area',
        label: 'Field survey',
        color: '#2563eb',
        opacity: 0.5,
        order: 2,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [3.2, 6.46],
            [3.201, 6.46],
            [3.201, 6.461],
            [3.2, 6.46],
          ],
        ],
      },
    });
  let saved: MapEdit[] = [];
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
    { ...activeNorth, boundary: data.boundary },
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
        campus: request.campus === 'north-campus' ? activeNorth : lasuCampus,
        edits: saved,
        changes: [],
        reports: [],
        jobs: [],
        releases: [],
        published: null,
      };
    if (action === 'save-edits') {
      saved = (payload as SaveBatch).edits.map(({ edit }) => ({
        ...edit,
        updated_at: new Date().toISOString(),
      }));
      result = saved;
    }
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
    if (action === 'import-upload') {
      if (job?.status === 'failed')
        Object.assign(job, {
          status: 'draft',
          phase: 'inspect',
          summary: undefined,
        });
      result = { url: 'http://127.0.0.1:5183/__campus-upload', job };
    }
    if (action === 'import-run' && job) {
      Object.assign(job, {
        status: 'queued',
        phase: payload.phase,
        // PostgreSQL JSONB does not preserve object-key insertion order.
        configuration: {
          redistributionConfirmed:
            payload.configuration.redistributionConfirmed,
          license: payload.configuration.license,
          attribution: payload.configuration.attribution,
          layers: payload.configuration.layers.map(
            (layer: Record<string, unknown>) =>
              Object.fromEntries(Object.entries(layer).reverse()),
          ),
        },
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
      result = { job };
    }
    return r.fulfill({ json: result });
  });
  return { calls, jobs, summary: campusSummary, data };
}
async function workspace(page: Page) {
  await page.goto('/admin');
  await page.locator('.campus-menu summary').click();
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
const fixture = () => ({
  north,
  boundary,
  config,
  source,
  summary,
  setup,
  workspace,
  fileImport,
});
export type CampusImportsFixture = ReturnType<typeof fixture>;
registerMappingAndRecovery(fixture);
registerIsolationAndReview(fixture);
registerCancellation(fixture);
