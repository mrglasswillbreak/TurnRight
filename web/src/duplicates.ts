import type { Feature, Geometry } from 'geojson';
import type { CampusData, MapEdit, Place, Position } from './types.js';
import { distance } from './geo.js';
import { BoundsIndex, boundsOf, nearbyBounds } from './spatial-index.js';

export type DuplicateKind = 'place' | 'building';
export interface DuplicateCandidate {
  key: string;
  kind: DuplicateKind;
  ids: [string, string];
  names: [string, string];
  reason: string;
  exact: boolean;
  distance: number;
}
const nameKey = (name: unknown) => String(name || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
function ringKey(ring: number[][]) {
  const points = ring.slice(0, -1).map(p => p.join(','));
  return [points, [...points].reverse()].flatMap(order => order.map((_, i) => [...order.slice(i), ...order.slice(0, i)].join(';'))).sort()[0] || '';
}
export function geometryKey(geometry: Geometry): string {
  if (geometry.type === 'Polygon') return JSON.stringify([ringKey(geometry.coordinates[0]), geometry.coordinates.slice(1).map(ringKey).sort()]);
  if (geometry.type === 'MultiPolygon') return JSON.stringify(geometry.coordinates.map(coordinates => geometryKey({ type: 'Polygon', coordinates })).sort());
  return JSON.stringify(geometry);
}
function buildingPoints(f: Feature): number[][] {
  const g = f.geometry;
  return g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates.flatMap(p => p[0]) : [];
}
function inside(point: number[], ring: number[][]) {
  let contained = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) contained = !contained;
  }
  return contained;
}
function intersects(a: number[], b: number[], c: number[], d: number[]) {
  const cross = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}
