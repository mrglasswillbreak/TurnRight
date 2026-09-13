import type { Feature, FeatureCollection } from "geojson";
import { BoundsIndex, boundsOf } from './spatial-index.js';
import type { Position } from "./types.js";
import { projectSegment } from "./geo.js";
function inside(point: Position, rings: number[][][]) {
  const ringContains = (ring: number[][]) => {
    let result = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i] as Position,
        b = ring[j] as Position;
      if (projectSegment(point, a, b).distance < 0.15) return false;
      if (
        a[1] > point[1] !== b[1] > point[1] &&
        point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        result = !result;
    }
    return result;
  };
  return ringContains(rings[0]) && !rings.slice(1).some(ringContains);
}
function intersection(a: Position, b: Position, c: Position, d: Position) {
  const x = b[0] - a[0],
    y = b[1] - a[1],
    u = d[0] - c[0],
    v = d[1] - c[1],
    den = x * v - y * u;
  if (Math.abs(den) < 1e-16) return null;
  const t = ((c[0] - a[0]) * v - (c[1] - a[1]) * u) / den,
    s = ((c[0] - a[0]) * y - (c[1] - a[1]) * x) / den;
  return t >= 0 && t <= 1 && s >= 0 && s <= 1 ? t : null;
}
function checkGeometry(
  a: Position,
  b: Position,
  features: Feature[],
): string | undefined {
  for (const feature of features) {
    const kind = feature.properties?.kind,
      g = feature.geometry;
    if (kind === "building" && (g.type === "Polygon" || g.type === "MultiPolygon")) {
      const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      for (const rings of polygons) {
        const outer = rings[0];
        if (
          Math.max(a[0], b[0]) < Math.min(...outer.map((p) => p[0])) ||
          Math.min(a[0], b[0]) > Math.max(...outer.map((p) => p[0])) ||
          Math.max(a[1], b[1]) < Math.min(...outer.map((p) => p[1])) ||
          Math.min(a[1], b[1]) > Math.max(...outer.map((p) => p[1]))
        )
          continue;
        const cuts = [0, 1];
        for (const ring of rings)
          for (let i = 1; i < ring.length; i++) {
            const t = intersection(a, b, ring[i - 1] as Position, ring[i] as Position);
            if (t !== null) cuts.push(t);
          }
        cuts.sort((x, y) => x - y);
        for (let i = 1; i < cuts.length; i++) {
          const t = (cuts[i - 1] + cuts[i]) / 2;
          if (inside([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], rings))
            return `building:${feature.properties?.id || feature.id}`;
        }
      }
    } else if (kind === "barrier" && g.type === "LineString") {
      for (let i = 1; i < g.coordinates.length; i++) {
        const t = intersection(
          a,
          b,
          g.coordinates[i - 1] as Position,
          g.coordinates[i] as Position,
        );
        if (t !== null && t > 0.001 && t < 0.999)
          return `barrier:${feature.properties?.id || feature.id}`;
      }
    }
  }
}

export function createGeometryBlocker(map: FeatureCollection) {
  const index = new BoundsIndex<Feature>();
  for (const feature of map.features) {
    const g = feature.geometry;
    if (feature.properties?.kind === 'building' && (g.type === 'Polygon' || g.type === 'MultiPolygon'))
      index.add(boundsOf(g.type === 'Polygon' ? g.coordinates.flat() : g.coordinates.flat(2)), feature);
    else if (feature.properties?.kind === 'barrier' && g.type === 'LineString')
      index.add(boundsOf(g.coordinates), feature);
  }
  const results = new Map<string, string | undefined>();
  return (a: Position, b: Position) => {
    const key = [a.join(','), b.join(',')].sort().join('|');
    if (!results.has(key)) results.set(key, checkGeometry(a, b, index.query(boundsOf([a, b]))));
    return results.get(key);
  };
}

let previous: { signature: string; check: ReturnType<typeof createGeometryBlocker> } | undefined;
/** Metadata and height edits reuse obstruction results; geometry edits invalidate them. */
export function cachedGeometryBlocker(map: FeatureCollection) {
  const signature = JSON.stringify(map.features
    .filter(f => ['building', 'barrier'].includes(f.properties?.kind))
    .map(f => [f.properties?.kind, f.properties?.id || f.id, f.geometry]));
  if (previous?.signature !== signature) previous = { signature, check: createGeometryBlocker(map) };
  return previous.check;
}
export function geometryBlocker(a: Position, b: Position, map: FeatureCollection) {
  return cachedGeometryBlocker(map)(a, b);
}
