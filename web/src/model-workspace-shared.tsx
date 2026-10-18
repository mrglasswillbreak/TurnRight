import { lazy, type RefObject } from 'react';
import type { EditorWorkspace } from './editor-workspace';
import type { CampusData, MapEdit } from './types';
import type {
  BuildingSelection,
  FacadeElement,
  FacadeElementKind,
} from './visual-types';
export const ModelMeshPanel = lazy(() => import('./ModelMeshPanel'));
export type Mode =
  | 'details'
  | 'appearance'
  | 'roof'
  | 'outline'
  | 'review'
  | 'mesh';
export const kinds: FacadeElementKind[] = [
  'window',
  'door',
  'column',
  'balcony',
  'canopy',
  'parapet',
  'trim',
  'text',
];
export type Stamp = {
  elements: FacadeElement[];
  wallLength: number;
  name: string;
};
export const emptyElements: FacadeElement[] = [];
export type WorkspaceProps = {
  edit: MapEdit;
  data: CampusData;
  selection?: BuildingSelection;
  onSelection: (s: BuildingSelection) => void;
  onEdit: (e: MapEdit) => void;
  onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null>;
  workspace?: EditorWorkspace;
  onHistory?: (redo?: boolean) => void;
  initialMode?: Mode;
  initialField?: string;
};
