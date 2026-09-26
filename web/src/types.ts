import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type {
  BuildingAppearance,
  BuildingTopology,
  VisualCatalogue,
} from './visual-types.js';

export type TravelMode = 'walking' | 'driving';
export type VehicleAccess = 'yes' | 'reviewed' | 'private' | 'no' | 'unknown';
export interface DrivingReview {
  id: string;
  audience: string;
  confirmedAt: string;
  summary: string;
}
export interface VehicleRules {
  access: VehicleAccess;
  direction: 'both' | 'forward' | 'reverse';
  speedKph?: number;
  review?: DrivingReview;
  conditional?: boolean;
  roundabout?: boolean;
  parkingAisle?: boolean;
}
export interface TurnRestriction {
  id: string;
  fromSourceId: string;
  toSourceId: string;
  viaNodeId: string;
  kind: 'no' | 'only';
  uTurn?: boolean;
}
export interface ParkingConnection {
  id: string;
  name: string;
  kind: 'parking' | 'drop-off';
  vehicleNodeId: string;
  walkingNodeId: string;
  access: VehicleAccess;
  review?: DrivingReview;
  restrictions?: string;
}
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
export interface SourceEvidence {
  sourceId: string;
  recordId: string;
  checkedAt: string;
  url?: string;
  license?: string;
  release?: string;
  upstreamRecordId?: string;
  observedAt?: string;
  accuracyMetres?: number;
}
export type FieldEvidence = Record<string, SourceEvidence[]>;
export interface ArrivalGuide {
  description?: string;
  restrictions?: string;
  steps?: number;
  ramp?: 'yes' | 'no' | 'unknown';
  surface?: string;
  doorwayWidthCm?: number;
  observedAt?: string;
  evidence?: FieldEvidence;
  /** Moving an entrance invalidates the location-specific guide review. */
  needsReview?: boolean;
  photoIds?: string[];
}
export interface CampusPhoto extends PackageAsset {
  id: string;
  buildingId: string;
  entranceId?: string;
  caption: string;
  alt: string;
  author: string;
  sourceKind?: 'external' | 'author-upload';
  sourceUrl?: string;
  license: 'CC BY 4.0' | 'CC BY-SA 4.0' | 'CC0 1.0' | 'Public domain';
  licenseUrl: string;
  attribution: string;
  modifications: string;
  capturedAt?: string;
  checkedAt: string;
  historical?: boolean;
  width: number;
  height: number;
}
export interface PlaceDetails {
  arrival?: ArrivalGuide;
  subtype?: string;
  address?: string;
  phone?: string;
  website?: string;
  openingHours?: string;
  businessStatus?: 'operating' | 'temporarily-closed' | 'closed' | 'unknown';
  evidence?: FieldEvidence;
}
export interface Place extends PlaceDetails {
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
  /** Path-local node retained when an automatic crossing merges this approach. */
  crossingGraphNode?: string;
  buildingId?: string;
  sourceRefs?: string[];
  approachDistance?: number;
  arrivalKind: 'entrance' | 'mapped-approach' | 'unmapped';
  height?: number;
  heightEstimated?: boolean;
}
export interface GraphNode {
  vehicleReview?: DrivingReview;
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
  vehicle?: VehicleRules;
  vehicleAllowed?: boolean;
  walkingAccess?: WalkingAccess;
  accessReviewId?: string;
  accessReviewIds?: string[];
  geometryBlocked?: string;
  steps?: boolean;
  sourceId: string;
  /** Original edge IDs retained when an explicit junction splits a segment. */
  parentEdgeIds?: string[];
  /** Original path endpoints, so automatic junctions can be undone on later edits. */
  crossingEndpoints?: { from: GraphNode; to: GraphNode };
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
  arrival?: ArrivalGuide;
  id: string;
  placeId: string;
  buildingId?: string;
  name: string;
  coordinates: Position;
  walkingAccess: WalkingAccess;
  source: string;
  graphNode?: string;
  crossingGraphNode?: string;
}
export type RouteEndpoint = string | { placeId: string; entranceId?: string };
export type RouteOrigin = Position | RouteEndpoint;
export interface RoutingGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export interface Closure {
  modes?: TravelMode[];
  id: string;
  edgeIds: string[];
  reason: string;
  expectedReopening?: string;
  reopenedAt?: string;
}
export interface CampusData {
  sourceSnapshots?: {
    file: string;
    url: string;
    license: string;
    sha256: string;
    bytes: number;
    retrievedAt: string;
  }[];
  schemaVersion: 1 | 2 | 3;
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
  photos?: CampusPhoto[];
  /** Explicit owner galleries override subsequent research imports, including removals. */
  photoOverrides?: string[];
  entrances?: Entrance[];
  graph: RoutingGraph;
  driving?: {
    version: 1;
    parking: ParkingConnection[];
    restrictions: TurnRestriction[];
  };
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
    licenseText?: string;
    notice?: string;
    release?: string;
    retrievedAt: string;
  }[];
}
export interface PackageAsset {
  url: string;
  sha256: string;
  bytes: number;
}
export interface CampusPackage {
  campus?: { id: string; slug: string; name: string };
  schemaVersion: 1 | 2 | 3;
  version: string;
  createdAt: string;
  summary: string;
  dataUrl: string;
  bytes: number;
  assets: PackageAsset[];
  visuals?: { bytes: number; assetUrls: string[] };
  textures?: { bytes: number; assetUrls: string[] };
  photos?: { bytes: number; assetUrls: string[] };
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
  roundaboutExit?: number;
  kind: ManeuverKind;
  instruction: string;
  at: number;
  coordinates: Position;
  street: string;
}
export interface Route {
  mode?: TravelMode;
  legs?: Route[];
  parkingId?: string;
  parkingName?: string;
  estimatedSpeed?: boolean;
  segmentSeconds?: number[];
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
    modelDocument?: import('./model-document.js').ModelDocument;
    modelDocumentAsset?: import('./model-document.js').ModelAssetReference;
    appearance?: BuildingAppearance;
    modelAuthoring?: import('./visual-types.js').ModelAuthoring;
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
