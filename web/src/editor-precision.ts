import type { Feature, Geometry } from 'geojson';
import type { Position } from './types';
import { BoundsIndex, boundsOf, nearbyBounds } from './spatial-index';
import { projectSegment, distance } from './geo';

export type SnapKind = 'vertex' | 'endpoint' | 'midpoint' | 'edge';
export type Constraint = 'free' | 'right-angle' | 'parallel' | 'perpendicular';
export interface PrecisionSettings {
  enabled: boolean;
  tolerance: number;
  kinds: SnapKind[];
  constraint: Constraint;
  referenceBearing: number;
}
export const DEFAULT_PRECISION: PrecisionSettings = {
  enabled: true,
  tolerance: 12,
  kinds: ['vertex', 'endpoint', 'midpoint', 'edge'],
  constraint: 'free',
  referenceBearing: 0,
};
export function geometryLines(g: Geometry): Position[][] {
  switch (g.type) {
    case 'Point':
      return [[g.coordinates as Position]];
    case 'MultiPoint':
      return g.coordinates.map((p) => [p as Position]);
    case 'LineString':
      return [g.coordinates as Position[]];
    case 'MultiLineString':
    case 'Polygon':
      return g.coordinates as Position[][];
    case 'MultiPolygon':
      return g.coordinates.flat() as Position[][];
    case 'GeometryCollection':
      return g.geometries.flatMap(geometryLines);
  }
}
export function bearing(a: Position, b: Position) {
  return (
    ((Math.atan2(
      (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180),
      b[1] - a[1],
    ) *
      180) /
      Math.PI +
      360) %
    360
  );
}
export function constructPoint(
  origin: Position,
  metres: number,
  degrees: number,
): Position {
  if (
    !Number.isFinite(metres) ||
    metres <= 0 ||
    metres > 10000 ||
    !Number.isFinite(degrees)
  )
    throw new Error(
      'Use a distance above zero and at most 10,000 m, and a finite bearing.',
    );
  const angle = (degrees * Math.PI) / 180;
  const radians = metres / 6371000;
  const lat = (origin[1] * Math.PI) / 180,
    lon = (origin[0] * Math.PI) / 180;
  const y = Math.asin(
    Math.sin(lat) * Math.cos(radians) +
      Math.cos(lat) * Math.sin(radians) * Math.cos(angle),
  );
  const x =
    lon +
    Math.atan2(
      Math.sin(angle) * Math.sin(radians) * Math.cos(lat),
      Math.cos(radians) - Math.sin(lat) * Math.sin(y),
    );
  return [(x * 180) / Math.PI, (y * 180) / Math.PI];
}
export function constrainPoint(
  point: Position,
  points: Position[],
  settings: PrecisionSettings,
): Position {
  const a = points.at(-1);
  if (!a || settings.constraint === 'free') return point;
  let axis = settings.referenceBearing;
  if (settings.constraint === 'right-angle' && points.length > 1)
    axis = bearing(points[points.length - 2], a);
  if (settings.constraint === 'perpendicular') axis += 90;
  const step = settings.constraint === 'right-angle' ? 90 : 180;
  const direction = axis + Math.round((bearing(a, point) - axis) / step) * step;
  const length = distance(a, point);
  return length > 0.001
    ? constructPoint(a, Math.min(length, 10000), direction)
    : a;
}
export interface ReferenceSnap {
  coordinates: Position;
  label: string;
  kind: SnapKind;
  featureId: string;
}
type Segment = {
  a: Position;
  b: Position;
  id: string;
  name: string;
  start: boolean;
  end: boolean;
  minZoom?: number;
  maxZoom?: number;
};
/** Built once per geometry/visibility revision. Pointer moves inspect only nearby segments. */
export class ReferenceSnapIndex {
  private segments = new BoundsIndex<Segment>();
  constructor(features: Feature[]) {
    for (const feature of features) {
      if (feature.properties?.visible === false) continue;
      for (const line of geometryLines(feature.geometry)) {
        const closed =
          line.length > 2 &&
          line[0][0] === line.at(-1)![0] &&
          line[0][1] === line.at(-1)![1];
        for (let i = 0; i < Math.max(1, line.length - 1); i++) {
          if (!line[i]) continue;
          const a = line[i],
            b = line[i + 1] || a;
          this.segments.add(boundsOf([a, b]), {
            a,
            b,
            id: String(feature.properties?.id ?? feature.id ?? ''),
            name: String(feature.properties?.name || 'Reference'),
            minZoom: feature.properties?.renderStyle?.minZoom,
            maxZoom: feature.properties?.renderStyle?.maxZoom,
            start: !closed && i === 0,
            end: !closed && i === line.length - 2,
          });
        }
      }
    }
  }
  snap(
    point: Position,
    project: (p: Position) => { x: number; y: number },
    settings: PrecisionSettings,
    exclude = '',
    zoom?: number,
  ): ReferenceSnap | undefined {
    if (!settings.enabled) return;
    const tolerance = Math.max(4, Math.min(30, settings.tolerance || 12));
    const pointer = project(point);
    const rank: Record<SnapKind, number> = {
      endpoint: 0,
      vertex: 1,
      midpoint: 2,
      edge: 3,
    };
    let best: ReferenceSnap | undefined,
      score = Infinity;
    const consider = (
      coordinates: Position,
      kind: SnapKind,
      segment: Segment,
    ) => {
      if (!settings.kinds.includes(kind)) return;
      const p = project(coordinates),
        pixels = Math.hypot(p.x - pointer.x, p.y - pointer.y);
      if (pixels > tolerance || distance(point, coordinates) > 20) return;
      const candidate = pixels + rank[kind] * 0.75;
      if (candidate >= score) return;
      score = candidate;
      best = {
        coordinates,
        kind,
        featureId: segment.id,
        label: `${segment.name} · ${kind} (reference)`,
      };
    };
    for (const segment of this.segments.query(nearbyBounds(point, 20))) {
      if (segment.id === exclude) continue;
      if (
        zoom !== undefined &&
        (zoom < (segment.minZoom ?? 0) || zoom >= (segment.maxZoom ?? 25))
      )
        continue;
      consider(segment.a, segment.start ? 'endpoint' : 'vertex', segment);
      consider(segment.b, segment.end ? 'endpoint' : 'vertex', segment);
      consider(
        [(segment.a[0] + segment.b[0]) / 2, (segment.a[1] + segment.b[1]) / 2],
        'midpoint',
        segment,
      );
      consider(
        projectSegment(point, segment.a, segment.b).point,
        'edge',
        segment,
      );
    }
    return best;
  }
}

