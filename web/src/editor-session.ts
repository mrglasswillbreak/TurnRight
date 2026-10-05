import type { FeatureQuery, Dataset } from './gis-types';
import type { CampusLayer } from './campus-layer-types';
import type { MapEdit } from './types';

export type EditorTask =
  | 'map'
  | 'gis-analyze'
  | 'gis-review'
  | 'gis-publish'
  | 'campuses'
  | 'changes'
  | 'duplicates'
  | 'reports'
  | 'draft-changes'
  | 'settings'
  | 'members'
  | 'layer'
  | 'dataset-settings';
export interface FeatureRef {
  campusId: string;
  kind: MapEdit['kind'];
  id: string;
  datasetId?: string;
  revision?: number;
}
export interface CatalogueEntry {
  key: string;
  name: string;
  layer?: CampusLayer;
  dataset?: Dataset;
}
export interface TableContext {
  query: Partial<FeatureQuery>;
  columns: string[];
  revision?: number;
  cursor?: string;
  history: (string | undefined)[];
}
export interface EditorSessionState {
  task: EditorTask;
  expanded: boolean;
  panel: 'catalogue' | 'inspector' | 'table';
  returnPanel?: 'catalogue' | 'inspector' | 'table';
  catalogueOpen: boolean;
  activeEntry?: string;
  table: {
    open: boolean;
    kind: 'dataset' | 'layer';
    id?: string;
    importCsv?: boolean;
  };
  selection: FeatureRef[];
  editingFeature?: string;
  attributeDrafts: Record<string, { text: string; revision: number }>;
  datasetTables: Record<string, TableContext>;
  datasetVisibility: string[];
  dimensions: { catalogue: number; inspector: number; table: number };
}
export function initialEditorSession(): EditorSessionState {
  return {
    task: 'map',
    expanded: false,
    panel: 'catalogue',
    catalogueOpen: true,
    table: { open: false, kind: 'dataset' },
    selection: [],
    attributeDrafts: {},
    datasetTables: {},
    datasetVisibility: [],
    dimensions: { catalogue: 280, inspector: 380, table: 300 },
  };
}
export function catalogueEntries(
  layers: CampusLayer[],
  datasets: Dataset[],
): CatalogueEntry[] {
  const matched = new Set<string>();
  const entries = layers.map((layer) => {
    const dataset = datasets.find((d) => d.id === layer.id);
    if (dataset) matched.add(dataset.id);
    return { key: 'layer:' + layer.id, name: layer.name, layer, dataset };
  });
  return [
    ...entries,
    ...datasets
      .filter((d) => !matched.has(d.id))
      .map((dataset) => ({
        key: 'dataset:' + dataset.id,
        name: dataset.name,
        dataset,
      })),
  ];
}
export function selectionKey(feature: FeatureRef) {
  return feature.kind + ':' + feature.id;
}
export function featureReference(
  campusId: string,
  key: string,
  datasetId?: string,
  revision?: number,
): FeatureRef {
  const split = key.indexOf(':');
  return {
    campusId,
    kind: key.slice(0, split) as MapEdit['kind'],
    id: key.slice(split + 1),
    datasetId,
    revision,
  };
}
export function clampedDimensions(
  value: Partial<EditorSessionState['dimensions']>,
) {
  const clamp = (
    n: number | undefined,
    fallback: number,
    min: number,
    max: number,
  ) => (Number.isFinite(n) ? Math.max(min, Math.min(max, n!)) : fallback);
  return {
    catalogue: clamp(value.catalogue, 280, 240, 380),
    inspector: clamp(value.inspector, 380, 300, 540),
    table: clamp(value.table, 300, 180, 600),
  };
}

export function attributeInputKey(
  datasetId: string,
  key: string,
  field: string,
) {
  return JSON.stringify([datasetId, key, field]);
}
export function attributeInputReference(
  key: string,
): [string, string, string] | null {
  try {
    const value: unknown = JSON.parse(key);
    return Array.isArray(value) &&
      value.length === 3 &&
      value.every((v) => typeof v === 'string' && !!v)
      ? (value as [string, string, string])
      : null;
  } catch {
    return null;
  }
}
