import type { Feature, FeatureCollection, Position } from 'geojson';
import { BoundsIndex, boundsOf } from './spatial-index.js';
import { landClass } from './map-classification.js';

type Polygon = Position[][];
const cross = (a: Position, b: Position) => a[0] * b[1] - a[1] * b[0];
function inside(point: Position, ring: Position[]) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}
const inPolygon = (p: Position, polygon: Polygon) => inside(p, polygon[0]) && !polygon.slice(1).some(r => inside(p, r));
const cache = new WeakMap<FeatureCollection, FeatureCollection>();

/** Clip presentation linework only. Paths, identities and the routing graph stay intact. */
export function exposedRoads(map: FeatureCollection): FeatureCollection {
  const known = cache.get(map);
  if (known) return known;
  const polygons = new BoundsIndex<Polygon>();
  for (const f of map.features) {
    if (f.properties?.kind !== 'land' || f.properties.visible === false || !['road', 'sidewalk', 'parking'].includes(landClass(f.properties))) continue;
    const parts = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    for (const p of parts) polygons.add(boundsOf(p.flat() as [number,number][]), p);
  }
  const features: Feature[] = [];
  for (const f of map.features) {
    if (f.properties?.kind !== 'path') continue;
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
    const pieces: Position[][] = [];
    for (const line of lines) {
      let piece: Position[] = [];
      for (let i = 1; i < line.length; i++) {
        const a = line[i-1], b = line[i], delta = [b[0]-a[0], b[1]-a[1]];
        const nearby = polygons.query(boundsOf([a,b] as [number,number][]));
        const cuts = [0,1];
        for (const p of nearby) for (const ring of p) for (let j = 1; j < ring.length; j++) {
          const c = ring[j-1], d = ring[j], edge = [d[0]-c[0],d[1]-c[1]], offset = [c[0]-a[0],c[1]-a[1]];
          const denominator = cross(delta,edge);
          if (Math.abs(denominator) < 1e-22) continue;
          const t = cross(offset,edge)/denominator, u = cross(offset,delta)/denominator;
          if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
        }
        cuts.sort((x,y) => x-y);
        const at = (t: number) => [a[0]+delta[0]*t,a[1]+delta[1]*t];
        for (let j = 1; j < cuts.length; j++) {
          if (cuts[j]-cuts[j-1] < 1e-10) continue;
          if (nearby.some(p => inPolygon(at((cuts[j]+cuts[j-1])/2),p))) {
            if (piece.length > 1) pieces.push(piece);
            piece = [];
          } else {
            if (!piece.length) piece.push(at(cuts[j-1]));
            piece.push(at(cuts[j]));
          }
        }
      }
      if (piece.length > 1) pieces.push(piece);
    }
    if (pieces.length) features.push({...f,geometry:pieces.length===1 ? {type:'LineString',coordinates:pieces[0]} : {type:'MultiLineString',coordinates:pieces}});
  }
  const result: FeatureCollection = {type:'FeatureCollection',features};
  cache.set(map,result);
  return result;
}
