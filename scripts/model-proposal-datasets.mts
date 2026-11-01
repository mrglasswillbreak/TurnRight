/** Read-only proof of the exact dataset memberships used by GIS edit triggers. */
import { db } from './cloud.mjs';
import { proposalIds } from './model-proposal-inventory.mts';
import type { GisSnapshot } from '../web/server/gis-publication';
import type { ModelDatasetMapping } from './model-proposal-reconciliation.mts';

export interface ModelDatasetMembership {
  kind: 'building';
  id: string;
  datasetId: string;
  indexDatasetId: string;
}
type Read = (
  route: string,
  method?: 'GET' | 'POST',
  body?: unknown,
) => Promise<unknown>;
interface IndexRow {
  campus_id: string;
  feature_key: string;
  dataset_id: string;
}
const keys = proposalIds.map((id) => `building:${id}`);
const sameInventory = (ids: string[]) =>
  ids.length === proposalIds.length &&
  [...ids].sort().every((id, index) => id === proposalIds[index]);

export async function readModelDatasetMembership(
  snapshot: GisSnapshot,
  read: Read = db,
): Promise<ModelDatasetMembership[]> {
  // cloud.db does not scope this derived table, so scope the query explicitly.
  const query = new URLSearchParams({
    campus_id: 'eq.lasu',
    feature_key: `in.(${keys.join(',')})`,
    select: 'campus_id,feature_key,dataset_id',
    limit: String(keys.length + 1),
  });
  const response = await read(`gis_feature_index?${query}`, 'GET');
  if (!Array.isArray(response) || response.length !== keys.length)
    throw Error('Expected exactly 20 LASU GIS index memberships');
  const index = response as IndexRow[];
  if (
    index.some(
      (row) =>
        row.campus_id !== 'lasu' ||
        typeof row.dataset_id !== 'string' ||
        !row.dataset_id,
    ) ||
    !sameInventory(
      index.map((row) =>
        row.feature_key.startsWith('building:') ? row.feature_key.slice(9) : '',
      ),
    )
  )
    throw Error(
      'GIS index membership identities differ from the audited inventory',
    );
  const memberships: ModelDatasetMembership[] = [];
  for (const id of proposalIds) {
    const sources = snapshot.features.filter(
      (source) =>
        source.entity === 'feature' &&
        source.payload.properties?.kind === 'building' &&
        source.payload.properties?.id === id,
    );
    const edits = snapshot.edits.filter(
      (edit) => edit.kind === 'building' && edit.id === id,
    );
    const source = sources[0];
    const edit = edits[0];
    if (
      sources.length !== 1 ||
      source.entity !== 'feature' ||
      edits.length > 1 ||
      edit?.deleted ||
      edit?.properties.revertToSource
    )
      throw Error(
        'Dataset proof requires one active source building per target',
      );
    // Match gis_sync_feature: source properties, then the saved overlay, then identity.
    const datasetId = await read('rpc/gis_dataset_key', 'POST', {
      properties: {
        ...source.payload.properties,
        ...edit?.properties,
        id,
        kind: 'building',
      },
      source: source.source ?? 'authored',
    });
    const existing = (snapshot.datasets || []).filter(
      (row) => row.id === datasetId,
    );
    if (
      typeof datasetId !== 'string' ||
      !datasetId ||
      existing.length !== 1 ||
      existing[0].campus_id !== 'lasu'
    )
      throw Error(
        'Derived model dataset must already exist exactly once in LASU',
      );
    const indexDatasetId = index.find(
      (row) => row.feature_key === `building:${id}`,
    )!.dataset_id;
    if (indexDatasetId !== datasetId)
      throw Error(
        'GIS index is stale or dataset membership changed; reconcile before saving models',
      );
    memberships.push({ kind: 'building', id, datasetId, indexDatasetId });
  }
  return memberships;
}

export function modelDatasetMappings(
  before: ModelDatasetMembership[],
  current: ModelDatasetMembership[],
): ModelDatasetMapping[] {
  for (const rows of [before, current]) {
    if (
      !sameInventory(rows.map((row) => row.id)) ||
      rows.some(
        (row) =>
          row.kind !== 'building' ||
          !row.datasetId ||
          row.datasetId !== row.indexDatasetId,
      )
    )
      throw Error('Unproven model dataset membership inventory');
  }
  return before.map((previous) => {
    const accepted = current.find((row) => row.id === previous.id)!;
    if (previous.datasetId !== accepted.datasetId)
      throw Error('Model save changed dataset membership');
    return {
      kind: 'building',
      id: previous.id,
      beforeDatasetId: previous.datasetId,
      currentDatasetId: accepted.datasetId,
      currentIndexDatasetId: accepted.indexDatasetId,
    };
  });
}
