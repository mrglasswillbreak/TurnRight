import { distance, projectSegment } from './geo';
import type {
  CampusData,
  ConnectionTarget,
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
  id: string;
  vertices: SurveyVertex[];
  reviewed: boolean;
}
export interface SurveyMarker {
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
export function newSurvey(
  owner: string,
  sourceRevision: string,
): SurveyRecording {
  const now = new Date().toISOString();
  return {
    session: {
      id: surveyId(),
      owner,
      sourceRevision,
      name: 'Walking survey',
      createdAt: now,
      updatedAt: now,
      state: 'paused',
      segments: [],
      markers: [],
      review: [],
      past: [],
      future: [],
      generatedCorrectionIds: [],
      remoteRevision: null,
    },
    samples: [],
  };
}
export function insideMappingArea(p: Position) {
  return (
    p.length === 2 &&
    p.every(Number.isFinite) &&
    p[0] >= 3.19 &&
    p[0] <= 3.215 &&
    p[1] >= 6.455 &&
    p[1] <= 6.5
  );
}
export function classifyFix(
  fix: GpsFix,
  previous: SurveySample | undefined,
  lastTimestamp: number,
  now: number,
): SampleStatus {
  if (!insideMappingArea(fix.coordinates)) return 'outside';
  if (
    !Number.isFinite(fix.timestamp) ||
    fix.timestamp > now + 1000 ||
    now - fix.timestamp > SURVEY_LIMITS.age
  )
    return 'stale';
  if (fix.timestamp <= lastTimestamp) return 'out-of-order';
  if (
    !Number.isFinite(fix.accuracy) ||
    fix.accuracy <= 0 ||
    fix.accuracy > SURVEY_LIMITS.accuracy
  )
    return 'inaccurate';
  if (previous) {
    const d = distance(previous.coordinates, fix.coordinates),
      seconds = (fix.timestamp - previous.timestamp) / 1000;
    if (d / seconds > SURVEY_LIMITS.speed) return 'jump';
    if (d < SURVEY_LIMITS.jitter) return 'duplicate';
  }
  return 'accepted';
}
export function acceptSample(
  recording: SurveyRecording,
  fix: GpsFix,
  now = Date.now(),
): SurveySample {
  const { session, samples } = recording;
  const last = samples.at(-1);
  const prior = samples.findLast(
    (s) => s.status === 'accepted' && s.segmentId === session.activeSegment,
  );
  if (last && fix.timestamp - last.timestamp > SURVEY_LIMITS.gap) {
    session.activeSegment = undefined;
    session.pauseReason = 'GPS gap';
  }
  const latestTimestamp = samples.reduce(
    (max, s) =>
      Math.max(
        max,
        Number.isFinite(s.timestamp) &&
          s.timestamp <= now &&
          s.status !== 'stale'
          ? s.timestamp
          : 0,
      ),
    0,
  );
  const status = classifyFix(
    fix,
    session.activeSegment ? prior : undefined,
    latestTimestamp,
    now,
  );
  if (!['accepted', 'duplicate'].includes(status)) {
    session.activeSegment = undefined;
    session.pauseReason = `Signal interruption: ${status}`;
  }
  if (status === 'accepted' && !session.activeSegment) {
    session.activeSegment = surveyId();
    session.segments.push({
      id: session.activeSegment,
      reason: session.pauseReason || 'Start',
    });
    session.pauseReason = undefined;
  }
  const sample: SurveySample = {
    ...fix,
    id: surveyId(),
    status,
    segmentId: ['accepted', 'duplicate'].includes(status)
      ? session.activeSegment
      : undefined,
  };
  samples.push(sample);
  return sample;
}
export function pauseSurvey(session: SurveySession, reason: string) {
  session.state = 'paused';
  session.activeSegment = undefined;
  session.pauseReason = reason;
}
function simplify(vertices: SurveyVertex[]): SurveyVertex[] {
  if (vertices.length <= 2) return vertices;
  const forced = vertices.findIndex(
    (v, i) => i > 0 && i < vertices.length - 1 && v.pinned,
  );
  let index = forced,
    furthest: number = SURVEY_LIMITS.simplify;
  if (index < 0)
    for (let i = 1; i < vertices.length - 1; i++) {
      const d = projectSegment(
        vertices[i].coordinates,
        vertices[0].coordinates,
        vertices.at(-1)!.coordinates,
      ).distance;
      if (d > furthest) {
        furthest = d;
        index = i;
      }
    }
  return index < 0
    ? [vertices[0], vertices.at(-1)!]
    : [
        ...simplify(vertices.slice(0, index + 1)).slice(0, -1),
        ...simplify(vertices.slice(index)),
      ];
}
export function proposeGeometry(recording: SurveyRecording): SurveyLine[] {
  return recording.session.segments
    .map((segment) => ({
      id: segment.id,
      reviewed: false,
      vertices: simplify(
        recording.samples
          .filter((s) => s.segmentId === segment.id && s.status === 'accepted')
          .map((s) => ({
            id: `survey:${recording.session.id}:${s.id}`,
            sampleId: s.id,
            coordinates: s.coordinates,
            pinned: recording.session.markers.some((m) => m.sampleId === s.id),
          })),
      ),
    }))
    .filter((l) => l.vertices.length >= 2);
}
export function surveyDistance(samples: SurveySample[]) {
  let previous: SurveySample | undefined,
    total = 0;
  for (const s of samples)
    if (s.status === 'accepted') {
      if (previous && previous.segmentId === s.segmentId)
        total += distance(previous.coordinates, s.coordinates);
      previous = s;
    }
  return total;
}
export function reviewCommand(
  session: SurveySession,
  edit: (state: SurveyReview) => void,
) {
  const next = structuredClone({
    review: session.review,
    markers: session.markers,
  });
  edit(next);
  session.past.push(
    structuredClone({ review: session.review, markers: session.markers }),
  );
  session.past = session.past.slice(-100);
  session.future = [];
  session.review = next.review;
  session.markers = next.markers;
  session.updatedAt = new Date().toISOString();
}
export function reviewUndo(session: SurveySession, redo = false) {
  const from = redo ? session.future : session.past,
    to = redo ? session.past : session.future,
    snapshot = from.pop();
  if (!snapshot) return;
  to.push(
    structuredClone({ review: session.review, markers: session.markers }),
  );
  session.review = snapshot.review;
  session.markers = snapshot.markers;
}
/** Order-independent fingerprint of the captured correction, including topology and restrictions. */
export function geometryFingerprint(edit: MapEdit) {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([k]) => k !== 'updated_at')
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, canonical(v)]),
          )
        : value;
  return JSON.stringify(canonical(edit));
}
export function replacementTarget(
  edit: MapEdit,
  data: CampusData,
  start: number,
  end: number,
): ReplacementTarget {
  if (edit.geometry.type !== 'LineString' || start >= end)
    throw new Error('Choose two different boundaries in path order.');
  const ids = edit.properties.vertexIds!;
  const nodes = data.graph.nodes;
  const edges = data.graph.edges.filter((e) => e.sourceId === edit.id);
  const points = edit.geometry.coordinates as Position[];
  const anchors: SurveyVertex[] = [];
  for (let i = start; i <= end; i++) {
    if (
      i > start &&
      !edges.some(
        (e) =>
          (e.from === ids[i - 1] && e.to === ids[i]) ||
          (e.to === ids[i - 1] && e.from === ids[i]),
      )
    )
      throw new Error(
        'This section contains a restricted or unmapped gap. Choose a continuous section.',
      );
    const shared = data.graph.edges.some(
      (e) => e.sourceId !== edit.id && (e.from === ids[i] || e.to === ids[i]),
    );
    const closed = data.closures.some(
      (c) =>
        !c.reopenedAt &&
        edges.some(
          (e) =>
            (e.from === ids[i] || e.to === ids[i]) &&
            [e.id, ...(e.parentEdgeIds || [])].some((id) =>
              c.edgeIds.includes(id),
            ),
        ),
    );
    const restricted = edges.some(
      (e) =>
        (e.from === ids[i] || e.to === ids[i]) &&
        (!e.accessible || e.accessReviewId || e.accessReviewIds?.length),
    );
    if (
      i === start ||
      i === end ||
      shared ||
      closed ||
      restricted ||
      nodes.find((n) => n.id === ids[i])?.accessReviewId
    )
      anchors.push({ id: ids[i], coordinates: points[i], pinned: true });
  }
  return {
    edit: structuredClone(edit),
    fingerprint: geometryFingerprint(edit),
    sourceRevision: data.version,
    start,
    end,
    anchors,
  };
}
export function surveyCorrections(
  session: SurveySession,
  currentTarget?: MapEdit,
): MapEdit[] {
  if (session.pendingMarker)
    throw new Error('Confirm or cancel the entrance position before applying.');
  if (
    !session.review.length ||
    session.review.some((l) => !l.reviewed || l.vertices.length < 2)
  )
    throw new Error('Review every section before applying.');
  let paths: MapEdit[] = session.review.map((l) => ({
    id: `survey:${session.id}:${l.id}`,
    kind: 'path',
    geometry: {
      type: 'LineString',
      coordinates: l.vertices.map((v) => v.coordinates),
    },
    properties: {
      name: session.name,
      access: 'yes',
      footDirection: 'both',
      vertexIds: l.vertices.map((v) => v.id),
      connections: l.vertices
        .filter((v) => v.connection)
        .map((v) => ({ vertexId: v.id, target: v.connection! })),
      surveyEvidence: {
        surveyId: session.id,
        revisionId: session.remoteRevision,
      },
      surveyProvenance: 'Reviewed walking survey',
    },
  }));
  if (session.replacement) {
    const r = session.replacement;
    const matchesApplied = currentTarget && session.appliedTarget?.fingerprint === geometryFingerprint(currentTarget) && session.appliedTarget.revision === currentTarget.updated_at;
    if (
      !currentTarget ||
      (!matchesApplied && (geometryFingerprint(currentTarget) !== r.fingerprint ||
      currentTarget.updated_at !== r.edit.updated_at))
    )
      throw new Error(
        'The target path changed or was removed. Re-select replacement boundaries and review before applying.',
      );
    if (paths.length !== 1)
      throw new Error(
        'Replacement needs one continuous reviewed section. Repair interruptions explicitly first.',
      );
    const line = session.review[0];
    let previous = -1;
    for (const anchor of r.anchors) {
      const i = line.vertices.findIndex(
        (v) =>
          v.id === anchor.id &&
          distance(v.coordinates, anchor.coordinates) < 0.05,
      );
      if (i <= previous)
        throw new Error(
          'Place the fixed junction and restriction anchors in order before replacing.',
        );
      previous = i;
    }
    if (
      line.vertices[0].id !== r.anchors[0].id ||
      line.vertices.at(-1)!.id !== r.anchors.at(-1)!.id
    )
      throw new Error('The replacement must meet both fixed boundaries.');
    const old =
      r.edit.geometry.type === 'LineString'
        ? (r.edit.geometry.coordinates as Position[])
        : [];
    const ids = r.edit.properties.vertexIds!;
    paths = [
      {
        ...structuredClone(r.edit),
        geometry: {
          type: 'LineString',
          coordinates: [
            ...old.slice(0, r.start),
            ...line.vertices.map((v) => v.coordinates),
            ...old.slice(r.end + 1),
          ],
        },
        properties: {
          ...r.edit.properties,
          ...paths[0].properties,
          name: r.edit.properties.name,
          access: r.edit.properties.access,
          footDirection: r.edit.properties.footDirection,
          vertexIds: [
            ...ids.slice(0, r.start),
            ...line.vertices.map((v) => v.id),
            ...ids.slice(r.end + 1),
          ],
          connections: [
            ...(r.edit.properties.connections || []).filter(
              (c) =>
                (!ids.slice(r.start, r.end + 1).includes(c.vertexId) ||
                  line.vertices.some((v) => v.id === c.vertexId)) &&
                !line.vertices.some((v) => v.id === c.vertexId && v.connection),
            ),
            ...(paths[0].properties.connections || []),
          ],
        },
      },
    ];
  }
  if (
    !session.replacement &&
    session.review.some((l) => !l.vertices.some((v) => v.connection))
  )
    throw new Error(
      'Connect every section to the mapped network before applying. Keep disconnected recordings as saved surveys.',
    );
  const entrances: MapEdit[] = session.markers.map((m) => {
    if (!m.placeId) throw new Error('Choose a place for every entrance.');
    const vertex = session.review
      .flatMap((l) => l.vertices)
      .find((v) => v.sampleId === m.sampleId);
    const connection =
      m.connection ||
      (vertex && distance(vertex.coordinates, m.coordinates) < 0.2
        ? {
            type: 'node' as const,
            nodeId: vertex.id,
            coordinates: vertex.coordinates,
          }
        : undefined);
    if (!connection)
      throw new Error(
        `Connect ${m.name || 'the entrance'} to a reviewed path or mapped target.`,
      );
    return {
      id: `survey:${session.id}:${m.id}`,
      kind: 'entrance',
      geometry: { type: 'Point', coordinates: m.coordinates },
      properties: {
        name: m.name || 'Entrance',
        placeId: m.placeId,
        buildingId: m.buildingId,
        access: m.access,
        connection,
        surveyEvidence: {
          surveyId: session.id,
          revisionId: session.remoteRevision,
        },
        surveyProvenance: 'Reviewed walking survey',
      },
    };
  });
  return [...paths, ...entrances];
}
