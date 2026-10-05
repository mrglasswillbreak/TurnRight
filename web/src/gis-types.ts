import type { Feature, Geometry } from 'geojson';
export type WorkspaceRole =
  | 'administrator'
  | 'editor'
  | 'reviewer'
  | 'publisher';
export type WorkspaceCapability =
  | 'read'
  | 'edit'
  | 'review'
  | 'publish'
  | 'manage';
export interface WorkspaceCapabilities {
  campusId: string;
  userId: string;
  roles: WorkspaceRole[];
  capabilities: WorkspaceCapability[];
}
export interface CampusMembership {
  user_id: string;
  roles: WorkspaceRole[];
}
export type FieldValue = string | number | boolean | null;
export interface DatasetField {
  name: string;
  alias?: string;
  type: 'text' | 'number' | 'boolean' | 'date';
  required?: boolean;
  domain?: FieldValue[];
  unit?: string;
  public?: boolean;
}
export interface DatasetSchema {
  version: 1;
  fields: DatasetField[];
}
export interface DatasetStyle {
  field?: string;
  mode: 'single' | 'categorical' | 'graduated';
  color: string;
  classes?: {
    value?: FieldValue;
    maximum?: number;
    color: string;
    label: string;
  }[];
  sizeField?: string;
  labelField?: string;
}
export interface Dataset {
  id: string;
  campus_id: string;
  name: string;
  schema: DatasetSchema;
  source_crs: string;
  analysis_crs: string;
  provenance: Record<string, unknown>;
  style: DatasetStyle;
  included: boolean;
  revision: number;
  count?: number;
  saved_filters: { name: string; query: FeatureQuery }[];
}
export interface FieldFilter {
  field: string;
  operator: 'eq' | 'ne' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'null';
  value?: FieldValue;
}
export interface FeatureQuery {
  datasetId: string;
  revision?: number;
  cursor?: string;
  limit?: number;
  fields?: string[];
  filters?: FieldFilter[];
  sort?: { field: string; direction: 'asc' | 'desc' };
  bbox?: [number, number, number, number];
  keys?: string[];
  spatial?: { geometry: Geometry; predicate: 'intersects' | 'within' };
  geometry?: boolean;
}
export interface DatasetFeature extends Feature {
  id: string;
  properties: Record<string, FieldValue>;
}
export interface FeaturePage {
  features: DatasetFeature[];
  revision: number;
  nextCursor: string | null;
  total: number;
}
export type ProcessingTool =
  | 'buffer'
  | 'clip'
  | 'intersect'
  | 'difference'
  | 'dissolve'
  | 'select-location'
  | 'spatial-join'
  | 'nearest'
  | 'summarize-within'
  | 'measure'
  | 'attribute-join'
  | 'calculate'
  | 'export';
export interface ProcessingRequest {
  operationId: string;
  tool: ProcessingTool;
  input: FeatureQuery;
  overlay?: FeatureQuery;
  parameters: Record<string, unknown>;
  name: string;
}
export interface ProcessingJob {
  id: string;
  tool: ProcessingTool;
  status:
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'applied';
  actor: string;
  request: ProcessingRequest;
  input_revision: number;
  output_dataset_id?: string;
  progress: number;
  message?: string;
  engine?: Record<string, string>;
  created_at: string;
  artifact?: { url: string; sha256: string; bytes: number; format: string };
}
export interface ReviewSubmission {
  id: string;
  summary: string;
  content_hash: string;
  contributors: string[];
  submitted_by: string;
  status: 'submitted' | 'approved' | 'changes-requested';
  reviewed_by?: string;
  reason?: string;
  created_at: string;
}
export interface SavedMapView {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  datasets: string[];
  revision: number;
}
export interface QualityIssue {
  id: string;
  feature_key?: string;
  coordinates?: [number, number];
  severity: 'error' | 'warning';
  code: string;
  message: string;
  status: 'open' | 'resolved' | 'accepted';
  assigned_to?: string;
  comments: { actor: string; text: string; createdAt: string }[];
  evidence: { label: string; url: string }[];
  revision: number;
}
export interface GisActionMap {
  'workspace-capabilities': {
    request: Record<string, never>;
    response: WorkspaceCapabilities;
  };
  'gis-members': {
    request: Record<string, never>;
    response: CampusMembership[];
  };
  'gis-member-save': {
    request: { userId: string; roles: WorkspaceRole[]; operationId: string };
    response: CampusMembership[];
  };
  'gis-datasets': { request: Record<string, never>; response: Dataset[] };
  'gis-dataset-save': {
    request: {
      dataset: Dataset;
      expectedRevision: number;
      operationId: string;
    };
    response: Dataset;
  };
  'gis-query': { request: FeatureQuery; response: FeaturePage };
  'gis-feature': {
    request: { datasetId: string; key: string; revision: number };
    response: {
      source: import('./editor-model.js').SourceRecord | null;
      edit: import('./types.js').MapEdit | null;
    };
  };
  'gis-statistics': {
    request: FeatureQuery & { field: string };
    response: {
      count: number;
      nulls: number;
      min: number | null;
      max: number | null;
      sum: number | null;
      average: number | null;
    };
  };
  'gis-attributes-save': {
    request: {
      datasetId: string;
      expectedRevision: number;
      operationId: string;
      features: { key: string; values: Record<string, FieldValue> }[];
    };
    response: { revision: number };
  };
  'gis-csv-import': {
    request: { operationId: string; name: string; csv: string };
    response: Dataset;
  };
  'gis-jobs': { request: Record<string, never>; response: ProcessingJob[] };
  'gis-job-start': { request: ProcessingRequest; response: ProcessingJob };
  'gis-job-cancel': { request: { id: string }; response: { ok: boolean } };
  'gis-job-apply': { request: { id: string }; response: { datasetId: string } };
  'gis-job-artifact': { request: { id: string }; response: { url: string } };
  'gis-job-preview': { request: { id: string }; response: DatasetFeature[] };
  'gis-reviews': {
    request: Record<string, never>;
    response: ReviewSubmission[];
  };
  'gis-review-submit': {
    request: { operationId: string; summary: string };
    response: ReviewSubmission;
  };
  'gis-review-decide': {
    request: {
      id: string;
      approve: boolean;
      reason: string;
      override?: boolean;
    };
    response: ReviewSubmission;
  };
  'gis-review-restore': {
    request: { id: string; operationId: string };
    response: ReviewSubmission;
  };
  'gis-review-details': {
    request: { id: string };
    response: ReviewSubmission & {
      datasets?: Dataset[];
      edits: import('./types.js').MapEdit[];
      sourceCount: number;
      editCount: number;
      current: boolean;
    };
  };
  'gis-review-query': {
    request: { id: string; datasetId: string; afterKey?: string };
    response: {
      features: DatasetFeature[];
      total: number;
      nextKey: string | null;
    };
  };
  'gis-views': { request: Record<string, never>; response: SavedMapView[] };
  'gis-view-save': {
    request: { view: SavedMapView; operationId: string };
    response: SavedMapView;
  };
  'gis-quality': { request: Record<string, never>; response: QualityIssue[] };
  'gis-issues': { request: Record<string, never>; response: QualityIssue[] };
  'gis-issue-save': {
    request: { issue: QualityIssue; expectedRevision: number };
    response: QualityIssue;
  };
}
