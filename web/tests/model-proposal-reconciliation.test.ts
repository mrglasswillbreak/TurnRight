import { expect, it } from 'vitest';
import {
  reconcileModelBatchReadback,
  type ModelReadbackInput,
} from '../../scripts/model-proposal-reconciliation.mts';
import { proposalIds } from '../../scripts/model-proposal-plan.mts';
import { evidenceHash } from '../../scripts/cloud.mjs';
import type { Dataset } from '../src/gis-types';
import type { MapEdit } from '../src/types';

function fixture(split = false): ModelReadbackInput {
  const dataset = (id: string): Dataset => ({
    id,
    campus_id: 'lasu',
    name: 'Private dataset name',
    schema: { version: 1, fields: [] },
    source_crs: 'EPSG:4326',
    analysis_crs: 'EPSG:32631',
    provenance: { source: 'arcgis' },
    style: { mode: 'single', color: '#1764ed' },
    included: false,
    revision: 200,
    saved_filters: [],
  });
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
  const datasetId = (index: number) =>
    split && index >= 8 ? 'second' : 'first';
  const edits: MapEdit[] = [
    {
      id: 'untouched',
      kind: 'path',
      geometry: {
        type: 'LineString',
        coordinates: [
          [3, 6],
          [3.1, 6.1],
        ],
      },
      properties: { name: 'Private path label' },
      updated_at: '2026-10-01T00:00:00Z',
    },
  ];
  const before: ModelReadbackInput['before'] = {
    features: proposalIds.map((id, index) => ({
      id: `feature:${id}`,
      source: 'arcgis',
      entity: 'feature',
      hash: `source-${index}`,
      payload: {
        type: 'Feature',
        geometry,
        properties: {
          id,
          kind: 'building',
          name: `Private building ${index}`,
          mapLayerId: datasetId(index),
          importLayer: 'University_Property',
        },
      },
    })),
    edits,
    datasets: [dataset('first'), dataset('second'), dataset('untouched')],
    attributes: [
      {
        dataset_id: 'first',
        feature_key: 'building:private',
        values: { note: 'Private attribute' },
      },
    ],
  };
  const items = proposalIds.map((id, index) => ({
    edit: {
      id,
      kind: 'building' as const,
      geometry,
      properties: {
        ...(before.features[index].entity === 'feature'
          ? before.features[index].payload.properties
          : {}),
        modelDocumentAsset: {
          id: `asset-${index}`,
          version: 1 as const,
          bytes: 100,
          sha256: 'a'.repeat(64),
        },
        reviewedModelRevision: `model-${index}`,
      },
    },
  }));
  // Mix existing and new targets; their server timestamps may legitimately advance.
  before.edits.push({
    ...structuredClone(items[0].edit),
    properties: { name: 'Existing private correction' },
    updated_at: 'old-time',
  });
  const current = structuredClone(before);
  current.edits = [
    structuredClone(edits[0]),
    ...items.map(({ edit }) => ({
      ...structuredClone(edit),
      deleted: false,
      campus_id: 'lasu',
      edited_by: 'owner',
      updated_at: '2026-11-01T12:00:00Z',
    })),
  ];
  current.datasets![0].revision += split ? 8 : 20;
  if (split) current.datasets![1].revision += 12;
  return {
    before,
    current,
    items,
    datasets: proposalIds.map((id, index) => ({
      kind: 'building',
      id,
      beforeDatasetId: datasetId(index),
      currentDatasetId: datasetId(index),
      currentIndexDatasetId: datasetId(index),
    })),
  };
}

it('reconciles exactly 20 SQL-trigger revision increments and target server metadata without mutating snapshots', () => {
  const input = fixture();
  const original = structuredClone(input);
  const report = reconcileModelBatchReadback(input);
  expect(report.ok).toBe(true);
  expect(report.targetCount).toBe(20);
  expect(report.expectedDatasetDeltas).toEqual([
    {
      id: 'first',
      delta: 20,
      beforeRevision: 200,
      expectedRevision: 220,
      currentRevision: 220,
    },
  ]);
  expect(report.beforeHash).toBe(evidenceHash(input.before));
  expect(report.currentHash).toBe(evidenceHash(input.current));
  expect(input).toEqual(original);
});

it('counts distinct per-building memberships across multiple existing datasets', () => {
  const report = reconcileModelBatchReadback(fixture(true));
  expect(report.ok).toBe(true);
  expect(
    report.expectedDatasetDeltas.map(({ id, delta }) => ({ id, delta })),
  ).toEqual([
    { id: 'first', delta: 8 },
    { id: 'second', delta: 12 },
  ]);
});

it.each([0, 19, 21, -1])(
  'rejects affected revision delta %s instead of exactly 20',
  (delta) => {
    const input = fixture();
    input.current.datasets![0].revision = 200 + delta;
    const report = reconcileModelBatchReadback(input);
    expect(report.ok).toBe(false);
    expect(
      report.differences.some(
        ({ path }) => path === '/workspace/datasets/0/revision',
      ),
    ).toBe(true);
  },
);

