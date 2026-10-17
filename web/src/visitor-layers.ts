import { useEffect, useRef, useState } from 'react';
import { getPreference, setPreference } from './offline';
import type { CampusData } from './types';
export const VISITOR_GROUPS = [
  'buildings',
  'greenery',
  'surfaces',
  'amenities',
  'landmarks',
] as const;
export type VisitorGroup = (typeof VISITOR_GROUPS)[number];
export type VisitorLayers = Record<VisitorGroup, boolean>;
export const ALL_VISITOR_LAYERS: VisitorLayers = {
  buildings: true,
  greenery: true,
  surfaces: true,
  amenities: true,
  landmarks: true,
};
export function validVisitorLayers(value: unknown): VisitorLayers {
  const record =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    VISITOR_GROUPS.map((key) => [
      key,
      typeof record[key] === 'boolean' ? record[key] : true,
    ]),
  ) as VisitorLayers;
}
export function useVisitorLayers(campus: string) {
  const [state, setState] = useState({ campus, value: ALL_VISITOR_LAYERS });
  const writes = useRef(0);
  useEffect(() => {
    let cancelled = false;
    const version = writes.current;
    void getPreference<unknown>('visitor-layers', ALL_VISITOR_LAYERS, campus)
      .then((value) => {
        if (!cancelled && writes.current === version)
          setState({ campus, value: validVisitorLayers(value) });
      })
      .catch(() => {
        if (!cancelled && writes.current === version)
          setState({ campus, value: ALL_VISITOR_LAYERS });
      });
    return () => {
      cancelled = true;
    };
  }, [campus]);
  return [
    state.campus === campus ? state.value : ALL_VISITOR_LAYERS,
    (value: VisitorLayers) => {
      writes.current++;
      setState({ campus, value });
      void setPreference('visitor-layers', value, campus).catch(() => {});
    },
  ] as const;
}
/** Presentation only. Navigation continues to read the complete campus in App. */
export function visitorPresentation(
  data: CampusData,
  layers: VisitorLayers,
  selectedId?: string,
): CampusData {
  if (VISITOR_GROUPS.every((key) => layers[key])) return data;
  return {
    ...data,
    map: {
      ...data.map,
      features: data.map.features.filter((f) => {
        const p = f.properties || {};
        if (VISITOR_GROUPS.includes(p.visitorLayer))
          return layers[p.visitorLayer as VisitorGroup];
        if (p.kind === 'building') return layers.buildings;
        if (
          p.kind === 'land' &&
          (['green', 'wetland'].includes(p.landClass) ||
            p.name === 'Green Area')
        )
          return layers.greenery;
        if (
          p.kind === 'land' &&
          ['road', 'sidewalk', 'parking', 'sports'].includes(p.landClass)
        )
          return layers.surfaces;
        if (p.kind === 'overlay' && f.geometry.type === 'Point')
          return layers.amenities;
        return true;
      }),
    },
    places: data.places.filter(
      (p) =>
        p.id === selectedId ||
        p.category === 'gate' ||
        (p.landmark ? layers.landmarks : layers.amenities),
    ),
  };
}
