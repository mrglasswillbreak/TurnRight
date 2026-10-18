import { lazy } from 'react';
import type { ReviewState } from './EditorReview';
import { type SourceRecord } from './editor-model';
import type { CampusData, MapEdit } from './types';
export const SourceUpdates = lazy(() => import('./SourceUpdates'));
export const LocalSignIn =
  import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEVELOPMENT === 'true'
    ? lazy(() => import('./LocalSignIn'))
    : null;
export const EditorReview = lazy(() =>
  import('./EditorReview').then((m) => ({ default: m.EditorReview })),
);
export const GisTeamWorkspace = lazy(() => import('./GisTeamWorkspace'));
export const SurveyPanel = lazy(() =>
  import('./SurveyPanel').then((m) => ({ default: m.SurveyPanel })),
);
export const GisWorkspace = lazy(() => import('./GisWorkspace'));
export const CampusWorkspace = lazy(() => import('./CampusWorkspace'));
export const LayerWorkspace = lazy(() => import('./LayerWorkspace'));
export const LayerGeometry = lazy(() => import('./LayerGeometry'));
export const PrecisionControls = lazy(() => import('./PrecisionControls'));
export const EditorInspector = lazy(() =>
  import('./EditorInspector').then((m) => ({ default: m.EditorInspector })),
);
export const DuplicateReview = lazy(() =>
  import('./DuplicateReview').then((m) => ({ default: m.DuplicateReview })),
);
export const BuildingAppearanceEditor = lazy(() =>
  import('./BuildingAppearanceEditor').then((module) => ({
    default: module.BuildingAppearanceEditor,
  })),
);
export interface EditorState extends ReviewState {
  capabilities?: import('./gis-types').WorkspaceCapabilities;
  base?: CampusData;
  campus?: import('./campus-context').CampusIdentity;
  edits: MapEdit[];
}
export interface OfflineEditor {
  state: EditorState;
  sources: SourceRecord[];
  data: CampusData;
  prepared: boolean;
  syncedAt?: string;
}
