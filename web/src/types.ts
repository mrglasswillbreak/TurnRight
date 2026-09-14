import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type {
  BuildingAppearance,
  BuildingTopology,
  VisualCatalogue,
} from './visual-types.js';

export type Position = [number, number];
export type Category =
  | 'academic'
  | 'library'
  | 'food'
  | 'services'
  | 'worship'
  | 'residence'
  | 'sports'
  | 'gate'
  | 'other';
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
  buildingId?: string;
  sourceRefs?: string[];
  approachDistance?: number;
  arrivalKind: 'entrance' | 'mapped-approach' | 'unmapped';
  height?: number;
  heightEstimated?: boolean;
}
export interface GraphNode {
  id: string;
  coordinates: Position;
  sourceTags?: Record<string, string>;
  accessReviewId?: string;
}
export type WalkingAccess = 'yes' | 'campus' | 'private' | 'no';
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  distance: number;
  name: string;
  accessible: boolean;
  walkingAccess?: WalkingAccess;
  accessReviewId?: string;
  accessReviewIds?: string[];
  geometryBlocked?: string;
  steps?: boolean;
  sourceId: string;
  /** Original edge IDs retained when an explicit junction splits a segment. */
  parentEdgeIds?: string[];
}
export type ConnectionTarget =
  | { type: 'node'; nodeId: string; coordinates: Position }
  | {
      type: 'segment';
      sourceId: string;
      from: string;
      to: string;
      coordinates: Position;
    };
export interface PathConnection {
  vertexId: string;
  target: ConnectionTarget;
}
export interface Entrance {
  id: string;
  placeId: string;
  buildingId?: string;
  name: string;
  coordinates: Position;
  walkingAccess: WalkingAccess;
  source: string;
  graphNode?: string;
}
export type RouteEndpoint = string | { placeId: string };
export type RouteOrigin = Position | RouteEndpoint;
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
  /** Retained public IDs after a reviewed place merge. */
  placeIdAliases?: Record<string, string>;
  buildingIdAliases?: Record<string, string>;
  visuals?: VisualCatalogue;
  entrances?: Entrance[];
  graph: RoutingGraph;
  closures: Closure[];
  accessPolicy?: {
    id: string;
    audience: 'students';
    confirmedAt: string;
    summary: string;
    connectionReviews?: {
      id: string;
      featureId: string;
      name: string;
      coordinates?: Position;
      confirmedAt: string;
      confirmedBy: string;
      summary: string;
      expectedTags: Record<string, string>;
    }[];
  };
  coverage: {
    fieldVerified: boolean;
    campusAccessWayCount?: number;
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
  visuals?: { bytes: number; assetUrls: string[] };
}
export type ManeuverKind =
  | 'depart'
  | 'left'
  | 'right'
  | 'slight-left'
  | 'slight-right'
  | 'uturn'
  | 'straight'
  | 'arrive';
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
  originEntranceId?: string;
  destinationEntranceId?: string;
  arrivalKind?: Place['arrivalKind'];
  approachDistance?: number;
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
  kind: 'add' | 'modify' | 'remove';
  before: unknown;
  after: unknown;
  status: 'pending' | 'accepted' | 'rejected';
  summary: string;
}
export interface MapEdit {
  id: string;
  kind: 'place' | 'path' | 'building' | 'entrance' | 'barrier' | 'closure';
  geometry: Geometry;
  properties: Record<string, unknown> & {
    appearance?: BuildingAppearance;
    buildingTopology?: BuildingTopology;
    vertexIds?: string[];
    connections?: PathConnection[];
    connection?: ConnectionTarget;
    /** A retained undo receipt that removes a correction, leaving approved source data intact. */
    revertToSource?: boolean;
    mergedInto?: string;
    duplicateKeepSeparate?: string[];
    /** Private reference retained in corrections, omitted from public geometry. */
    surveyEvidence?: { surveyId: string; revisionId: string | null };
    surveyProvenance?: string;
  };
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
export interface ReportDraft {
  key: string;
  name: string;
  placeId?: string;
  coordinates: Position;
}
export interface Release {
  id: string;
  status: 'queued' | 'building' | 'preview' | 'published' | 'failed';
  summary: string;
  created_at: string;
  preview_url?: string;
  deployment_url?: string;
  error?: string;
}
