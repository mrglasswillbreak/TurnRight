import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkedDataset, datasetAction } from '../server/gis-datasets';
import type { Dataset, SavedMapView } from '../src/gis-types';
import { withCampusId } from '../server/campus-scope';

const operationId = 'b42efb5a-b4d3-43c0-9e41-732aca364f84';
const dataset = (): Dataset => ({
  id: 'gis:trees',
  campus_id: 'lasu',
  name: 'Trees',
  revision: 4,
  schema: {
    version: 1,
    fields: [
      { name: 'height', type: 'number', public: true },
      { name: 'species', type: 'text', public: true },
    ],
  },
  source_crs: 'EPSG:4326',
  analysis_crs: 'EPSG:32631',
  included: true,
  provenance: {},
  style: { mode: 'single', color: '#116633' },
  saved_filters: [],
});
const view = (): SavedMapView => ({
  id: operationId,
  revision: 2,
  name: 'Trees',
  center: [3.2, 6.46],
  zoom: 16,
  pitch: 30,
  bearing: 0,
  datasets: ['gis:trees'],
});
const calls: {
  url: URL;
  body: Record<string, unknown> | undefined;
  headers: Headers;
}[] = [];
beforeEach(() => {
  calls.length = 0;
  vi.stubEnv('SUPABASE_URL', 'https://dataset-test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url: new URL(url),
        body: init.body ? JSON.parse(String(init.body)) : undefined,
        headers: new Headers(init.headers),
      });
      return new Response(
        JSON.stringify(
          url.includes('gis_views?')
            ? [{ view: { name: 'Saved' }, revision: 7 }]
            : { ok: true },
        ),
      );
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('uses the verified actor, dataset revision and campus when dispatching dataset operations', async () => {
  await withCampusId('north', async () => {
    expect(await datasetAction('owner', 'gis-views', {})).toEqual([
      { name: 'Saved', revision: 7 },
    ]);
    expect(calls.at(-1)!.url.searchParams.get('campus_id')).toBe('eq.north');
    for (const [action, input, rpc] of [
      ['gis-view-save', { view: view(), operationId }, 'gis_save_view'],
      ['gis-datasets', {}, 'gis_dataset_catalogue'],
      [
        'gis-query',
        { datasetId: 'gis:trees', revision: 4, limit: 20 },
        'gis_query',
      ],
      [
        'gis-feature',
        { datasetId: 'gis:trees', key: 'tree:1', revision: 4 },
        'gis_read_feature',
      ],
      [
        'gis-statistics',
        { datasetId: 'gis:trees', field: 'height', revision: 4 },
        'gis_statistics',
      ],
      [
        'gis-dataset-save',
        { dataset: dataset(), operationId, expectedRevision: 4 },
        'gis_save_dataset',
      ],
      [
        'gis-attributes-save',
        {
          datasetId: 'gis:trees',
          operationId,
          expectedRevision: 4,
          features: [{ key: 'tree:1', values: { height: 12 } }],
        },
        'gis_save_attributes',
      ],
    ] as const) {
      await datasetAction('owner', action, input);
      expect(calls.at(-1)!.url.pathname).toBe(`/rest/v1/rpc/${rpc}`);
      expect(calls.at(-1)!.body!.actor).toBe('owner');
      expect(calls.at(-1)!.headers.get('X-TurnRight-Campus')).toBe('north');
    }
    expect(calls.at(-1)!.body).toMatchObject({
      expected_revision: 4,
      operation_id: operationId,
      items: [{ key: 'tree:1', values: { height: 12 } }],
    });
  });
});

it.each([
  ['gis-view-save', { operationId, view: { ...view(), center: [181, 6] } }],
  ['gis-view-save', { operationId, view: { ...view(), datasets: [12] } }],
  ['gis-feature', { datasetId: 'gis:trees', key: 'k', revision: 1.2 }],
  [
    'gis-statistics',
    { datasetId: 'gis:trees', field: '__proto__', revision: 4 },
  ],
  [
    'gis-dataset-save',
    { dataset: dataset(), operationId: 'bad', expectedRevision: 4 },
  ],
  [
    'gis-attributes-save',
    { datasetId: 'gis:trees', operationId, expectedRevision: 4, features: [] },
  ],
  [
    'gis-attributes-save',
    {
      datasetId: 'gis:trees',
      operationId,
      expectedRevision: 4,
      features: [{ key: 'k', values: [] }],
    },
  ],
  [
    'gis-attributes-save',
    {
      datasetId: 'gis:trees',
      operationId,
      expectedRevision: 4,
      features: [{ key: 'k', values: { 'bad.field': 2 } }],
    },
  ],
  ['gis-csv-import', { operationId, name: '', csv: 'a\n1' }],
  ['gis-csv-import', { operationId, name: 'Trees', csv: 'a,a\n1,2' }],
  ['unknown', {}],
] as const)(
  'rejects malformed %s before contacting the database',
  async (action, input) => {
    await expect(datasetAction('owner', action, input)).rejects.toMatchObject({
      status: 400,
    });
    expect(calls).toEqual([]);
  },
);

it('imports typed CSV values without losing leading-zero identities', async () => {
  await datasetAction('owner', 'gis-csv-import', {
    operationId,
    name: 'Trees',
    csv: 'id,height,alive\n001,12,true\n002,,false',
  });
  expect(calls.at(-1)!.body).toMatchObject({
    dataset_name: 'Trees',
    operation_id: operationId,
    rows: [
      { id: '001', height: 12, alive: true },
      { id: '002', height: null, alive: false },
    ],
  });
});

it('rejects mismatched classification types and unsafe presentation fields', () => {
  const d = dataset();
  const styles: Dataset['style'][] = [
    { mode: 'single', color: 'red' },
    { mode: 'single', color: '#116633', labelField: 'missing' },
    {
      mode: 'categorical',
      color: '#116633',
      field: 'height',
      classes: [{ label: 'Tall', color: '#ffffff', value: 'bad' }],
    },
    {
      mode: 'graduated',
      color: '#116633',
      field: 'species',
      classes: [{ label: 'Tall', color: '#ffffff', maximum: 10 }],
    },
    {
      mode: 'graduated',
      color: '#116633',
      field: 'height',
      classes: [{ label: 'Tall', color: '#ffffff' }],
    },
    { mode: 'categorical', color: '#116633', field: 'species', classes: [] },
    { mode: 'single', color: '#116633', sizeField: 'species' },
  ];
  for (const style of styles)
    expect(() => checkedDataset({ ...d, style })).toThrow();
  expect(() =>
    checkedDataset({
      ...d,
      saved_filters: [{ name: 'Other dataset', query: { datasetId: 'other' } }],
    }),
  ).toThrow(/filters/);
  const valid = {
    ...d,
    style: {
      mode: 'graduated' as const,
      color: '#116633',
      field: 'height',
      classes: [{ label: 'Tall', color: '#ffffff', maximum: 10 }],
    },
  };
  expect(checkedDataset(valid)).toEqual(valid);
});
