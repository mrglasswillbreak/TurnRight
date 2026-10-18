import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readConfig, runtime, origin, command } from './runtime.mjs';
import { verifyPrivateAssets } from './acceptance-assets.mts';
import type {
  SourceHistory,
  SourceOperation,
  SourcePage,
} from '../../web/src/source-updates.ts';
import type {
  Dataset,
  ProcessingJob,
  ReviewSubmission,
} from '../../web/src/gis-types.ts';
import type { CampusImport } from '../../web/src/map-import-types.ts';

const config = await readConfig();
const accounts: Array<{
  id: string;
  role: string;
  email: string;
  password: string;
}> = JSON.parse(await readFile(path.join(runtime, 'accounts.json'), 'utf8'));
const sessions = new Map<string, string>();
for (const account of accounts) {
  const response = await fetch(
    config.API_URL + '/auth/v1/token?grant_type=password',
    {
      method: 'POST',
      headers: { apikey: config.ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
      }),
    },
  );
  const session = await response.json();
  assert.equal(
    response.status,
    200,
    `Real authentication for ${account.role} (${typeof session.error_code === 'string' && /^[a-z_]+$/.test(session.error_code) ? session.error_code : 'no diagnostic code'})`,
  );
  assert.equal(session.user.id, account.id);
  sessions.set(account.role, session.access_token);
}
const signup = await fetch(config.API_URL + '/auth/v1/signup', {
  method: 'POST',
  headers: { apikey: config.ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'uninvited@turnright.local',
    password: 'Uninvited-test-only-password',
  }),
});
assert.equal(signup.status, 422, 'Public registration remains disabled');
async function api<T = Record<string, unknown>>(
  role: string,
  action: string,
  payload: unknown = {},
  campus = 'lasu',
  status = 200,
): Promise<T> {
  const response = await fetch(origin + '/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessions.has(role)
        ? { Authorization: 'Bearer ' + sessions.get(role) }
        : {}),
    },
    body: JSON.stringify({ action, payload, campus }),
  });
  const result = await response.json();
  assert.equal(
    response.status,
    status,
    `${role} ${action}: ${response.status}; ${result.error || 'no error'}`,
  );
  return result as T;
}
await api('anonymous', 'state', {}, 'lasu', 401);
await api('editor', 'state', {}, 'local-south', 403);
await api('reviewer', 'gis-csv-import', {}, 'lasu', 403);
await api('publisher', 'gis-member-save', {}, 'lasu', 403);
for (const role of sessions.keys()) await api(role, 'workspace-capabilities');
await api('administrator', 'state', {}, 'local-south');
await api(
  'editor',
  'import-start',
  { kind: 'osm', name: 'Disabled remote source' },
  'lasu',
  409,
);
await api('publisher', 'publish-release', {}, 'lasu', 409);
const control = await fetch(origin + '/__local/jobs', {
  method: 'POST',
  body: '{}',
});
assert.equal(control.status, 403);
const arbitrary = await fetch(origin + '/__local/jobs', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + config.dispatchToken },
  body: JSON.stringify({ workflow: 'release.yml', inputs: {} }),
});
assert.equal(arbitrary.status, 400);

if (process.argv.includes('--persistence')) {
  const previous = JSON.parse(
    await readFile(path.join(runtime, 'acceptance-receipt.json'), 'utf8'),
  );
  const datasets = await api<Dataset[]>('editor', 'gis-datasets');
  assert(
    datasets.some((dataset) => dataset.name === previous.datasetName),
    'Edited data survives service restart',
  );
  const model = await api<{ url: string }>('editor', 'model-asset-read', {
    reference: previous.assets.model,
  });
  assert.equal(
    createHash('sha256')
      .update(Buffer.from(await (await fetch(model.url)).arrayBuffer()))
      .digest('hex'),
    previous.assets.model.sha256,
  );
  const photo = await api<{ status: string }>('editor', 'media-status', {
    id: previous.assets.photoId,
  });
  assert.equal(photo.status, 'processed', 'Private media survives restart');
  console.log('Restart persistence and role isolation passed.');
  process.exit(0);
}
if (process.argv.includes('--after-reset')) {
  const previous = JSON.parse(
    await readFile(path.join(runtime, 'acceptance-receipt.json'), 'utf8'),
  );
  const datasets = await api<Dataset[]>('editor', 'gis-datasets');
  assert(
    !datasets.some((dataset) => dataset.name === previous.datasetName),
    'Explicit reset removes previous local edits',
  );
  await api(
    'editor',
    'media-status',
    { id: previous.assets.photoId },
    'lasu',
    404,
  );
}

