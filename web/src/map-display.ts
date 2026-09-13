import type { Feature, FeatureCollection } from 'geojson';
import { appearanceColours } from './map-palette.js';
import type { CampusData, GraphEdge, Place } from './types.js';

export type BuildingDisplay = {
  metres: number;
  kind: 'recorded' | 'floor-derived' | 'illustrative';
  description: string;
};
export function buildingDisplay(
  properties: Record<string, unknown> = {},
): BuildingDisplay {
  const height = Number(properties.height);
  if (Number.isFinite(height) && height > 0) {
    const estimated =
      properties.heightEstimated === true || properties.heightMode === 'floors';
    return {
      metres: height,
      kind: estimated ? 'floor-derived' : 'recorded',
      description: estimated
        ? `Approximately ${height} m · derived from floors`
        : `${height} m · recorded height`,
    };
  }
  const floors = Number(properties.floors);
  if (Number.isInteger(floors) && floors > 0 && floors <= 50)
    return {
      metres: floors * 3,
      kind: 'floor-derived',
      description: `Approximately ${floors * 3} m · ${floors} documented floors`,
    };
  return {
    metres: 6,
    kind: 'illustrative',
    description: 'Height unknown · illustrative 6 m block',
  };
}
/** Display properties are never written back to campus or correction records. */
export function displayGeometry(map: FeatureCollection): FeatureCollection {
  return {
    ...map,
    features: map.features.map((feature) => {
      if (feature.properties?.kind !== 'building') return feature;
      const height = buildingDisplay(feature.properties);
      const colours = appearanceColours(feature.properties || {});
      return {
        ...feature,
        properties: {
          ...feature.properties,
          displayHeight: height.metres,
          heightKind: height.kind,
          displayWall: colours.wall,
          displayRoof: colours.roof,
        },
      };
    }),
  };
}
export function buildingPlace(
  data: CampusData,
  building: Feature,
): Place | undefined {
  const id = String(building.properties?.id ?? building.id ?? '');
  const placeId = resolvePlaceId(
    data,
    String(building.properties?.placeId || ''),
  );
  const canonicalBuilding = resolvePlaceId(
    { placeIdAliases: data.buildingIdAliases },
    id,
  );
  return (
    data.places.find((p) => p.id === placeId) ||
    data.places.find(
      (p) =>
        p.buildingId &&
        resolvePlaceId(
          { placeIdAliases: data.buildingIdAliases },
          p.buildingId,
        ) === canonicalBuilding,
    ) ||
    data.places.find((p) => p.id === resolvePlaceId(data, id))
  );
}
export function resolvePlaceId(
  data: Pick<CampusData, 'placeIdAliases'>,
  id: string,
): string {
  const seen = new Set<string>();
  while (Object.hasOwn(data.placeIdAliases || {}, id) && !seen.has(id)) {
    seen.add(id);
    id = data.placeIdAliases![id];
  }
  return id;
}
export function resolvePlaceIds(data: CampusData, ids: string[]) {
  return [...new Set(ids.map((id) => resolvePlaceId(data, id)))];
}
/** Visual deduplication only: directed routing edges remain intact. */
export function visualEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = [edge.from, edge.to].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
