import type { Position, PackageAsset } from './types.js';
import type { MultiPolygon } from 'geojson';
export type RoofForm = 'flat' | 'hip' | 'gable';
export interface SurfaceStyle {
  wallColour?: string;
  roofColour?: string;
  windowColour?: string;
  trimColour?: string;
  windows?: boolean;
  windowSpacing?: number;
  roofPitch?: number;
  roofForm?: RoofForm;
  height?: number;
  floors?: number;
  heightMode?: 'metres' | 'floors' | 'unknown';
  confidence?: 'documented' | 'observed' | 'inferred';
  provenance?: string;
}
export interface RoofPoint {
  id: string;
  coordinates: Position;
  elevation: number;
  vertexId?: string;
}
export interface CustomRoof {
  eaves: number;
  points: RoofPoint[];
  lines: { id: string; from: string; to: string; kind: 'ridge' | 'valley' }[];
}
export interface BuildingAppearance extends SurfaceStyle {
  modelId?: string;
  parts?: Record<string, SurfaceStyle>;
  walls?: Record<string, SurfaceStyle>;
  roofs?: Record<string, CustomRoof>;
}
export interface BuildingTopology {
  parts: {
    id: string;
    rings: { id: string; vertexIds: string[]; wallIds: string[] }[];
  }[];
  issues?: {
    id: string;
    partId: string;
    wallId?: string;
    message: string;
    candidates: SurfaceStyle[];
  }[];
}
export interface BuildingSelection {
  buildingId: string;
  partId?: string;
  wallId?: string;
  role?: 'wall' | 'roof' | 'window' | 'trim';
  face?: number;
}
export interface RoofDraft {
  buildingId: string;
  partId: string;
  geometryRevision: string;
  roof: CustomRoof;
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
  defaults?: SurfaceStyle;
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
  surfaces?: {
    start: number;
    count: number;
    partId: string;
    wallId?: string;
    role: NonNullable<BuildingSelection['role']>;
  }[];
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