const datasetName = 'Local acceptance ' + randomUUID();
await api('editor', 'gis-csv-import', {
  operationId: randomUUID(),
  name: datasetName,
  csv: 'label,count\nA,3\nB,5\n',
});
const datasets = await api<Dataset[]>('editor', 'gis-datasets');
const dataset = datasets.find((row) => row.name === datasetName)!;
assert(dataset, 'CSV import persists');
const view = {
  id: randomUUID(),
  revision: 0,
  name: 'Local saved view',
  center: [3.2, 6.46],
  zoom: 16,
  pitch: 0,
  bearing: 0,
  datasets: [dataset.id],
};
const operationId = randomUUID();
await api('editor', 'gis-view-save', { operationId, view });
await api('editor', 'gis-view-save', { operationId, view });
const views = await api<Array<{ id: string }>>('editor', 'gis-views');
assert.equal(
  views.filter((row) => row.id === view.id).length,
  1,
  'Uncertain save retries are idempotent',
);

const submission = await api<ReviewSubmission>('editor', 'gis-review-submit', {
  operationId: randomUUID(),
  summary: 'Synthetic local acceptance review',
});
const editorId = accounts.find((account) => account.role === 'editor')!.id;
await api('administrator', 'gis-member-save', {
  operationId: randomUUID(),
  userId: editorId,
  roles: ['editor', 'reviewer'],
});
const selfApproval = await api(
  'editor',
  'gis-review-decide',
  { id: submission.id, approve: true, reason: 'Self approval must fail' },
  'lasu',
  403,
);
assert.match(
  String(selfApproval.error),
  /contributor/i,
  'Independent review is enforced even when the contributor holds the reviewer role',
);
await api('administrator', 'gis-member-save', {
  operationId: randomUUID(),
  userId: editorId,
  roles: ['editor'],
});
await api('reviewer', 'gis-review-decide', {
  id: submission.id,
  approve: true,
  reason: 'Independent synthetic data review',
});