it.each([
  'schema',
  'style',
  'provenance',
  'included',
  'saved_filters',
  'source_crs',
  'revision',
] as const)(
  'rejects protected dataset %s changes, including unrelated revisions',
  (field) => {
    const input = fixture();
    const row = input.current.datasets![
      field === 'revision' ? 2 : 0
    ] as unknown as Record<string, unknown>;
    row[field] =
      field === 'revision' ? 201 : { unauthorized: 'Private changed scalar' };
    expect(reconcileModelBatchReadback(input).ok).toBe(false);
  },
);

it.each(['new', 'missing', 'duplicate', 'reordered', 'other-campus'] as const)(
  'rejects %s dataset rows',
  (mode) => {
    const input = fixture();
    const rows = input.current.datasets!;
    if (mode === 'new') rows.push({ ...rows[0], id: 'new-dataset' });
    if (mode === 'missing') rows.shift();
    if (mode === 'duplicate') rows.push(structuredClone(rows[0]));
    if (mode === 'reordered') rows.reverse();
    if (mode === 'other-campus') rows[0].campus_id = 'unilag';
    expect(reconcileModelBatchReadback(input).ok).toBe(false);
  },
);

it.each(['items', 'datasets'] as const)(
  'requires exactly 20 distinct audited IDs in %s',
  (field) => {
    for (const mode of ['missing', 'duplicate', 'extra']) {
      const input = fixture();
      if (field === 'items') {
        if (mode === 'missing') input.items.pop();
        if (mode === 'duplicate')
          input.items[1] = structuredClone(input.items[0]);
        if (mode === 'extra')
          input.items.push({
            edit: { ...input.items[0].edit, id: 'unaudited' },
          });
      } else {
        if (mode === 'missing') input.datasets.pop();
        if (mode === 'duplicate')
          input.datasets[1] = structuredClone(input.datasets[0]);
        if (mode === 'extra')
          input.datasets.push({ ...input.datasets[0], id: 'unaudited' });
      }
      expect(reconcileModelBatchReadback(input).ok, mode).toBe(false);
    }
  },
);

it.each([
  'currentDatasetId',
  'currentIndexDatasetId',
  'beforeDatasetId',
] as const)('rejects unproven or moved %s membership', (field) => {
  const input = fixture();
  input.datasets[0][field] = 'second';
  expect(reconcileModelBatchReadback(input).ok).toBe(false);
});

it.each(['mapLayerId', 'importLayer', 'kind'] as const)(
  'rejects operation-request changes to dataset binding %s',
  (field) => {
    const input = fixture();
    input.items[0].edit.properties[field] = 'changed';
    input.current.edits[1].properties[field] = 'changed';
    expect(reconcileModelBatchReadback(input).ok).toBe(false);
  },
);

it.each([
  'source-order',
  'source-value',
  'attribute',
  'non-target-time',
  'extra-row',
  'target-missing',
  'target-duplicate',
  'target-geometry',
  'target-model',
  'target-deleted',
  'target-extra-metadata',
] as const)(
  'rejects %s changes outside the permitted trigger effect',
  (mode) => {
    const input = fixture();
    if (mode === 'source-order') input.current.features.reverse();
    if (mode === 'source-value')
      input.current.features[0].source = 'other-source';
    if (mode === 'attribute')
      input.current.attributes![0].values.note = 'changed';
    if (mode === 'non-target-time')
      input.current.edits[0].updated_at = 'new-time';
    if (mode === 'extra-row')
      input.current.edits.push({ ...input.current.edits[0], id: 'new-path' });
    if (mode === 'target-missing') input.current.edits.pop();
    if (mode === 'target-duplicate')
      input.current.edits.push(structuredClone(input.current.edits[1]));
    if (mode === 'target-geometry')
      input.current.edits[1].geometry = { type: 'Point', coordinates: [4, 7] };
    if (mode === 'target-model')
      input.current.edits[1].properties.modelDocumentAsset!.sha256 = 'b'.repeat(
        64,
      );
    if (mode === 'target-deleted') input.current.edits[1].deleted = true;
    if (mode === 'target-extra-metadata')
      Object.assign(input.current.edits[1], { surprise: 'private' });
    expect(reconcileModelBatchReadback(input).ok, mode).toBe(false);
  },
);

it('preserves unknown snapshot sections and their ordering, and emits only bounded hashed differences', () => {
  const input = fixture();
  const privateRows = Array.from({ length: 150 }, (_, i) => ({
    id: i,
    note: `Private secret ${i}`,
  }));
  Object.assign(input.before, { views: privateRows, issues: [], tables: [] });
  Object.assign(input.current, {
    views: [...privateRows].reverse(),
    issues: [],
    tables: [],
  });
  const report = reconcileModelBatchReadback(input);
  expect(report.ok).toBe(false);
  expect(report.differenceCount).toBeGreaterThan(100);
  expect(report.differences).toHaveLength(100);
  expect(JSON.stringify(report)).not.toContain('Private');
  expect(
    report.differences.every((difference) =>
      /^[a-f0-9]{64}$/.test(difference.currentHash!),
    ),
  ).toBe(true);
});

it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER])(
  'rejects invalid or overflowing baseline revision %s',
  (revision) => {
    const input = fixture();
    input.before.datasets![0].revision = revision;
    input.current.datasets![0].revision = revision + 20;
    expect(reconcileModelBatchReadback(input).ok).toBe(false);
  },
);
