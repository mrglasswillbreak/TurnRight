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
  fields: { name: string; alias?: string; values?: string[] }[];
  crs?: string;
  suggestedRole: ImportRole;
  requiresCoordinates?: boolean;
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