async function waitFor<T>(
  get: () => Promise<T>,
  done: (value: T) => boolean,
  label: string,
) {
  const deadline = Date.now() + 180_000;
  for (;;) {
    const value = await get();
    if (done(value)) return value;
    assert(Date.now() < deadline, `${label} completed within worker budget`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
const job = await api<ProcessingJob>('editor', 'gis-job-start', {
  operationId: randomUUID(),
  tool: 'export',
  input: { datasetId: dataset.id, revision: dataset.revision },
  parameters: { format: 'csv' },
  name: 'Local CSV export',
});
const jobs = await waitFor(
  () => api<ProcessingJob[]>('editor', 'gis-jobs'),
  (rows) =>
    rows.some(
      (row) => row.id === job.id && !['queued', 'running'].includes(row.status),
    ),
  'GIS export',
);
assert.equal(jobs.find((row) => row.id === job.id)?.status, 'succeeded');
const artifact = await api<{ url: string }>('editor', 'gis-job-artifact', {
  id: job.id,
});
assert.equal(new URL(artifact.url).origin, config.API_URL);
const exported = await fetch(artifact.url);
assert(exported.ok);
assert.equal(
  Buffer.from(await exported.arrayBuffer())
    .subarray(0, 4)
    .toString('hex'),
  '504b0304',
  'Export is a ZIP archive',
);
const spatial = datasets.find(
  (row) => !row.id.startsWith('table:') && (row.count || 0) > 0,
);
assert(spatial, 'Synthetic geometry is indexed for analysis');
const buffer = await api<ProcessingJob>('editor', 'gis-job-start', {
  operationId: randomUUID(),
  tool: 'buffer',
  name: 'Synthetic ten metre buffer',
  input: { datasetId: spatial.id, revision: spatial.revision },
  parameters: { distance: 10 },
});
const buffered = await waitFor(
  () => api<ProcessingJob[]>('editor', 'gis-jobs'),
  (rows) =>
    rows.some(
      (row) =>
        row.id === buffer.id && !['queued', 'running'].includes(row.status),
    ),
  'Spatial analysis',
);
assert.equal(buffered.find((row) => row.id === buffer.id)?.status, 'succeeded');
const geometry = await api<Array<{ geometry: { type: string } }>>(
  'editor',
  'gis-job-preview',
  { id: buffer.id },
);
assert(
  geometry.length > 0 &&
    geometry.every((feature) => /Polygon$/.test(feature.geometry.type)),
  'Metric buffer produces polygon geometry',
);
const assets = await verifyPrivateAssets(api, config.API_URL);

const source = await api<{ job: CampusImport }>('editor', 'import-start', {
  kind: 'file',
  name: 'Synthetic local GeoJSON',
});
const contents = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [3.201, 6.46] },
      properties: { id: 'local-tree', name: 'Synthetic tree' },
    },
  ],
});
const upload = await api<{ url: string }>('editor', 'import-upload', {
  importId: source.job.id,
  name: 'local.geojson',
  bytes: Buffer.byteLength(contents),
  sha256: createHash('sha256').update(contents).digest('hex'),
});
const stored = await fetch(upload.url, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/geo+json' },
  body: contents,
});
assert(stored.ok, 'Signed private import upload succeeds');
await api('editor', 'import-run', {
  importId: source.job.id,
  phase: 'inspect',
});
const inspected = await waitFor(
  () =>
    api<{ job: CampusImport }>('editor', 'import-get', {
      importId: source.job.id,
    }),
  (value) => !['queued', 'running'].includes(value.job.status),
  'Isolated file import',
);
assert.equal(inspected.job.status, 'mapping', inspected.job.message);
const layer = inspected.job.summary?.layers[0];
assert(layer, 'File inspection returns a mappable layer');
await api('editor', 'import-run', {
  importId: source.job.id,
  phase: 'preview',
  configuration: {
    layers: [
      { layer: layer.name, role: 'overlay', idField: 'id', nameField: 'name' },
    ],
    attribution: 'TurnRight synthetic local fixture',
    license: 'Synthetic acceptance fixture',
    redistributionConfirmed: true,
  },
});
const preview = await waitFor(
  () =>
    api<{ job: CampusImport }>('editor', 'import-get', {
      importId: source.job.id,
    }),
  (value) => !['queued', 'running'].includes(value.job.status),
  'File preview',
);
assert.equal(preview.job.status, 'preview', preview.job.message);
await api('editor', 'import-queue', { importId: source.job.id });
const queued = await waitFor(
  () =>
    api<{ job: CampusImport }>('editor', 'import-get', {
      importId: source.job.id,
    }),
  (value) => !['queued', 'running'].includes(value.job.status),
  'Source proposal staging',
);
assert.equal(queued.job.status, 'reviewed', queued.job.message);
const proposals = await api<SourcePage>('editor', 'source-updates-list', {
  filters: { source: 'import:' + source.job.source_id },
});
assert(proposals.rows.length > 0, 'Uploaded file creates reviewable proposals');
const operation = await api<SourceOperation>(
  'editor',
  'source-updates-prepare',
  {
    operationId: randomUUID(),
    selection: {
      mode: 'ids',
      items: proposals.rows.map(({ id, revision }) => ({ id, revision })),
    },
  },
);
await api('editor', 'source-updates-control', {
  operationId: operation.id,
  command: 'start',
  accept: true,
});
const reviewed = await waitFor(
  () =>
    api<SourceHistory>('editor', 'source-updates-history', {
      operationId: operation.id,
    }),
  (value) =>
    value.operations.some(
      (row) =>
        row.id === operation.id &&
        !['prepared', 'queued', 'running'].includes(row.status),
    ),
  'Source review worker',
);
const completed = reviewed.operations.find((row) => row.id === operation.id)!;
assert.equal(completed.status, 'completed');
assert(
  completed.applied > 0 && completed.failed === 0,
  'Source review applies the synthetic proposals',
);
const toCancel = await api<{ job: CampusImport }>('editor', 'import-start', {
  kind: 'file',
  name: 'Cancelled synthetic import',
});
await api('editor', 'import-cancel', { importId: toCancel.job.id });
const cancelled = await api<{ job: CampusImport }>('editor', 'import-get', {
  importId: toCancel.job.id,
});
assert.equal(cancelled.job.status, 'cancelled');
await writeFile(
  path.join(runtime, 'acceptance-receipt.json'),
  JSON.stringify({
    datasetName,
    assets,
    revision: String(
      await command('git', ['rev-parse', 'HEAD'], { capture: true }),
    ).trim(),
    completedAt: new Date().toISOString(),
  }),
);
console.log(
  'Real Auth, role/campus isolation, persistent editing, independent review, spatial analysis, export, private media/model storage, file imports, source review and cancellation passed.',
);
