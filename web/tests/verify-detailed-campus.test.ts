import { expect, it } from 'vitest';
import { inspectDetailedCampus } from '../scripts/verify-detailed-campus.mjs';

function fixture() {
  const core = {
    url: '/packages/lasu-abc123/campus.json',
    bytes: 1,
    sha256: 'a'.repeat(64),
  };
  const assets = [0, 1, 2].map((index) => ({
    url: `/packages/detail-${String(index).repeat(64)}.json.gz`,
    sha256: String(index).repeat(64),
    bytes: 1,
  }));
  const model = {
    id: 'building',
    geometryRevision: 'geometry',
    detailRevision: 'detail',
    levels: assets.map((asset, level) => ({
      level,
      triangles: 12,
      assets: [asset],
    })),
    textures: [],
  };
  const data = {
    visuals: {
      buildings: [
        {
          id: model.id,
          geometryRevision: 'geometry',
          detailRevision: 'detail',
        },
      ],
      detailedModels: [model],
    },
  };
  const manifest = {
    schemaVersion: 3,
    version: 'lasu-abc123',
    dataUrl: core.url,
    assets: [core, ...assets],
    bytes: 4,
    detailedModels: { bytes: 3, assetUrls: assets.map((asset) => asset.url) },
  };
  return { data, manifest, model };
}

it('accepts all three published levels and allows compatible releases without details', () => {
  const { data, manifest } = fixture();
  expect(inspectDetailedCampus(data, manifest)).toHaveLength(1);
  const base = {
    ...manifest,
    assets: [manifest.assets[0]],
    bytes: 1,
    detailedModels: undefined,
  };
  expect(inspectDetailedCampus({}, base)).toEqual([]);
  expect(inspectDetailedCampus({}, base, '')).toEqual([]);
});

function campaignFixture() {
  const { data, manifest, model } = fixture();
  data.visuals.detailedModels = Array.from({ length: 20 }, (_, index) => ({
    ...model,
    id: `building-${index}`,
  }));
  data.visuals.buildings = data.visuals.detailedModels.map((entry) => ({
    id: entry.id,
    geometryRevision: entry.geometryRevision,
    detailRevision: entry.detailRevision,
  }));
  const expected = JSON.stringify(
    data.visuals.detailedModels.map((entry) => entry.id).reverse(),
  );
  return { data, manifest, expected };
}

it('requires every independently pinned release model regardless of catalogue order', () => {
  const { data, manifest, expected } = campaignFixture();
  expect(inspectDetailedCampus(data, manifest, expected)).toHaveLength(20);
});

it.each(['missing one', 'replaced identity', 'missing all'])(
  'rejects a consistent catalogue with %s when twenty model IDs are pinned',
  (failure) => {
    const { data, manifest, expected } = campaignFixture();
    if (failure === 'missing one') data.visuals.detailedModels.pop();
    if (failure === 'replaced identity') {
      data.visuals.detailedModels[19].id = 'unexpected-building';
      data.visuals.buildings[19].id = 'unexpected-building';
    }
    const published =
      failure === 'missing all'
        ? {
            ...manifest,
            assets: [manifest.assets[0]],
            bytes: 1,
            detailedModels: undefined,
          }
        : manifest;
    if (failure === 'missing all') data.visuals.detailedModels = [];
    expect(inspectDetailedCampus(data, published)).toHaveLength(
      failure === 'missing all' ? 0 : failure === 'missing one' ? 19 : 20,
    );
    expect(() => inspectDetailedCampus(data, published, expected)).toThrow(
      'Published detailed model IDs do not match the requested release',
    );
  },
);

it.each([
  'not-json',
  'null',
  '{}',
  '[]',
  '[null]',
  '[""]',
  '[" "]',
  '[" building"]',
  '["building", 1]',
  '["building", "building"]',
])('rejects malformed expected model IDs: %s', (expected) => {
  const { data, manifest } = fixture();
  expect(() => inspectDetailedCampus(data, manifest, expected)).toThrow(
    'Expected model IDs must be a nonempty JSON array of unique nonblank strings',
  );
});

it.each([
  'missing model',
  'stale revision',
  'missing level',
  'duplicate level',
  'empty level',
  'different asset hash',
  'duplicate model',
])(
  'rejects %s before offline verification can pass on base geometry',
  (failure) => {
    const { data, manifest, model } = fixture();
    if (failure === 'missing model') data.visuals.detailedModels = [];
    if (failure === 'stale revision') model.detailRevision = 'stale';
    if (failure === 'missing level') model.levels.pop();
    if (failure === 'duplicate level') model.levels[2].level = 1;
    if (failure === 'empty level') model.levels[0].triangles = 0;
    if (failure === 'different asset hash')
      model.levels[0].assets = [
        { ...model.levels[0].assets[0], sha256: 'f'.repeat(64) },
      ];
    if (failure === 'duplicate model') data.visuals.detailedModels.push(model);
    expect(() => inspectDetailedCampus(data, manifest)).toThrow();
  },
);
