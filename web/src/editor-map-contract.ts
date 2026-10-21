import type { FeatureCollection, Geometry, Feature } from 'geojson';
import type { MapEdit, Position } from './types';
import type { UnfinishedDrawing } from './editor-workspace';
import { type SnapTarget } from './editor-features';
export type Interaction =
  | 'select'
  | 'start'
  | 'end'
  | 'join'
  | 'entrance-link'
  | 'block';

export interface Callbacks {
  choose?: (
    features: { kind: MapEdit['kind']; id: string }[],
    anchor: Position,
  ) => void;
  select: (kind: MapEdit['kind'], id: string, anchor?: Position) => void;
  create: (edit: MapEdit) => void;
  geometry: (geometry: Geometry) => void;
  remove: () => void;
  draft: (drawing: UnfinishedDrawing | null) => void;
  connect: (target: SnapTarget, interaction: Interaction) => void;
  hint: (message: string) => void;
}

export const collection = (features: Feature[] = []): FeatureCollection => ({
  type: 'FeatureCollection',
  features,
});

export const modeFor = (g: Geometry) =>
  g.type === 'Point'
    ? 'point'
    : g.type === 'Polygon'
      ? 'polygon'
      : 'linestring';
