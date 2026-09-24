import { buildingPhotos, canonicalBuildingId } from './arrival';
import { featureEdit } from './editor-features';
import type { CampusData, CampusPhoto, MapEdit } from './types';

export interface PhotoChange {
  photos: CampusPhoto[];
  removeIds: string[];
  replaces?: Record<string, string>;
}
const targetKey = (p: CampusPhoto) =>
  p.entranceId ? `entrance:${p.entranceId}` : `building:${p.buildingId}`;
/** One transaction preserves unrelated building properties, order and guide references. */
export function photoEdits(
  data: CampusData,
  edits: MapEdit[],
  change: PhotoChange,
): MapEdit[] {
  const normalized = change.photos.map((p) => ({
    ...p,
    buildingId: canonicalBuildingId(data, p.buildingId),
  }));
  const affected = new Set([
    ...change.removeIds,
    ...normalized.map((p) => p.id),
  ]);
  const before = (data.photos || []).filter((p) => affected.has(p.id));
  const targets = new Map(
    [...before, ...normalized].map((p) => [targetKey(p), p]),
  );
  const result: MapEdit[] = [];
  for (const p of targets.values()) {
    const kind = p.entranceId ? 'entrance' : 'building';
    const id = p.entranceId || p.buildingId;
    const edit = featureEdit(data, kind, id, edits);
    if (!edit || edit.deleted)
      throw Error('The selected building or entrance is no longer available.');
    const old = buildingPhotos(data, p.buildingId, p.entranceId);
    // Replacements keep their original positions. Explicit reorder operations pass the whole gallery.
    const incoming = normalized.filter((n) => targetKey(n) === targetKey(p));
    const allReordered =
      old.length > 0 && old.every((o) => incoming.some((n) => n.id === o.id));
    const photos = allReordered
      ? incoming
      : old
          .flatMap((o) => {
            const replacement = incoming.find(
              (n) => n.id === o.id || change.replaces?.[o.id] === n.id,
            );
            return replacement ? [replacement] : affected.has(o.id) ? [] : [o];
          })
          .concat(
            incoming.filter(
              (n) =>
                !old.some(
                  (o) => o.id === n.id || change.replaces?.[o.id] === n.id,
                ),
            ),
          );
    result.push({
      ...edit,
      properties: {
        ...edit.properties,
        photos,
      },
    });
  }
  // Entrance-owned photographs can also support their parent building's model.
  // Keep the evidence invalidation in the same transaction as gallery changes.
  for (const buildingId of new Set(
    [...before, ...normalized].map((p) => p.buildingId),
  )) {
    const index = result.findIndex(
      (e) => e.kind === 'building' && e.id === buildingId,
    );
    const edit =
      index >= 0
        ? result[index]
        : featureEdit(data, 'building', buildingId, edits);
    if (!edit?.properties.appearance?.facades || edit.deleted) continue;
    const appearance = structuredClone(edit.properties.appearance);
    let changed = false;
    for (const facade of Object.values(appearance.facades!)) {
      if (
        facade.photoIds.some(
          (id) =>
            affected.has(id) &&
            !normalized.some(
              (p) =>
                p.id === id &&
                p.buildingId === buildingId &&
                p.sha256 === data.photos?.find((old) => old.id === id)?.sha256,
            ),
        )
      ) {
        facade.needsReview = true;
        changed = true;
      }
    }
    if (!changed) continue;
    const updated = { ...edit, properties: { ...edit.properties, appearance } };
    if (index >= 0) result[index] = updated;
    else result.push(updated);
  }
  // A moved/deleted photograph cannot remain a guide reference for its previous destination.
  for (const entity of [...data.places, ...(data.entrances || [])]) {
    const ids = entity.arrival?.photoIds;
    if (!ids?.some((id) => affected.has(id))) continue;
    const valid = ids.filter((id) => {
      if (!affected.has(id)) return true;
      const p = normalized.find((p) => p.id === (change.replaces?.[id] || id));
      const b =
        entity.buildingId ||
        data.places.find((v) => 'placeId' in entity && v.id === entity.placeId)
          ?.buildingId ||
        entity.id;
      return (
        p &&
        canonicalBuildingId(data, b) === p.buildingId &&
        (!p.entranceId || p.entranceId === entity.id)
      );
    });
    const nextIds = valid.map((id) => change.replaces?.[id] || id);
    if (JSON.stringify(nextIds) === JSON.stringify(ids)) continue;
    const kind = 'placeId' in entity ? 'entrance' : 'place';
    const index = result.findIndex(
      (e) => e.kind === kind && e.id === entity.id,
    );
    const edit =
      index >= 0 ? result[index] : featureEdit(data, kind, entity.id, edits);
    if (edit) {
      const next = {
        ...edit,
        properties: {
          ...edit.properties,
          arrival: { ...entity.arrival, photoIds: nextIds },
        },
      };
      if (index >= 0) result[index] = next;
      else result.push(next);
    }
  }
  return result;
}
