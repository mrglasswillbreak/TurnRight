import { validDrivingData, validVehicleRules } from './driving-validation.js';
import { detailErrors } from './place-details.js';
import { arrivalIssues } from './arrival.js';
import type { CampusData, Position, MapEdit } from './types.js';
import type { Geometry } from 'geojson';

export type ValidationPhase =
  | 'sources'
  | 'edits'
  | 'topology'
  | 'geometry'
  | 'duplicates'
  | 'worker';
export interface ValidationIssue {
  code: string;
  phase: ValidationPhase;
  message: string;
  featureId?: string;
  referenceIds?: string[];
  coordinates?: Position;
  featureKind?: MapEdit['kind'];
  field?: string;
  repair?: 'choose-place' | 'connect-path' | 'review-segment' | 'review-model';
  severity?: 'error' | 'warning';
}
export function finitePosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}
export function firstPosition(value: unknown): Position | undefined {
  if (finitePosition(value)) return [value[0], value[1]];
  if (Array.isArray(value)) {
    for (const child of value) {
      const point = firstPosition(child);
      if (point) return point;
    }
  }
}
function validGeometry(geometry: Geometry): boolean {
  const line = (value: unknown, min = 2): value is number[][] =>
    Array.isArray(value) && value.length >= min && value.every(finitePosition);
  const ring = (value: unknown) =>
    line(value, 4) &&
    value[0][0] === value.at(-1)![0] &&
    value[0][1] === value.at(-1)![1];
  const polygon = (value: unknown) =>
    Array.isArray(value) && value.length > 0 && value.every(ring);
  switch (geometry.type) {
    case 'Point':
      return finitePosition(geometry.coordinates);
    case 'MultiPoint':
      return line(geometry.coordinates, 1);
    case 'LineString':
      return line(geometry.coordinates);
    case 'MultiLineString':
      return (
        Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length > 0 &&
        geometry.coordinates.every((c) => line(c))
      );
    case 'Polygon':
      return polygon(geometry.coordinates);
    case 'MultiPolygon':
      return (
        Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length > 0 &&
        geometry.coordinates.every(polygon)
      );
    default:
      return false;
  }
}
/** Reject malformed source data before any topology or spatial code dereferences it. */
export function structuralIssues(
  data: CampusData,
  phase: ValidationPhase = 'sources',
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (
    code: string,
    featureId: string,
    message: string,
    referenceIds?: string[],
    coordinates?: Position,
  ) =>
    issues.push({ code, phase, featureId, message, referenceIds, coordinates });
  if (
    !data?.graph ||
    !Array.isArray(data.graph.nodes) ||
    !Array.isArray(data.graph.edges) ||
    !Array.isArray(data.map?.features) ||
    !Array.isArray(data.places) ||
    !Array.isArray(data.closures)
  )
    return [
      {
        code: 'invalid-source',
        phase,
        message:
          'The campus source is incomplete. Restore a complete approved snapshot.',
      },
    ];
  if (
    ![1, 2, 3].includes(data.schemaVersion) ||
    (data.driving !== undefined &&
      (data.schemaVersion < 2 || !validDrivingData(data.driving)))
  )
    add(
      'invalid-driving',
      'campus',
      'Unsupported or malformed driving package. Update the app or restore a valid package.',
    );
  for (const edge of data.graph.edges)
    if (edge?.vehicle !== undefined && !validVehicleRules(edge.vehicle))
      add('invalid-driving', edge.sourceId, 'Invalid vehicle rules.');
  const nodes = new Map<string, CampusData['graph']['nodes'][number]>();
  for (const node of data.graph.nodes) {
    if (
      !node ||
      typeof node.id !== 'string' ||
      !finitePosition(node.coordinates)
    ) {
      add(
        'invalid-coordinate',
        node?.id || 'unknown node',
        'Path node has missing or non-finite coordinates.',
      );
      continue;
    }
    if (nodes.has(node.id))
      add('duplicate-node', node.id, 'Two path nodes have the same identity.');
    nodes.set(node.id, node);
  }
  const ids = new Set<string>();
  const features = new Map(
    data.map.features.filter(Boolean).map((f) => [f.properties?.id, f]),
  );
  for (const edge of data.graph.edges) {
    if (!edge || typeof edge.id !== 'string') {
      add(
        'invalid-edge',
        'unknown edge',
        'Path segment is missing its identity.',
      );
      continue;
    }
    const missing = [edge.from, edge.to].filter((id) => !nodes.has(id));
    const feature = features.get(edge.sourceId);
    const point =
      nodes.get(edge.from)?.coordinates ||
      nodes.get(edge.to)?.coordinates ||
      (feature?.geometry && 'coordinates' in feature.geometry
        ? firstPosition(feature.geometry.coordinates)
        : undefined);
    if (missing.length)
      add(
        'missing-endpoint',
        edge.sourceId || edge.id,
        `Path ${edge.id} references missing or invalid nodes. Restore its source nodes or reconcile the published baseline.`,
        missing,
        point,
      );
    if (!Number.isFinite(edge.distance) || edge.distance <= 0)
      add(
        'invalid-distance',
        edge.sourceId || edge.id,
        `Path ${edge.id} has an invalid length.`,
        [edge.id],
        point,
      );
    if (ids.has(edge.id))
      add(
        'duplicate-edge',
        edge.sourceId || edge.id,
        `Duplicate edge ${edge.id}.`,
        [edge.id],
        point,
      );
    ids.add(edge.id);
  }
  for (const feature of [data.boundary, ...data.map.features]) {
    const geometry = feature?.geometry;
    if (!geometry || !('coordinates' in geometry) || !validGeometry(geometry))
      add(
        'invalid-geometry',
        String(feature?.properties?.id || 'campus boundary'),
        'Feature geometry has missing or invalid coordinates.',
      );
  }
  for (const place of data.places)
    for (const message of detailErrors({ ...place }))
      issues.push({
        code: 'place-evidence',
        phase: 'sources',
        message,
        featureId: place.id,
        featureKind: 'place',
        coordinates: place.coordinates,
      });
  for (const place of [...data.places, ...(data.entrances || [])])
    if (!place || !finitePosition(place.coordinates))
      add(
        'invalid-coordinate',
        place?.id || 'unknown place',
        'Place or entrance has missing or invalid coordinates.',
      );
  for (const message of arrivalIssues(data))
    add('arrival-media', 'campus', message);
  return issues;
}