function footprintsOverlap(a: Feature, b: Feature) {
  const polygons = (f: Feature) => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
  for (const p of polygons(a)) for (const q of polygons(b)) {
    const contains = (point: number[], rings: number[][][]) => inside(point, rings[0]) && !rings.slice(1).some(r => inside(point, r));
    if (p[0].some(v => contains(v, q)) || q[0].some(v => contains(v, p))) return true;
    for (let i = 1; i < p[0].length; i++) for (let j = 1; j < q[0].length; j++)
      if (intersects(p[0][i - 1], p[0][i], q[0][j - 1], q[0][j])) return true;
  }
  return false;
}
function exactAttributes(value: Record<string, unknown>, excluded: string[]) {
  return JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key]) => !excluded.includes(key)).sort(([a], [b]) => a.localeCompare(b))));
}
function entranceSignature(data: CampusData, kind: DuplicateKind, id: string) {
  return JSON.stringify((data.entrances || []).filter(e => kind === 'place' ? e.placeId === id : e.buildingId === id)
    .map(e => exactAttributes({ ...e }, ['id', 'source', kind === 'place' ? 'placeId' : 'buildingId'])).sort());
}
function associationSignature(data: CampusData, kind: DuplicateKind, id: string) {
  return JSON.stringify((kind === 'place'
    ? data.map.features.filter(f => f.properties?.kind === 'building' && (f.properties?.placeId === id || f.properties?.id === id || data.places.find(p => p.id === id)?.buildingId === f.properties?.id)).map(f => String(f.properties?.id))
    : data.places.filter(p => p.id === id || p.buildingId === id || data.map.features.find(f => f.properties?.kind === 'building' && f.properties.id === id)?.properties?.placeId === p.id).map(p => p.id)).sort());
}
export function findDuplicateCandidates(data: CampusData, edits: MapEdit[] = []): DuplicateCandidate[] {
  const candidates = new Map<string, DuplicateCandidate>();
  const keep = new Set(edits.flatMap(e => !e.deleted ? (e.properties.duplicateKeepSeparate || []).map(other => `${e.kind}:${[e.id, other].sort().join('|')}`) : []));
  const add = (candidate: Omit<DuplicateCandidate, 'key'>) => {
    const key = `${candidate.kind}:${[...candidate.ids].sort().join('|')}`;
    if (!keep.has(key)) candidates.set(key, { ...candidate, key });
  };
  const placeIndex = new BoundsIndex<Place>();
  const names = new Map<string, Place[]>();
  for (const place of data.places) {
    const matching = new Set([...(names.get(nameKey(place.name)) || []), ...placeIndex.query(nearbyBounds(place.coordinates, 35))]);
    for (const other of matching) {
      const sameName = !!nameKey(place.name) && nameKey(place.name) === nameKey(other.name);
      const words = (s: string) => s.toLowerCase().split(/\W+/).filter(w => w.length >= 4 && w !== 'lasu');
      const nearbyMatch = distance(place.coordinates, other.coordinates) <= 35 && words(place.name).some(w => words(other.name).includes(w));
      if (!sameName && !nearbyMatch) continue;
      const excluded = ['id', 'source', 'sourceId', 'sourceRefs'];
      const exact = exactAttributes({ ...place }, excluded) === exactAttributes({ ...other }, excluded)
        && entranceSignature(data, 'place', place.id) === entranceSignature(data, 'place', other.id)
        && associationSignature(data, 'place', place.id) === associationSignature(data, 'place', other.id);
      add({ kind: 'place', ids: [other.id, place.id], names: [other.name, place.name], exact,
        reason: exact ? 'Identical place and connections' : sameName ? 'Repeated place name' : 'Nearby similar names', distance: distance(place.coordinates, other.coordinates) });
    }
    placeIndex.add(boundsOf([place.coordinates]), place);
    const key = nameKey(place.name);
    names.set(key, [...(names.get(key) || []), place]);
  }
  const buildings = new BoundsIndex<Feature>();
  for (const feature of data.map.features.filter(f => f.properties?.kind === 'building')) {
    const points = buildingPoints(feature);
    if (!points.length) continue;
    const bounds = boundsOf(points);
    for (const other of buildings.query(bounds)) {
      const sameGeometry = geometryKey(feature.geometry) === geometryKey(other.geometry);
      if (!sameGeometry && !footprintsOverlap(feature, other)) continue;
      const a = String(other.properties?.id || other.id), b = String(feature.properties?.id || feature.id);
      const excluded = ['id', 'source', 'sourceId', 'sourceRefs', 'duplicateKeepSeparate'];
      const exact = sameGeometry && exactAttributes(feature.properties || {}, excluded) === exactAttributes(other.properties || {}, excluded)
        && entranceSignature(data, 'building', a) === entranceSignature(data, 'building', b)
        && associationSignature(data, 'building', a) === associationSignature(data, 'building', b);
      add({ kind: 'building', ids: [a, b], names: [String(other.properties?.name || 'Unnamed building'), String(feature.properties?.name || 'Unnamed building')],
        reason: exact ? 'Identical footprint and attributes' : 'Overlapping building footprints', exact,
        distance: distance(points[0] as Position, buildingPoints(other)[0] as Position) });
    }
    buildings.add(bounds, feature);
  }
  return [...candidates.values()].sort((a, b) => Number(b.exact) - Number(a.exact) || a.distance - b.distance || a.key.localeCompare(b.key));
}
function editable(data: CampusData, edits: MapEdit[], kind: DuplicateKind, id: string): MapEdit {
  const saved = edits.find(e => e.kind === kind && e.id === id && !e.deleted);
  if (saved && !saved.properties.duplicateReviewOnly) return structuredClone(saved);
  if (kind === 'place') {
    const p = data.places.find(p => p.id === id);
    if (!p) throw new Error('This place changed. Refresh duplicate review.');
    return { id, kind, geometry: { type: 'Point', coordinates: p.coordinates }, properties: { ...p, aliases: p.aliases.join(', '), duplicateKeepSeparate: saved?.properties.duplicateKeepSeparate } };
  }
  const f = data.map.features.find(f => f.properties?.kind === kind && f.properties.id === id);
  if (!f) throw new Error('This building changed. Refresh duplicate review.');
  return { id, kind, geometry: structuredClone(f.geometry), properties: { ...f.properties, name: String(f.properties?.name || 'Unnamed building'), duplicateKeepSeparate: saved?.properties.duplicateKeepSeparate } };
}
export function duplicateDecision(data: CampusData, edits: MapEdit[], candidate: DuplicateCandidate, survivor?: string): MapEdit[] {
  const [a, b] = candidate.ids.map(id => editable(data, edits, candidate.kind, id));
  if (!survivor) return [a, b].map((e, i) => {
    const saved = edits.find(previous => previous.id === e.id && previous.kind === e.kind && !previous.deleted);
    return { ...e, properties: { ...e.properties, duplicateReviewOnly: !saved || !!saved.properties.duplicateReviewOnly, duplicateKeepSeparate: [...new Set([...(e.properties.duplicateKeepSeparate || []), candidate.ids[1 - i]])] } };
  });
  if (!candidate.ids.includes(survivor)) throw new Error('Choose one of these records to keep.');
  const keep = survivor === a.id ? a : b, remove = survivor === a.id ? b : a;
  const aliases = [...new Set([String(remove.properties.name || ''), ...String(keep.properties.aliases || '').split(','), ...String(remove.properties.aliases || '').split(',')].map(s => s.trim()).filter(s => s && s !== keep.properties.name))];
  const refs = (edit: MapEdit) => [edit.id, String(edit.properties.sourceId || edit.id), ...(Array.isArray(edit.properties.sourceRefs) ? edit.properties.sourceRefs as string[] : [])];
  return [
    { ...keep, properties: { ...keep.properties, aliases: aliases.join(', '), sourceRefs: [...new Set([...refs(keep), ...refs(remove)])] } },
    { ...remove, deleted: true, properties: { ...remove.properties, mergedInto: keep.id } },
  ];
}
export function exactDuplicateEdits(data: CampusData, edits: MapEdit[], candidates: DuplicateCandidate[]) {
  // Undo is a review decision too; refreshing sources must not silently redo it.
  const undone = new Set(edits.filter(e => e.deleted && e.properties.revertToSource && e.properties.mergedInto)
    .flatMap(e => [`${e.kind}:${e.id}`, `${e.kind}:${e.properties.mergedInto}`]));
  const parents = new Map<string, string>();
  const root = (id: string): string => parents.has(id) ? root(parents.get(id)!) : id;
  const batch = new Map<string, MapEdit>();
  const current = new Map(edits.map(e => [`${e.kind}:${e.id}`, e]));
  for (const candidate of candidates.filter(c => c.exact && !c.ids.some(id => undone.has(`${c.kind}:${id}`))).sort((a, b) => a.key.localeCompare(b.key))) {
    const ids = candidate.ids.map(id => root(`${candidate.kind}:${id}`));
    if (ids[0] === ids[1]) continue;
    const [keep, remove] = ids.sort();
    const plain = (key: string) => key.slice(candidate.kind.length + 1);
    for (const edit of duplicateDecision(data, [...current.values()], { ...candidate, ids: [plain(keep), plain(remove)] }, plain(keep))) {
      const key = `${edit.kind}:${edit.id}`;
      batch.set(key, edit);
      current.set(key, edit);
    }
    parents.set(remove, keep);
  }
  return [...batch.values()];
}
