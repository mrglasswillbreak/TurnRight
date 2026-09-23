import { canonicalBuildingId } from './arrival';
import type { CampusData, CampusPhoto, Entrance } from './types';

/** Campus snapshots are immutable. Never build this inside a per-building lookup. */
const indexes = new WeakMap<CampusData, ReturnType<typeof buildIndex>>();
function buildIndex(data: CampusData) {
  const buildings = data.map.features.filter(
    (f) => f.properties?.kind === 'building',
  );
  const places = new Map(data.places.map((p) => [p.id, p]));
  const placeBuildings = new Map<string, string>();
  const names = new Map<string, string>();
  for (const b of buildings) {
    const id = canonicalBuildingId(data, String(b.properties!.id));
    for (const key of [b.properties!.id, b.properties!.placeId])
      if (key && !placeBuildings.has(String(key)))
        placeBuildings.set(String(key), id);
    if (b.properties!.name) names.set(id, String(b.properties!.name));
  }
  for (const p of data.places) {
    if (p.buildingId)
      placeBuildings.set(p.id, canonicalBuildingId(data, p.buildingId));
    const id = placeBuildings.get(p.id);
    if (id && !names.has(id)) names.set(id, p.name);
  }
  const entrances = new Map<string, Entrance[]>();
  for (const e of data.entrances || []) {
    const id = canonicalBuildingId(
      data,
      e.buildingId || placeBuildings.get(e.placeId) || '',
    );
    if (!entrances.has(id)) entrances.set(id, []);
    entrances.get(id)!.push(e);
  }
  const photos = new Map<string, CampusPhoto[]>();
  for (const p of data.photos || []) {
    const key = p.entranceId
      ? `entrance:${p.entranceId}`
      : `building:${canonicalBuildingId(data, p.buildingId)}`;
    if (!photos.has(key)) photos.set(key, []);
    photos.get(key)!.push(p);
  }
  const name = (id?: string) =>
    id
      ? names.get(canonicalBuildingId(data, id)) || 'Unnamed building'
      : 'Building not selected';
  const options = buildings.map((b) => ({
    id: String(b.properties!.id),
    label:
      name(String(b.properties!.id)) +
      (!b.properties!.name && b.geometry.type === 'Polygon'
        ? ` · near ${b.geometry.coordinates[0][0][1].toFixed(5)}, ${b.geometry.coordinates[0][0][0].toFixed(5)}`
        : ''),
  }));
  return {
    buildings,
    places,
    placeBuildings,
    name,
    options,
    entrances,
    photos,
  };
}
export function campusPhotoIndex(data: CampusData) {
  let index = indexes.get(data);
  if (!index) {
    index = buildIndex(data);
    indexes.set(data, index);
  }
  return index;
}
