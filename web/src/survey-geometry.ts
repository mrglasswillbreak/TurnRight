import { distance, projectSegment } from './geo';
import type { CampusData, MapEdit, Position } from './types';
import {
  SURVEY_LIMITS,
  type SurveySample,
  type SurveyVertex,
  type SurveyLine,
  type ReplacementTarget,
  type SurveyRecording,
} from './survey-types.js';
/** Check assembled connectivity, including automatic junctions and active closures. */
export function disconnectedSurveyPaths(
  before: CampusData,
  after: CampusData,
  edits: MapEdit[],
) {
  const closed = new Set(
    after.closures.filter((c) => !c.reopenedAt).flatMap((c) => c.edgeIds),
  );
  const allowed = after.graph.edges.filter(
    (e) =>
      e.accessible &&
      !['private', 'no'].includes(e.walkingAccess || 'yes') &&
      !e.geometryBlocked &&
      !closed.has(e.id),
  );
  const newIds = new Set(
    edits.filter((e) => e.kind === 'path').map((e) => e.id),
  );
  const originalSources = new Set(
    before.graph.edges
      .filter((e) => !newIds.has(e.sourceId))
      .map((e) => e.sourceId),
  );
  const previouslyClosed = new Set(
    before.closures.filter((c) => !c.reopenedAt).flatMap((c) => c.edgeIds),
  );
  const originalNodes = new Set(
    before.graph.edges
      .filter(
        (edge) =>
          newIds.has(edge.sourceId) &&
          edge.accessible &&
          !edge.geometryBlocked &&
          !previouslyClosed.has(edge.id),
      )
      .flatMap((edge) => [edge.from, edge.to]),
  );
  const adjacency = new Map<string, string[]>();
  const reachable = new Set<string>();
  for (const edge of allowed) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) || []), edge.to]);
    adjacency.set(edge.to, [...(adjacency.get(edge.to) || []), edge.from]);
    if (originalSources.has(edge.sourceId)) {
      reachable.add(edge.from);
      reachable.add(edge.to);
    } else {
      // Replacement surveys may retain the entire existing component.
      for (const end of [edge.from, edge.to])
        if (originalNodes.has(end)) reachable.add(end);
    }
  }
  const queue = [...reachable];
  while (queue.length) {
    for (const next of adjacency.get(queue.pop()!) || []) {
      if (reachable.has(next)) continue;
      reachable.add(next);
      queue.push(next);
    }
  }
  return edits.filter(
    (edit) =>
      edit.kind === 'path' &&
      !edit.deleted &&
      !allowed.some(
        (edge) =>
          edge.sourceId === edit.id &&
          (reachable.has(edge.from) || reachable.has(edge.to)),
      ),
  );
}

export function simplify(vertices: SurveyVertex[]): SurveyVertex[] {
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
