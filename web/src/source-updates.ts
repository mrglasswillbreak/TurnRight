import type { MapChange } from './types.js';
import type { Geometry } from 'geojson';

export interface SourceMapRow {
  id: string;
  revision: number;
  name: string;
  kind: MapChange['kind'];
  before: { geometry: Geometry; simplified: boolean } | null;
  after: { geometry: Geometry; simplified: boolean } | null;
}
export interface SourceMapPage {
  rows: SourceMapRow[];
  total: number;
  asOf: string;
  nextCursor: SourceCursor | null;
}

export interface SourceFilters {
  query?: string;
  source?: string;
  layer?: string;
  featureType?: string;
  kind?: '' | 'add' | 'modify' | 'remove';
  geometry?: '' | 'true' | 'false';
}
export interface SourceCursor {
  createdAt: string;
  id: string;
}
export interface SourceSummary {
  reliability?: SourceReliability;
  id: string;
  revision: number;
  sourceId: string;
  sourceName: string;
  kind: MapChange['kind'];
  createdAt: string;
  meta: {
    source: string;
    name: string;
    layer: string;
    featureType: string;
    fields: string[];
    geometryChanged: boolean;
  };
}
export interface SourcePage {
  eligibleTotal?: number;
  excludedTotal?: number;
  rows: SourceSummary[];
  total: number;
  nextCursor: SourceCursor | null;
}
export interface SourceOverview {
  ready: boolean;
  counts: Record<string, number>;
  layers: string[];
  featureTypes: string[];
  scheduledOsmEnabled: boolean;
  sources: Array<{
    id: string;
    name: string;
    kind: 'file' | 'osm' | 'arcgis';
    schedule: 'manual' | 'daily';
    configured: boolean;
    lastSuccess?: string;
    latest?: {
      id: string;
      status: string;
      message?: string;
      updatedAt: string;
    };
    active?: { id: string; status: string; message?: string };
  }>;
  legacy?: {
    status: string;
    message?: string;
    created_at: string;
    completed_at?: string;
  } | null;
}
export interface SourceOperation {
  id: string;
  actor: string;
  accept: boolean | null;
  status:
    | 'prepared'
    | 'queued'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled';
  total: number;
  applied: number;
  skipped: number;
  failed: number;
  breakdown: {
    add: number;
    modify: number;
    remove: number;
    geometry: number;
    excluded?: number;
  };
  message?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}
export interface SourceResult {
  change_id: string;
  name: string;
  kind: string;
  status: string;
  message?: string;
}
export interface SourceHistory {
  operations: SourceOperation[];
  items: SourceResult[];
}
export interface SourceDetail {
  reliability?: SourceReliability;
  change: MapChange & { review_revision: number };
  overrides: Array<{
    id: string;
    kind: string;
    fields: string[];
    deleted: boolean;
  }>;
}
export interface SourceReliability {
  eligible: boolean;
  blockingReasons: string[];
  classification: string;
  verification: string;
  dependencyCount: number;
  checkId?: string;
  groupId?: string;
}
export const sourceReadiness = (value?: SourceReliability) =>
  value?.eligible === false
    ? value.verification === 'unverified'
      ? 'Needs verification'
      : 'Blocked'
    : 'Ready to review';
export const sourceKindLabel = {
  add: 'Addition',
  modify: 'Change',
  remove: 'Removal',
} as const;
export function sourceChangeLabel(
  kind: 'add' | 'modify' | 'remove',
  reliability?: SourceReliability,
) {
  if (reliability?.classification.includes('configuration_change'))
    return 'Import configuration';
  if (reliability?.classification.includes('scope_change'))
    return 'Scope change';
  if (reliability?.classification.includes('routing_regeneration'))
    return 'Routing rebuild';
  if (reliability?.classification.includes('unresolved_identity'))
    return 'Identity check';
  return sourceKindLabel[kind];
}
export function sourceFieldLabel(key: string) {
  if (key === 'edge') return 'Routing segment';
  if (key === 'node') return 'Routing junction';
  if (key === 'geometry') return 'Shape or location';
  return key
    .replace(/^properties\./, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/^./, (c) => c.toUpperCase());
}
export function describeSourceChange(row: SourceSummary) {
  const fields = row.meta.fields.map(sourceFieldLabel);
  if (row.kind === 'add') return 'New source feature';
  if (row.kind === 'remove') return 'Missing from the latest source snapshot';
  return (
    [
      row.meta.geometryChanged ? 'Shape or location changed' : '',
      fields.length
        ? fields.slice(0, 3).join(', ') +
          (fields.length > 3 ? ` + ${fields.length - 3} more` : '')
        : '',
    ]
      .filter(Boolean)
      .join(' · ') || 'Source details changed'
  );
}
export const operationActive = (op: SourceOperation) =>
  ['queued', 'running'].includes(op.status);
