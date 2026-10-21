import type {
  ConnectionTarget,
  Category,
  PlaceDetails,
  GpsFix,
  MapEdit,
  Position,
  WalkingAccess,
} from './types';
export const SURVEY_LIMITS = {
  goodAccuracy: 8,
  accuracy: 15,
  age: 10000,
  gap: 15000,
  speed: 4,
  jitter: 2,
  simplify: 1.5,
} as const;

export type SampleStatus =
  | 'accepted'
  | 'duplicate'
  | 'inaccurate'
  | 'stale'
  | 'outside'
  | 'jump'
  | 'out-of-order';

export interface SurveySample extends GpsFix {
  id: string;
  segmentId?: string;
  status: SampleStatus;
}

export interface SurveyVertex {
  id: string;
  coordinates: Position;
  sampleId?: string;
  pinned?: boolean;
  connection?: ConnectionTarget;
}

export interface SurveyLine {
  name?: string;
  id: string;
  vertices: SurveyVertex[];
  reviewed: boolean;
}

export interface SurveyMarker extends PlaceDetails {
  kind?: 'entrance' | 'place';
  category?: Category;
  observedAt?: string;
  id: string;
  sampleId: string;
  segmentId?: string;
  coordinates: Position;
  accuracy: number;
  name: string;
  placeId: string;
  buildingId?: string;
  access: WalkingAccess;
  connection?: ConnectionTarget;
}

export interface ReplacementTarget {
  edit: MapEdit;
  fingerprint: string;
  sourceRevision: string;
  start: number;
  end: number;
  anchors: SurveyVertex[];
}

export interface SurveySession {
  campusId?: string;
  localVersion?: number;
  pendingMarker?: SurveyMarker;
  appliedTarget?: { fingerprint: string; revision?: string };
  id: string;
  owner: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  state: 'paused' | 'recording' | 'review';
  pauseReason?: string;
  sourceRevision: string;
  segments: { id: string; reason: string }[];
  activeSegment?: string;
  markers: SurveyMarker[];
  review: SurveyLine[];
  past: SurveyReview[];
  future: SurveyReview[];
  replacement?: ReplacementTarget;
  generatedCorrectionIds: string[];
  remoteRevision: string | null;
  archived?: boolean;
  pendingUpload?: SurveyUpload;
}

export interface SurveyReview {
  review: SurveyLine[];
  markers: SurveyMarker[];
}

export interface SurveyUpload {
  revisionId: string;
  expectedRevision: string | null;
  metadata: SurveySession;
  chunks: SurveySample[][];
}

export interface SurveyRecording {
  session: SurveySession;
  samples: SurveySample[];
}

export const surveyId = () => crypto.randomUUID();
