import type { MultiPolygon, Polygon } from 'geojson';
import { BoundsIndex, boundsOf } from '../src/spatial-index.js';

type Point = number[];
const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const side = [cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b)];
  return side[0] * side[1] <= 0 && side[2] * side[3] <= 0;
}
function inside(point: Point, ring: Point[]) {
  let contained = false;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1],
      b = ring[i];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      contained = !contained;
  }
  return contained;
}

/** Called after structural validation, before saving a new campus identity. */
export function validCampusBoundary(geometry: Polygon | MultiPolygon) {
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const extent = boundsOf(polygons.flat(2));
  const index = new BoundsIndex<{
    a: Point;
    b: Point;
    ring: number;
    vertex: number;
  }>(Math.max(extent[2] - extent[0], extent[3] - extent[1], 0.00001) / 32);
  let ringId = 0;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      const id = ringId++;
      let area = 0;
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i];
        if (same(a, b)) return false;
        area +=
          (a[0] - ring[0][0]) * (b[1] - ring[0][1]) -
          (b[0] - ring[0][0]) * (a[1] - ring[0][1]);
        const bounds = boundsOf([a, b]);
        for (const other of index.query(bounds)) {
          const adjacent =
            other.ring === id &&
            (other.vertex === i - 1 ||
              (i === ring.length - 1 && other.vertex === 1));
          if (adjacent) {
            // Adjacent segments may meet, but cannot double back over each other.
            const previous = same(other.b, a) ? other.a : other.b;
            const joint = same(other.b, a) ? a : b;
            const next = same(other.b, a) ? b : a;
            if (
              cross(previous, joint, next) === 0 &&
              (previous[0] - joint[0]) * (next[0] - joint[0]) +
                (previous[1] - joint[1]) * (next[1] - joint[1]) >
                0
            )
              return false;
          } else if (intersects(a, b, other.a, other.b)) return false;
        }
        index.add(bounds, { a, b, ring: id, vertex: i });
      }
      if (Math.abs(area) < 1e-14) return false;
    }
    for (let hole = 1; hole < polygon.length; hole++) {
      if (!inside(polygon[hole][0], polygon[0])) return false;
      for (let other = 1; other < polygon.length; other++)
        if (other !== hole && inside(polygon[hole][0], polygon[other]))
          return false;
    }
  }
  for (let i = 0; i < polygons.length; i++)
    for (let j = 0; j < polygons.length; j++)
      if (
        i !== j &&
        inside(polygons[i][0][0], polygons[j][0]) &&
        !polygons[j].slice(1).some((ring) => inside(polygons[i][0][0], ring))
      )
        return false;
  return true;
}
