import type { Feature, FeatureCollection, Geometry } from "geojson";

export type Position = [number, number];
export type Category =
  | "academic"
  | "library"
  | "food"
  | "services"
  | "worship"
  | "residence"
  | "sports"
  | "gate"
  | "other";
export interface Place {
  id: string;
  name: string;
  category: Category;
  coordinates: Position;
  aliases: string[];
  department?: string;
  faculty?: string;
  source: string;
  sourceId: string;
  graphNode?: string;
  approachDistance?: number;
  arrivalKind: "entrance" | "mapped-approach" | "unmapped";
  height?: number;
  heightEstimated?: boolean;
}
export interface GraphNode {
  id: string;
  coordinates: Position;
}
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  distance: number;
  name: string;
  accessible: boolean;
  geometryBlocked?: string;
  steps?: boolean;
  sourceId: string;
}
export interface RoutingGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export interface Closure {
  id: string;
  edgeIds: string[];
  reason: string;
  expectedReopening?: string;
  reopenedAt?: string;
}
export interface CampusData {
  schemaVersion: 1;
  version: string;
  createdAt: string;
  boundary: Feature;
  bounds: [Position, Position];
  map: FeatureCollection;
  places: Place[];
  graph: RoutingGraph;
  closures: Closure[];
  coverage: {
    fieldVerified: boolean;
    placeCount: number;
    routableCount: number;
    approachCount: number;
    disconnected: string[];
    components: number;
    notes: string[];
  };
  sources: {
    id: string;
    name: string;
    url: string;
    attribution: string;
    license: string;
    retrievedAt: string;
  }[];
}
export interface PackageAsset {
  url: string;
  sha256: string;
  bytes: number;
}
export interface CampusPackage {
  schemaVersion: 1;
  version: string;
  createdAt: string;
  summary: string;
  dataUrl: string;
  bytes: number;
  assets: PackageAsset[];
}
export type ManeuverKind =
  | "depart"
  | "left"
  | "right"
  | "slight-left"
  | "slight-right"
  | "uturn"
  | "straight"
  | "arrive";
export interface Maneuver {
  kind: ManeuverKind;
  instruction: string;
  at: number;
  coordinates: Position;
  street: string;
}
export interface Route {
  id: string;
  nodeIds: string[];
  edgeIds: string[];
  coordinates: Position[];
  distance: number;
  seconds: number;
  maneuvers: Maneuver[];
  startOffset: number;
}
export interface GpsFix {
  coordinates: Position;
  accuracy: number;
  timestamp: number;
  heading: number | null;
  speed: number | null;
}
export interface SourceFeature {
  id: string;
  source: string;
  sourceId: string;
  hash: string;
  feature: Feature;
  retrievedAt: string;
}
export interface MapChange {
  id: string;
  source_id: string;
  kind: "add" | "modify" | "remove";
  before: unknown;
  after: unknown;
  status: "pending" | "accepted" | "rejected";
  summary: string;
}
export interface MapEdit {
  id: string;
  kind: "place" | "path" | "building" | "entrance" | "barrier" | "closure";
  geometry: Geometry;
  properties: Record<string, unknown>;
  deleted?: boolean;
  updated_at?: string;
}
export interface StudentReport {
  id: string;
  coordinates: Position;
  placeId?: string;
  category: string;
  description: string;
  created_at?: string;
  status?: string;
}
export interface Release {
  id: string;
  status: "queued" | "building" | "preview" | "published" | "failed";
  summary: string;
  created_at: string;
  preview_url?: string;
  deployment_url?: string;
  error?: string;
}
