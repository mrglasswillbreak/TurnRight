import { expect, it, vi } from 'vitest';
import {
  modelDatasetMappings,
  readModelDatasetMembership,
} from '../../scripts/model-proposal-datasets.mts';
import { proposalIds } from '../../scripts/model-proposal-inventory.mts';
import type { GisSnapshot } from '../server/gis-publication';
import type { Dataset } from '../src/gis-types';

function fixture() {
  const geometry = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [3, 6],
        [3.1, 6],
        [3.1, 6.1],
        [3, 6],
      ],
    ],
  };
  const dataset = (id: string): Dataset => ({
    id,
    campus_id: 'lasu',
    name: 'Buildings',
    schema: { version: 1, fields: [] },
    source_crs: 'EPSG:4326',
    analysis_crs: 'EPSG:32631',
    provenance: {},
    style: { mode: 'single', color: '#1764ed' },
    included: false,
    revision: 1,
    saved_filters: [],
  });
  const datasetFor = (index: number) =>
    index < 3 ? 'one' : index < 19 ? 'two' : 'three';
  const snapshot: GisSnapshot = {
    features: proposalIds.map((id, index) => ({
      id: `feature:${id}`,
      source: 'arcgis',
      entity: 'feature',
      hash: `hash-${index}`,
      payload: {
        type: 'Feature',
        geometry,
        properties: {
          id,
          kind: 'building',
          name: 'Source name',
          importLayer: 'University_Property',
          mapLayerId: datasetFor(index),
        },
      },
    })),
    edits: [
      {
        id: proposalIds[0],
        kind: 'building',
        geometry,
        properties: {
          name: 'Saved correction',
          sourceDetail: 'preserved',
          kind: 'ignored-by-SQL',
          id: 'ignored-by-SQL',
        },
      },
    ],
    datasets: ['one', 'two', 'three'].map(dataset),
  };
  const index = proposalIds.map((id, n) => ({
    campus_id: 'lasu',
    feature_key: `building:${id}`,
    dataset_id: datasetFor(n),
  }));
  const read = vi.fn(
    async (
      route: string,
      method?: 'GET' | 'POST',
      body?: unknown,
    ): Promise<unknown> => {
      if (route.startsWith('gis_feature_index?')) {
        expect(method).toBe('GET');
        expect(body).toBeUndefined();
        return index;
      }
      expect(route).toBe('rpc/gis_dataset_key');
      expect(method).toBe('POST');
      const input = body as {
        source: string;
        properties: Record<string, unknown>;
      };
      expect(input.source).toBe('arcgis');
      return input.properties.mapLayerId;
    },
  );
  return { snapshot, index, read };
}

it('proves all 20 memberships with explicitly campus-scoped index reads and SQL-equivalent pure RPC inputs', async () => {
  const { snapshot, index, read } = fixture();
  const original = structuredClone(snapshot);
  const memberships = await readModelDatasetMembership(snapshot, read);
  const query = new URL(read.mock.calls[0][0], 'https://database.invalid/')
    .searchParams;
  expect(query.get('campus_id')).toBe('eq.lasu');
  expect(query.get('feature_key')).toBe(
    `in.(${proposalIds.map((id) => `building:${id}`).join(',')})`,
  );
  expect(query.get('limit')).toBe('21');
  expect(read).toHaveBeenCalledTimes(21);
  expect(read.mock.calls[1]).toEqual([
    'rpc/gis_dataset_key',
    'POST',
    {
      source: 'arcgis',
      properties: {
        id: proposalIds[0],
        kind: 'building',
        name: 'Saved correction',
        sourceDetail: 'preserved',
        importLayer: 'University_Property',
        mapLayerId: 'one',
      },
    },
  ]);
  expect(memberships).toEqual(
    proposalIds.map((id, i) => ({
      kind: 'building',
      id,
      datasetId: index[i].dataset_id,
      indexDatasetId: index[i].dataset_id,
    })),
  );
  expect(snapshot).toEqual(original);
  expect(modelDatasetMappings(memberships, memberships)[0]).toEqual({
    kind: 'building',
    id: proposalIds[0],
    beforeDatasetId: 'one',
    currentDatasetId: 'one',
    currentIndexDatasetId: 'one',
  });
});