/** Orthogonalize a projected ring while retaining vertex order and count. */
export function squareRing(ring: number[][]): number[][] {
  const points = ring.slice(0, -1);
  if (points.length < 4)
    throw new Error('Squaring needs at least four corners.');
  let axis = 0,
    longest = 0;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length],
      d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d > longest) {
      longest = d;
      axis = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
  });
  const c = Math.cos(axis),
    s = Math.sin(axis),
    origin = points[0];
  const local = points.map(([x, y]) => [
    (x - origin[0]) * c + (y - origin[1]) * s,
    -(x - origin[0]) * s + (y - origin[1]) * c,
  ]);
  const verticalEdges = local.map((a, i) => {
    const b = local[(i + 1) % local.length];
    return Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1]);
  });
  for (const dim of [0, 1]) {
    const parents = local.map((_, i) => i);
    const root = (i: number): number =>
      parents[i] === i ? i : (parents[i] = root(parents[i]));
    local.forEach((_, i) => {
      const j = (i + 1) % local.length;
      const vertical = verticalEdges[i];
      if ((dim === 0) === vertical) parents[root(i)] = root(j);
    });
    const groups = new Map<number, number[]>();
    local.forEach((_, i) =>
      groups.set(root(i), [...(groups.get(root(i)) || []), i]),
    );
    for (const group of groups.values()) {
      const mean = group.reduce((n, i) => n + local[i][dim], 0) / group.length;
      group.forEach((i) => (local[i][dim] = mean));
    }
  }
  const result = local.map(([x, y]) => [
    origin[0] + x * c - y * s,
    origin[1] + x * s + y * c,
  ]);
  if (
    result.some(
      (a, i) =>
        Math.hypot(
          a[0] - result[(i + 1) % result.length][0],
          a[1] - result[(i + 1) % result.length][1],
        ) < 0.01,
    )
  )
    throw new Error(
      'Squaring would collapse an edge. Use a simpler corner selection.',
    );
  return [...result, [...result[0]]];
}
