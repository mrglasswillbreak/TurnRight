import type { Position, PackageAsset } from './types.js';
import type { MultiPolygon } from 'geojson';
export type RoofForm = 'flat' | 'hip' | 'gable';
export interface BuildingAppearance {
  wallColour?: string;
  roofColour?: string;
  roofForm?: RoofForm;
  modelId?: string;
  confidence?: 'documented' | 'observed' | 'inferred';
  provenance?: string;
}
export interface BuildingVisual {
  id: string;
  placeId?: string;
  name: string;
  geometryRevision: string;
  level: 'detailed' | 'simplified' | 'extrusion';
  height: number;
  heightKind: 'recorded' | 'floor-derived' | 'observed-floors' | 'illustrative';
  floors?: number;
  partHeights?: {
    height: number;
    kind: BuildingVisual['heightKind'];
    floors?: number;
  }[];
  roofForm: RoofForm;
  wallColour: string;
  roofColour: string;
  confidence: 'documented' | 'observed' | 'inferred';
  sources: string[];
  observed: string[];
  inferred: string[];
  needed: string[];
  sectorId?: string;
  geometryReview?: {
    baselineRevision: string;
    geometry: MultiPolygon;
    reason: string;
  };
  footprint?: {
    bounds: [Position, Position];
    widthMetres: number;
    depthMetres: number;
    areaSquareMetres: number;
    longestEdgeBearing: number;
    polygonParts: number;
    courtyards: number;
    sourceRetrievedAt?: string;
  };
}
export interface VisualSector extends PackageAsset {
  id: string;
  bounds: [Position, Position];
  buildingIds: string[];
}
export interface VisualCatalogue {
  schemaVersion: 1;
  revision: string;
  bytes: number;
  buildings: BuildingVisual[];
  sectors: VisualSector[];
  references: {
    id: string;
    url: string;
    author: string;
    license: string;
    date: string;
    licenseUrl?: string;
  }[];
}
export interface ModelMesh {
  positions: number[];
  indices: number[];
  colour: string;
  detail?: boolean;
}
export interface BuildingModel {
  id: string;
  geometryRevision: string;
  origin: Position;
  meshes: ModelMesh[];
}
export interface SectorModels {
  schemaVersion: 1;
  id: string;
  models: BuildingModel[];
}
