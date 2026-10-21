import { expect, type Page } from './coverage-fixture';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { CampusData, CampusPackage } from '../../src/types';
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
import { registerDatasetsAndAnalysis } from './gis-workflow-datasets-and-analysis';
import { registerReviewAndPermissions } from './gis-workflow-review-and-permissions';
export type GisCall = {
  [A in keyof GisActionMap]: { action: A; payload: GisActionMap[A]['request'] };
}[keyof GisActionMap];
export type LegacyCall = {
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
            '../../work/docs-fixture/public/packages/latest.json',
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
            '../../work/docs-fixture/public' + manifest.dataUrl,
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
              '../../work/docs-fixture/public' + asset.url,
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
const fixture = () => ({ setup });
export type GisWorkflowFixture = ReturnType<typeof fixture>;
registerDatasetsAndAnalysis(fixture);
registerReviewAndPermissions(fixture);
