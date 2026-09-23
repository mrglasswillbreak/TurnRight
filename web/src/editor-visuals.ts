import type { CampusData } from './types.js';
import { canonical } from './editor-conflicts.js';
/** Visual references may augment an approved source baseline without changing its geometry or graph. */
export function withPublishedVisuals(
  base: CampusData,
  published: CampusData,
): CampusData {
  base = {
    ...base,
    photos: base.photos ?? published.photos,
    photoOverrides: base.photoOverrides ?? published.photoOverrides,
    places: base.places.map((p) => ({
      ...p,
      arrival:
        p.arrival ?? published.places.find((v) => v.id === p.id)?.arrival,
    })),
    entrances: base.entrances?.map((e) => ({
      ...e,
      arrival:
        e.arrival ?? published.entrances?.find((v) => v.id === e.id)?.arrival,
    })),
  };
  if (base.visuals || !published.visuals) return base;
  const source = new Map(
    published.map.features
      .filter((f) => f.properties?.kind === 'building')
      .map((f) => [String(f.properties?.id), f]),
  );
  const compatible = new Set(
    base.map.features
      .filter(
        (f) =>
          f.properties?.kind === 'building' &&
          canonical(f.geometry) ===
            canonical(source.get(String(f.properties?.id))?.geometry),
      )
      .map((f) => String(f.properties?.id)),
  );
  return {
    ...base,
    visuals: {
      ...published.visuals,
      buildings: published.visuals.buildings.filter((b) =>
        compatible.has(b.id),
      ),
    },
  };
}
