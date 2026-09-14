import type { Feature, MultiPolygon, Polygon } from 'geojson';

const area = (ring: number[][]) =>
  Math.abs(
    ring
      .slice(1)
      .reduce((sum, b, i) => sum + ring[i][0] * b[1] - b[0] * ring[i][1], 0),
  );
function contains(ring: number[][], point: number[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}
/** Esri rings may describe several exteriors. GeoJSON requires separate polygons.
 * https://developers.arcgis.com/rest/services-reference/enterprise/geometry-objects/
 * Only propose a regrouping: editor acceptance uses the normal undo/save transaction.
 */
export function repairArcGisParts(feature: Feature): MultiPolygon | undefined {
  if (
    feature.properties?.source !== 'arcgis' ||
    feature.geometry.type !== 'Polygon' ||
    feature.geometry.coordinates.length < 2
  )
    return;
  const rings = feature.geometry.coordinates;
  const ordered = rings
    .map((ring, index) => ({ ring, index, area: area(ring) }))
    .sort((a, b) => b.area - a.area);
  const polygons: Polygon['coordinates'][] = [];
  for (const { ring } of ordered) {
    const parent = polygons
      .filter((p) => ring.slice(0, -1).every((point) => contains(p[0], point)))
      .sort((a, b) => area(a[0]) - area(b[0]))[0];
    if (parent) parent.push(ring);
    else polygons.push([ring]);
  }
  if (polygons.length <= 1) return;
  polygons.sort((a, b) => rings.indexOf(a[0]) - rings.indexOf(b[0]));
  return { type: 'MultiPolygon', coordinates: structuredClone(polygons) };
}
