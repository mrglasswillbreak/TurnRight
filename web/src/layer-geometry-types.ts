import type { Geometry } from 'geojson';
import type { MapEdit } from './types';
export interface GeometryRequest {
  operation:
    | 'merge'
    | 'split'
    | 'hole'
    | 'regenerate'
    | 'remove-hole'
    | 'remove-part'
    | 'square'
    | 'straighten'
    | 'align'
    | 'offset';
  distance?: number;
  bearing?: number;
  keys: string[];
  cutter?: Geometry;
  part?: number;
  ring?: number;
  replaceManual?: boolean;
}

export interface GeometryResult {
  edits: MapEdit[];
  report: string[];
  beforeArea: number;
  afterArea: number;
  projection: string;
  repairs: {
    sourceId?: string;
    original: Geometry;
    precision: number;
    areaChangePercent: number;
    vertices: number;
  }[];
}
