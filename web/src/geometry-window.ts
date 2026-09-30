import type { Geometry, Position } from 'geojson';
export const HANDLE_WINDOW = 100;
export function vertexCount(g: Geometry): number {
  const count = (v: unknown): number =>
    Array.isArray(v)
      ? typeof v[0] === 'number'
        ? 1
        : v.reduce((n, x) => n + count(x), 0)
      : 0;
  return g.type === 'GeometryCollection'
    ? g.geometries.reduce((n, x) => n + vertexCount(x), 0)
    : count(g.coordinates);
}
export function polygonRings(g: Geometry): Position[][][] {
  return g.type === 'Polygon'
    ? [g.coordinates]
    : g.type === 'MultiPolygon'
      ? g.coordinates
      : [];
}
export function editableParts(g: Geometry): Position[][][] {
  return g.type === 'LineString' || g.type === 'MultiPoint'
    ? [[g.coordinates]]
    : g.type === 'MultiLineString'
      ? g.coordinates.map((part) => [part])
      : polygonRings(g);
}
export function geometryWindow(g: Geometry, part = 0, ring = 0, start = 0) {
  const points = editableParts(g)[part]?.[ring];
  if (!points) throw new Error('Select an existing part.');
  const closed = g.type === 'Polygon' || g.type === 'MultiPolygon';
  const total = points.length - Number(closed);
  const offset = Math.max(0, Math.min(start, Math.max(0, total - 2)));
  return {
    part,
    ring,
    start: offset,
    closed,
    points: g.type === 'MultiPoint',
    length: Math.min(HANDLE_WINDOW, total - offset),
    geometry: {
      type: 'LineString' as const,
      coordinates: points
        .slice(offset, Math.min(total, offset + HANDLE_WINDOW))
        .map((p) => [...p]),
    },
  };
}
export function replaceWindow(
  original: Geometry,
  window: ReturnType<typeof geometryWindow>,
  coordinates: Position[],
): Geometry {
  const next = structuredClone(original),
    points = editableParts(next)[window.part]?.[window.ring];
  if (!points) throw new Error('This part no longer exists.');
  if (window.closed) points.pop();
  points.splice(window.start, window.length, ...coordinates.map((p) => [...p]));
  if (points.length < (window.closed ? 3 : window.points ? 1 : 2))
    throw new Error('The part needs more vertices.');
  if (window.closed) points.push([...points[0]]);
  return next;
}
