/** Read-only reconciliation of a saved LASU model batch, including GIS triggers. */
import { evidenceHash } from './cloud.mjs';
import { proposalIds } from './model-proposal-inventory.mts';
import type { GisSnapshot } from '../web/server/gis-publication';
import type { MapEdit } from '../web/src/types';

export interface ModelDatasetMapping {
  kind: 'building';
  id: string;
  beforeDatasetId: string;
  currentDatasetId: string;
  currentIndexDatasetId: string;
}
export interface ModelReadbackInput {
  before: GisSnapshot;
  current: GisSnapshot;
  items: { edit: MapEdit }[];
  /** Keys resolved by gis_dataset_key RPC, with the current index independently read. */
  datasets: ModelDatasetMapping[];
}
interface Difference {
  path: string;
  reason: string;
  beforeHash: string | null;
  currentHash: string | null;
}
interface DatasetDelta {
  id: string;
  delta: number;
  beforeRevision: number;
  expectedRevision: number;
  currentRevision: number | null;
}
const valueHash = (value: unknown) =>
  value === undefined ? null : evidenceHash(value);
const rowKey = (row: { kind: string; id: string }) => `${row.kind}:${row.id}`;
const targetKeys = proposalIds.map((id) => `building:${id}`).sort();
const pointer = (path: string, key: string | number) =>
  `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function reconcileModelBatchReadback(input: ModelReadbackInput) {
  const { before, current, items, datasets } = input;
  const differences: Difference[] = [];
  let differenceCount = 0;
  const add = (
    path: string,
    reason: string,
    previous: unknown,
    next: unknown,
  ) => {
    differenceCount++;
    if (differences.length < 100)
      differences.push({
        path,
        reason,
        beforeHash: valueHash(previous),
        currentHash: valueHash(next),
      });
  };
  const compare = (previous: unknown, next: unknown, path: string) => {
    if (Object.is(previous, next)) return;
    if (Array.isArray(previous) && Array.isArray(next)) {
      if (previous.length !== next.length)
        add(
          `${path}/length`,
          'Array length changed',
          previous.length,
          next.length,
        );
      for (let i = 0; i < Math.max(previous.length, next.length); i++)
        compare(previous[i], next[i], pointer(path, i));
      return;
    }
    if (object(previous) && object(next)) {
      for (const key of [
        ...new Set([...Object.keys(previous), ...Object.keys(next)]),
      ].sort())
        compare(previous[key], next[key], pointer(path, key));
      return;
    }
    add(path, 'Protected value changed', previous, next);
  };
  const requireInventory = (keys: string[], path: string) => {
    if (evidenceHash([...keys].sort()) !== evidenceHash(targetKeys))
      add(
        path,
        'Expected the exact 20 unique building identities',
        targetKeys,
        keys,
      );
  };
  requireInventory(
    items.map(({ edit }) => rowKey(edit)),
    '/items',
  );
  requireInventory(datasets.map(rowKey), '/datasetMappings');
  const targetSet = new Set(targetKeys);
  const targets = new Map(items.map(({ edit }) => [rowKey(edit), edit]));
  for (const [label, snapshot] of [
    ['before', before],
    ['current', current],
  ] as const) {
    for (const key of targetKeys) {
      const count = snapshot.edits.filter((row) => rowKey(row) === key).length;
      if (count > 1 || (label === 'current' && count !== 1))
        add(`/${label}/edits`, 'Missing or duplicate target row', key, count);
    }
  }
  const binding = (snapshot: GisSnapshot, id: string) => {
    const sources = snapshot.features.filter(
      (source) =>
        source.entity === 'feature' &&
        source.payload.properties?.kind === 'building' &&
        source.payload.properties?.id === id,
    );
    if (sources.length !== 1)
      add(
        '/features',
        'A target must have exactly one source building',
        id,
        sources.length,
      );
    const source = sources[0];
    const edit = snapshot.edits.find(
      (row) => row.kind === 'building' && row.id === id,
    );
    if (edit?.deleted || edit?.properties.revertToSource)
      add(
        '/edits',
        'Deleted or reverted target cannot be reconciled',
        id,
        edit,
      );
    const properties = {
      ...(source?.entity === 'feature' ? source.payload.properties : {}),
      ...edit?.properties,
    };
    return {
      source: source?.source,
      mapLayerId: properties.mapLayerId,
      importLayer: properties.importLayer,
      kind: properties.kind,
    };
  };
  const counts = new Map<string, number>();
  for (const [index, mapping] of datasets.entries()) {
    const path = `/datasetMappings/${index}`;
    if (
      !mapping.beforeDatasetId ||
      mapping.beforeDatasetId !== mapping.currentDatasetId ||
      mapping.beforeDatasetId !== mapping.currentIndexDatasetId
    ) {
      add(
        path,
        'Dataset key or current index membership changed',
        mapping.beforeDatasetId,
        {
          key: mapping.currentDatasetId,
          index: mapping.currentIndexDatasetId,
        },
      );
      continue;
    }
    compare(
      binding(before, mapping.id),
      binding(current, mapping.id),
      `${path}/binding`,
    );
    counts.set(
      mapping.beforeDatasetId,
      (counts.get(mapping.beforeDatasetId) || 0) + 1,
    );
  }
  const expectedDatasetDeltas: DatasetDelta[] = [];
  const expectedDatasets = structuredClone(before.datasets || []);
  for (const [id, delta] of [...counts].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const previous = expectedDatasets.filter((row) => row.id === id);
    const accepted = (current.datasets || []).filter((row) => row.id === id);
    if (
      previous.length !== 1 ||
      accepted.length !== 1 ||
      previous[0]?.campus_id !== 'lasu' ||
      accepted[0]?.campus_id !== 'lasu'
    ) {
      add(
        '/datasets',
        'Affected dataset must already exist exactly once in LASU',
        previous,
        accepted,
      );
      continue;
    }
    const revision = previous[0].revision;
    if (
      !Number.isSafeInteger(revision) ||
      revision < 1 ||
      !Number.isSafeInteger(revision + delta)
    ) {
      add(
        '/datasets',
        'Dataset revision must be a positive safe integer',
        revision,
        accepted[0].revision,
      );
      continue;
    }
    expectedDatasetDeltas.push({
      id,
      delta,
      beforeRevision: revision,
      expectedRevision: revision + delta,
      currentRevision: Number.isSafeInteger(accepted[0].revision)
        ? accepted[0].revision
        : null,
    });
    previous[0].revision = revision + delta;
  }
  const protectedRows = (snapshot: GisSnapshot) => ({
    ...snapshot,
    edits: snapshot.edits.filter((row) => !targetSet.has(rowKey(row))),
  });
  compare(
    { ...protectedRows(before), datasets: expectedDatasets },
    protectedRows(current),
    '/workspace',
  );
  const targetContent = (edit: MapEdit) => {
    const result: Record<string, unknown> = {
      campus_id: 'lasu',
      ...edit,
      deleted: !!edit.deleted,
    };
    delete result.updated_at;
    delete result.edited_by;
    return result;
  };
  for (const [key, expected] of targets) {
    const saved = current.edits.find((row) => rowKey(row) === key);
    if (saved)
      compare(
        targetContent(expected),
        targetContent(saved),
        pointer('/targets', key),
      );
  }
  return {
    ok: differenceCount === 0,
    beforeHash: evidenceHash(before),
    currentHash: evidenceHash(current),
    targetCount: items.length,
    expectedDatasetDeltas,
    differenceCount,
    differences,
  };
}
