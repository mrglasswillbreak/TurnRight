import type { ImportRole } from './map-import-types.js';
export type LayerRole = Exclude<ImportRole, 'skip'> | 'closure' | 'group';
export type LayerBand = 'landscape' | 'surfaces' | 'buildings' | 'annotations';
export interface LayerStyle {
  color?: string;
  darkColor?: string;
  outline?: string;
  opacity?: number;
  lineWidth?: number;
  pointSize?: number;
  symbol?: 'circle' | 'square' | 'diamond';
  labelField?: 'name' | 'label' | 'sourceId' | 'landClass' | 'surface';
  labels?: boolean;
  minZoom?: number;
  maxZoom?: number;
}
export interface LayerRule {
  field: 'landClass' | 'surface' | 'highway' | 'vegetation';
  value: string;
  style: LayerStyle;
}
/** Owner metadata is saved as a campus-scoped, versioned editor record. */
export interface CampusLayer {
  id: string;
  name: string;
  role: LayerRole;
  band: LayerBand;
  parentId?: string;
  sourceKey?: string;
  sourceName?: string;
  importedLayer?: string;
  order: number;
  editorVisible: boolean;
  locked: boolean;
  included: boolean;
  publishedVisible: boolean;
  archived: boolean;
  style: LayerStyle;
  rules: LayerRule[];
  /** Explicit feature keys override inferred membership without rewriting geometry. */
  members: string[];
}
export interface CampusLayers {
  version: 1;
  items: CampusLayer[];
}
export interface LayerViewState {
  active?: string;
  isolated?: string;
  hidden?: string[];
  shown?: string[];
  selected?: string[];
}
