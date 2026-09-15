import type { Feature, FeatureCollection } from 'geojson';
import { appearanceColours, nightMaterial } from './map-palette.js';
import { landClass, pathDisplay } from './map-classification.js';
import type { CampusData, GraphEdge, Place } from './types.js';
import type { VisualCatalogue } from './visual-types.js';
import { compatibleVisual, visualLookup } from './building-visuals.js';

export type BuildingDisplay = {
  metres: number;
  kind: 'recorded' | 'floor-derived' | 'illustrative';
  description: string;
};
export function buildingDisplay(
  properties: Record<string, unknown> = {},
): BuildingDisplay {
  const statedFloors = Number(properties.floors);
  if (
    properties.heightMode === 'floors' &&
    Number.isInteger(statedFloors) &&
    statedFloors > 0 &&
    statedFloors <= 50
  )
    return {
      metres: statedFloors * 3,
      kind: 'floor-derived',
      description: `Approximately ${statedFloors * 3} m · ${statedFloors} documented floors`,
    };
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
export function displayGeometry(
  map: FeatureCollection,
  catalogue?: VisualCatalogue,
): FeatureCollection {
  const lookup = visualLookup(catalogue);
  return {
    ...map,
    features: map.features.flatMap((feature): Feature[] => {
      if (feature.properties?.kind === 'land')
        return [
          {
            ...feature,
            properties: {
              ...feature.properties,
              landClass: landClass(feature.properties),
            },
          },
        ];
      if (feature.properties?.kind === 'path')
        return [
          {
            ...feature,
            properties: {
              ...feature.properties,
              ...pathDisplay(feature.properties),
            },
          },
        ];
      if (feature.properties?.kind !== 'building') return [feature];
      const height = buildingDisplay(feature.properties);
      const colours = appearanceColours(feature.properties || {});
      const candidate = lookup.get(String(feature.properties?.id));
      const visual = compatibleVisual(feature, candidate)
        ? candidate
        : undefined;
      const displayed = {
        ...feature,
        properties: {
          ...feature.properties,
          displayHeight: visual?.height ?? height.metres,
          heightKind: visual?.heightKind ?? height.kind,
          displayWall: visual?.wallColour ?? colours.wall,
          displayRoof: visual?.roofColour ?? colours.roof,
          displayWallDark: nightMaterial(
            visual?.wallColour ?? colours.wall,
            'wall',
          ),
          displayRoofDark: nightMaterial(
            visual?.roofColour ?? colours.roof,
            'roof',
          ),
        },
      };
      if (visual?.partHeights && feature.geometry.type === 'MultiPolygon')
        return feature.geometry.coordinates.map((coordinates, index) => {
          const part = visual.partHeights![index];
          return {
            ...displayed,
            geometry: { type: 'Polygon', coordinates },
            properties: {
              ...displayed.properties,
              displayHeight: part?.height ?? displayed.properties.displayHeight,
              heightKind: part?.kind ?? displayed.properties.heightKind,
              ...(part?.kind === 'illustrative'
                ? {
                    displayWall: '#d4d5c3',
                    displayRoof: '#a6b19f',
                    displayWallDark: nightMaterial('#d4d5c3', 'wall'),
                    displayRoofDark: nightMaterial('#a6b19f', 'roof'),
                  }
                : {}),
            },
          };
        });
      return [displayed];
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
