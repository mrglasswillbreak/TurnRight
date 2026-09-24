import type { Position, PackageAsset } from './types.js';
import type { MultiPolygon } from 'geojson';
export type RoofForm = 'flat' | 'hip' | 'gable';
export interface SurfaceStyle {
  windowFrameDepth?: number;
  windowWidthRatio?: number;
  windowHeightRatio?: number;
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
  provenance?: string;
  eaves: number;
  points: RoofPoint[];
  lines: { id: string; from: string; to: string; kind: 'ridge' | 'valley' }[];
}
export interface BuildingAppearance extends SurfaceStyle {
  photoEvidence?: {
    photoIds: string[];
    observed: string[];
    estimated: string[];
    needed: string[];
    checkedAt: string;
  };
  facades?: Record<string, FacadeDescription>;
  modelId?: string;
  parts?: Record<string, SurfaceStyle>;
  walls?: Record<string, SurfaceStyle>;
  roofs?: Record<string, CustomRoof>;
}
export type FacadeElementKind =
  | 'window'
  | 'door'
  | 'column'
  | 'balcony'
  | 'canopy'
  | 'parapet'
  | 'trim';
export interface FacadeElement {
  id: string;
  kind: FacadeElementKind;
  /** Centre along the original wall, 0..1. Dimensions are metres, not survey measurements. */
  x: number;
  bottom: number;
  width: number;
  height: number;
  depth: number;
  count: number;
  spacing: number;
  colour: string;
}
export interface FacadeTextureRecipe {
  photoId: string;
  /** Clockwise top-left, top-right, bottom-right, bottom-left in normalized source pixels. */
  corners: [number, number][];
}
export interface FacadeDescription {
  partId: string;
  wallId: string;
  /** Original endpoints, preserving direction. A moved wall requires a new review. */
  wallCoordinates: Position[];
  photoIds: string[];
  confidence: 'documented' | 'observed' | 'inferred';
  reviewedAt?: string;
  needsReview?: boolean;
  notes: string;
  elements: FacadeElement[];
  texture?: FacadeTextureRecipe;
}
export interface VisualTexture extends PackageAsset {
  id: string;
  width: number;
  height: number;
  photoId: string;
  author: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  sourceUrl?: string;
  modifications: string;
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
  roofTriangle?: number;
}
export interface RoofDraft {
  buildingId: string;
  partId: string;
  geometryRevision: string;
  roof: CustomRoof;
}
export interface BuildingVisual {
  detailRevision?: string;
  id: string;
  placeId?: string;
  name: string;
  geometryRevision: string;
  level: 'detailed' | 'simplified' | 'extrusion';
  height: number;
  heightKind: 'recorded' | 'floor-derived' | 'observed-floors' | 'illustrative';
  floors?: number;
  defaults?: SurfaceStyle;
  partDefaults?: Record<string, SurfaceStyle>;
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
  textures?: VisualTexture[];
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
  /** Fine relief can wait until close zoom; older readers may ignore this hint. */
  minZoom?: number;
  uvs?: number[];
  texture?: FacadeTextureRecipe;
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
  detailRevision?: string;
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