it('rejects a stale derived index before the caller can proceed to any write', async () => {
  const { snapshot, index, read } = fixture();
  index[0].dataset_id = 'two';
  const write = vi.fn();
  await expect(
    (async () => {
      await readModelDatasetMembership(snapshot, read);
      write();
    })(),
  ).rejects.toThrow('stale');
  expect(write).not.toHaveBeenCalled();
  expect(read).toHaveBeenCalledTimes(2);
});

it.each(['campus', 'missing', 'duplicate', 'extra', 'other-kind'] as const)(
  'rejects %s index identities without deriving dataset keys',
  async (mode) => {
    const { snapshot, index, read } = fixture();
    if (mode === 'campus') index[0].campus_id = 'unilag';
    if (mode === 'missing') index.pop();
    if (mode === 'duplicate') index[1] = structuredClone(index[0]);
    if (mode === 'extra')
      index.push({ ...index[0], feature_key: 'building:other' });
    if (mode === 'other-kind') index[0].feature_key = `place:${proposalIds[0]}`;
    await expect(readModelDatasetMembership(snapshot, read)).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(1);
  },
);

it.each([
  'missing-source',
  'duplicate-source',
  'deleted',
  'reverted',
  'duplicate-edit',
] as const)('rejects ambiguous %s target state', async (mode) => {
  const { snapshot, read } = fixture();
  if (mode === 'missing-source') snapshot.features.shift();
  if (mode === 'duplicate-source')
    snapshot.features.push(structuredClone(snapshot.features[0]));
  if (mode === 'deleted') snapshot.edits[0].deleted = true;
  if (mode === 'reverted') snapshot.edits[0].properties.revertToSource = true;
  if (mode === 'duplicate-edit')
    snapshot.edits.push(structuredClone(snapshot.edits[0]));
  await expect(readModelDatasetMembership(snapshot, read)).rejects.toThrow(
    'one active source',
  );
});

it.each(['missing', 'duplicate', 'foreign'] as const)(
  'requires the %s dataset to be rejected before save',
  async (mode) => {
    const { snapshot, read } = fixture();
    if (mode === 'missing') snapshot.datasets!.shift();
    if (mode === 'duplicate')
      snapshot.datasets!.push(structuredClone(snapshot.datasets![0]));
    if (mode === 'foreign') snapshot.datasets![0].campus_id = 'unilag';
    await expect(readModelDatasetMembership(snapshot, read)).rejects.toThrow(
      'already exist',
    );
  },
);

it('uses the RPC result for inferred keys instead of inventing a client-side MD5 algorithm', async () => {
  const { snapshot, index } = fixture();
  for (const source of snapshot.features)
    if (source.entity === 'feature')
      delete source.payload.properties!.mapLayerId;
  const read = vi.fn(
    async (route: string, method?: 'GET' | 'POST', body?: unknown) => {
      if (method === 'GET') return index;
      expect(route).toBe('rpc/gis_dataset_key');
      const id = (body as { properties: { id: string } }).properties.id;
      return index.find((row) => row.feature_key === `building:${id}`)!
        .dataset_id;
    },
  );
  expect(await readModelDatasetMembership(snapshot, read)).toHaveLength(20);
});

it.each(['duplicate', 'missing', 'index', 'membership'] as const)(
  'rejects %s pre/post proof mismatches',
  async (mode) => {
    const { snapshot, read } = fixture();
    const before = await readModelDatasetMembership(snapshot, read);
    const current = structuredClone(before);
    if (mode === 'duplicate') current[1] = structuredClone(current[0]);
    if (mode === 'missing') current.pop();
    if (mode === 'index') current[0].indexDatasetId = 'two';
    if (mode === 'membership')
      current[0].datasetId = current[0].indexDatasetId = 'two';
    expect(() => modelDatasetMappings(before, current)).toThrow();
  },
);
