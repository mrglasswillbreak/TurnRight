export const MAP_IMPORT_LIMITS = {
  uploadBytes: 50 * 1024 * 1024,
  expandedBytes: 250 * 1024 * 1024,
  features: 100000,
  timeoutSeconds: 1200,
} as const;
export type ImportSourceKind = 'file' | 'osm' | 'arcgis';
export type ImportRole =
  | 'building'
  | 'path'
  | 'place'
  | 'entrance'
  | 'barrier'
  | 'landcover'
  | 'boundary'
  | 'skip';
export interface ImportLayerMapping {
  layer: string;
  role: ImportRole;
  idField?: string;
  nameField?: string;
  categoryField?: string;
  heightField?: string;
  floorsField?: string;
  accessField?: string;
  longitudeField?: string;
  latitudeField?: string;
  crs?: string;
  heightUnit?: 'm' | 'ft';
  // Generic linework remains unroutable until explicitly reviewed.
  walkingAccess?: 'yes' | 'private' | 'no';
}
export interface ImportConfiguration {
  layers: ImportLayerMapping[];
  attribution: string;
  license: string;
  redistributionConfirmed: boolean;
}
export interface CampusSource {
  id: string;
  campus_id: string;
  name: string;
  kind: ImportSourceKind;
  url?: string;
  configuration: ImportConfiguration;
  schedule: 'manual' | 'daily';
  accepted_import_id?: string;
  updated_at: string;
}
export interface ImportLayer {
  name: string;
  count: number;
  geometryTypes: string[];
  fields: {
    name: string;
    alias?: string;
    values?: string[];
    unique?: boolean;
  }[];
  crs?: string;
  sourceCrs?: string;
  suggestedRole: ImportRole;
  requiresCoordinates?: boolean;
}
export function suggestedImportIdentifier(layer: ImportLayer) {
  const fields = layer.fields.filter((f) =>
    /^(id|objectid(?:_\d+)?|fid|globalid)$/i.test(f.name),
  );
  return (
    fields.find((f) => f.unique === true) ||
    fields.find((f) => f.unique === undefined)
  )?.name;
}
export interface ImportPreview {
  layers: ImportLayer[];
  counts: { added: number; modified: number; removed: number; skipped: number };
  warnings: string[];
  errors: string[];
  duplicates: { incomingId: string; existingId: string; name: string }[];
  features: GeoJSON.FeatureCollection;
  totalFeatures: number;
}
export interface CampusImport {
  id: string;
  source_id: string;
  campus_id: string;
  status:
    | 'draft'
    | 'queued'
    | 'running'
    | 'mapping'
    | 'preview'
    | 'reviewed'
    | 'cancelled'
    | 'failed';
  phase: 'inspect' | 'preview';
  configuration: ImportConfiguration;
  run_token: string;
  message?: string;
  summary?: ImportPreview;
  created_at: string;
  updated_at: string;
}

// JSONB and restored drafts can return the same mapping with different key order.
// Preserve layer order and every value: actual edits still require a new preview.
export function sameImportConfiguration(
  left: ImportConfiguration,
  right: ImportConfiguration,
): boolean {
  const snapshot = (configuration: ImportConfiguration) =>
    JSON.stringify([
      configuration.attribution,
      configuration.license,
      configuration.redistributionConfirmed,
      configuration.layers.map((layer) =>
        Object.entries(layer)
          .filter(([, value]) => value !== undefined)
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    ]);
  return snapshot(left) === snapshot(right);
}
