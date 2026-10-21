import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { Position } from './types.js';
export const rounded = (n: number) => Math.round(n * 1000) / 1000;

export const signedArea = (ring: number[][]) =>
  ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;

export function footprintAssessment(feature: Feature<Polygon | MultiPolygon>) {
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  const points = polygons.flat(2),
    west = Math.min(...points.map((p) => p[0])),
    east = Math.max(...points.map((p) => p[0])),
    south = Math.min(...points.map((p) => p[1])),
    north = Math.max(...points.map((p) => p[1]));
  const yScale = (Math.PI / 180) * 6371008.8,
    xScale = yScale * Math.cos((((south + north) / 2) * Math.PI) / 180);
  let area = 0,
    longest = 0,
    bearing = 0;
  for (const polygon of polygons)
    for (const [index, ring] of polygon.entries()) {
      const local = ring
        .slice(0, -1)
        .map((p) => [(p[0] - west) * xScale, (p[1] - south) * yScale]);
      area += Math.abs(signedArea(local)) * (index === 0 ? 1 : -1);
      if (index === 0)
        for (let i = 0; i < local.length; i++) {
          const a = local[i],
            b = local[(i + 1) % local.length],
            dx = b[0] - a[0],
            dy = b[1] - a[1],
            length = Math.hypot(dx, dy);
          if (length > longest) {
            longest = length;
            bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 180) % 180;
          }
        }
    }
  return {
    bounds: [
      [west, south],
      [east, north],
    ] as [Position, Position],
    widthMetres: rounded((east - west) * xScale),
    depthMetres: rounded((north - south) * yScale),
    areaSquareMetres: rounded(area),
    longestEdgeBearing: rounded(bearing),
    polygonParts: polygons.length,
    courtyards: polygons.reduce((n, p) => n + p.length - 1, 0),
  };
}
