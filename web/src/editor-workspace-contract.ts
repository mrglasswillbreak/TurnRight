import type { RoofDraft } from './visual-types';
import type { Geometry } from 'geojson';
import type { MapEdit } from './types';
export const editKey = (edit: Pick<MapEdit, 'id' | 'kind'>) =>
  `${edit.kind}:${edit.id}`;

export const contentCache = new WeakMap<MapEdit, string>();

export function editContent(edit: MapEdit | undefined) {
  if (!edit) return '';
  const cached = contentCache.get(edit);
  if (cached !== undefined) return cached;
  const { updated_at: _timestamp, ...content } = edit;
  const value = JSON.stringify(content);
  contentCache.set(edit, value);
  return value;
}

export interface UnfinishedDrawing {
  id: string;
  kind: MapEdit['kind'];
  geometry: Geometry;
  properties: MapEdit['properties'];
}

export interface WorkspaceSnapshot {
  edits: MapEdit[];
  unfinished: UnfinishedDrawing | null;
  roofDraft?: RoofDraft | null;
}

export interface SaveBatch {
  layerManagementVersion?: 1;
  modelAuthoringVersion?: 1;
  modelDocumentVersion?: 1;
  operationId: string;
  edits: { edit: MapEdit; expectedUpdatedAt: string | null }[];
}

export interface WorkspaceRecovery extends WorkspaceSnapshot {
  modelInputs?: Record<string, Record<string, string>>;
  saved: MapEdit[];
  pending: SaveBatch | null;
  past: WorkspaceSnapshot[];
  future: WorkspaceSnapshot[];
  conflictBase?: MapEdit[];
  featureBases?: MapEdit[];
}

export type SaveStatus =
  | 'Saved'
  | 'Saving'
  | 'Saved locally'
  | 'Conflict'
  | 'Recovery unavailable';

export const recoveryMessage =
  'Browser storage could not save a recovery copy. Keep this tab open until the draft is saved.';
