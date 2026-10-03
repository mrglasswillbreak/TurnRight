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
        ? `Approximately ${height} m · estimated height`
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
      if (feature.properties?.visible === false) return [];
      feature = {
        ...feature,
        properties: {
          ...feature.properties,
          ...Object.fromEntries(
            Object.entries(feature.properties?.renderStyle || {}).map(
              ([key, value]) => [`mapStyle_${key}`, value],
            ),
          ),
        },
      };
      if (feature.properties?.kind === 'land')
        return [
          {
            ...feature,
            properties: {
              ...feature.properties,
              landClass: landClass(feature.properties),
              unpaved: /unpaved|untarred|dirt|gravel|sand/i.test(
                String(
                  feature.properties.surface || feature.properties.name || '',
                ),
              ),
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
              ...(feature.properties.mapStyle_labels === false
                ? { streetLabel: '' }
                : feature.properties.mapStyle_labelField
                  ? { streetLabel: String(feature.properties.label || '') }
                  : {}),
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
// Campus snapshots are immutable; collect associations once, preserving first-match
// ordering and explicit place links before building and historical-ID fallbacks.
const associations = new WeakMap<
  CampusData,
  { places: Map<string, Place>; buildings: Map<string, Place> }
>();
export function buildingPlace(
  data: CampusData,
  building: Feature,
): Place | undefined {
  let index = associations.get(data);
  if (!index) {
    index = { places: new Map(), buildings: new Map() };
    for (const place of data.places) {
      if (!index.places.has(place.id)) index.places.set(place.id, place);
      if (place.buildingId) {
        const key = resolvePlaceId(
          { placeIdAliases: data.buildingIdAliases },
          place.buildingId,
        );
        if (!index.buildings.has(key)) index.buildings.set(key, place);
      }
    }
    associations.set(data, index);
  }
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
    index.places.get(placeId) ||
    index.buildings.get(canonicalBuilding) ||
    index.places.get(resolvePlaceId(data, id))
  );
}
export function resolvePlaceId(
  data: Pick<CampusData, 'placeIdAliases'>,
  id: string,
): string {
  if (!data.placeIdAliases) return id;
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
