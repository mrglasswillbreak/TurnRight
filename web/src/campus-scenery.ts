import type { Feature, Geometry } from 'geojson';
import type { CampusData, Position } from './types';
import type { SceneryRecipe } from './visual-types';
import { BoundsIndex, boundsOf, nearbyBounds } from './spatial-index';
import { distance, projectSegment } from './geo';

export function sceneryRevision(geometry: Geometry) {
  const input = JSON.stringify(geometry);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++)
    hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  return `${hash >>> 0}-${input.length}`;
}
function rings(geometry: Geometry): number[][][] {
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}
function inRing(p: Position, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function sceneryContains(p: Position, geometry: Geometry) {
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];
  return polygons.some(
    (polygon) =>
      inRing(p, polygon[0]) &&
      !polygon.slice(1).some((hole) => inRing(p, hole)),
  );
}
function clearance(p: Position, geometry: Geometry, metres: number) {
  return rings(geometry).every((ring) =>
    ring.every(
      (b, i) =>
        !i ||
        projectSegment(p, ring[i - 1] as Position, b as Position).distance >=
          metres,
    ),
  );
}
export function validScenery(value: unknown): value is SceneryRecipe {
  if (!value || typeof value !== 'object') return false;
  const r = value as SceneryRecipe;
  return (
    r.version === 1 &&
    r.classification === 'illustrative' &&
    Number.isSafeInteger(r.seed) &&
    Number.isFinite(r.spacing) &&
    r.spacing >= 8 &&
    r.spacing <= 60 &&
    Number.isInteger(r.maxInstances) &&
    r.maxInstances >= 0 &&
    r.maxInstances <= 2000 &&
    Array.isArray(r.regions) &&
    r.regions.length <= 10000 &&
    r.regions.every(
      (p) =>
        typeof p.featureId === 'string' &&
        typeof p.geometryRevision === 'string' &&
        typeof p.reviewedAt === 'string' &&
        Number.isFinite(Date.parse(p.reviewedAt)),
    )
  );
}
export interface SceneryInstance {
  coordinates: Position;
  height: number;
  radius: number;
  shrub: boolean;
}
/** Bounded deterministic generation, with crown clearance from holes and obstacles. */
export function generateScenery(data: CampusData): SceneryInstance[] {
  const recipe = data.visuals?.scenery;
  if (!validScenery(recipe)) return [];
  const features = new Map(
    data.map.features.map((f) => [String(f.properties?.id), f]),
  );
  const obstacles = new BoundsIndex<Feature>();
  for (const f of data.map.features) {
    const p = f.properties || {};
    if (
      ['building', 'path', 'barrier'].includes(p.kind) ||
      ['water', 'road', 'sidewalk', 'parking', 'sports'].includes(p.landClass)
    )
      obstacles.add(boundsOf(rings(f.geometry).flat()), f);
  }
  // Some campus packages keep the route paths outside the display geometry.
  const nodes = new Map(data.graph.nodes.map((n) => [n.id, n.coordinates]));
  for (const edge of data.graph.edges) {
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    if (a && b)
      obstacles.add(boundsOf([a, b]), {
        type: 'Feature',
        properties: { width: 3 },
        geometry: { type: 'LineString', coordinates: [a, b] },
      });
  }
  let state = recipe.seed >>> 0,
    attempts = 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const result: SceneryInstance[] = [],
    planted = new BoundsIndex<SceneryInstance>();
  for (const region of [...recipe.regions].sort((a, b) =>
    a.featureId.localeCompare(b.featureId),
  )) {
    const feature = features.get(region.featureId);
    if (
      !feature ||
      feature.properties?.visible === false ||
      !['green', 'wetland'].includes(feature.properties?.landClass) ||
      sceneryRevision(feature.geometry) !== region.geometryRevision
    )
      continue;
    const bounds = boundsOf(rings(feature.geometry).flat());
    const dy = recipe.spacing / 111195,
      dx = dy / Math.cos((bounds[1] * Math.PI) / 180);
    for (let y = bounds[1]; y < bounds[3]; y += dy)
      for (let x = bounds[0]; x < bounds[2]; x += dx) {
        if (result.length >= recipe.maxInstances || attempts++ >= 60000)
          return result;
        const p: Position = [x + random() * dx, y + random() * dy];
        const shrub = random() < 0.24,
          radius = shrub ? 0.8 + random() * 0.5 : 1.8 + random() * 1.2;
        if (
          !sceneryContains(p, feature.geometry) ||
          !clearance(p, feature.geometry, radius + 0.5)
        )
          continue;
        if (
          obstacles
            .query(nearbyBounds(p, radius + 15))
            .some(
              (f) =>
                sceneryContains(p, f.geometry) ||
                !clearance(
                  p,
                  f.geometry,
                  radius +
                    Math.min(
                      12,
                      Math.max(1.5, Number(f.properties?.width) / 2 || 1.5),
                    ),
                ),
            )
        )
          continue;
        if (
          planted
            .query(nearbyBounds(p, 7))
            .some(
              (tree) =>
                distance(p, tree.coordinates) < radius + tree.radius + 1,
            )
        )
          continue;
        const tree = {
          coordinates: p,
          radius,
          shrub,
          height: shrub ? 1.1 + random() : 5 + random() * 3,
        };
        result.push(tree);
        planted.add(boundsOf([p]), tree);
      }
  }
  return result;
}
