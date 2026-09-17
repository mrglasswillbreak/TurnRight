import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type {
  ExpressionSpecification,
  Map as MapInstance,
  ProjectionSpecification,
} from 'maplibre-gl';
import type { CampusData } from './types';
import { publicMapPadding } from './public-map-layout';

export const CAMPUS_MIN_ZOOM = 12;
export const WORLD_MIN_ZOOM = -2;
export const WORLD_URL = '/world/countries-v5.1.2.geojson';
export const WORLD_MAX_BYTES = 500 * 1024;
export const WORLD_PROJECTION: ProjectionSpecification = {
  type: [
    'interpolate',
    ['linear'],
    ['zoom'],
    11,
    'vertical-perspective',
    12,
    'mercator',
  ],
};
export interface CountryLabel {
  name: string;
  labelRank: number;
  labelX: number;
  labelY: number;
}
export type WorldData = FeatureCollection<Polygon | MultiPolygon, CountryLabel>;

export function validWorldData(value: unknown): value is WorldData {
  if (!value || typeof value !== 'object') return false;
  const data = value as WorldData;
  return (
    data.type === 'FeatureCollection' &&
    Array.isArray(data.features) &&
    data.features.length > 0 &&
    data.features.every((feature) => {
      const p = feature?.properties,
        g = feature?.geometry;
      if (
        feature?.type !== 'Feature' ||
        !p ||
        typeof p.name !== 'string' ||
        !p.name ||
        !Number.isFinite(p.labelRank) ||
        !Number.isFinite(p.labelX) ||
        !Number.isFinite(p.labelY) ||
        Math.abs(p.labelX) > 180 ||
        Math.abs(p.labelY) > 90 ||
        !g ||
        !['Polygon', 'MultiPolygon'].includes(g.type) ||
        !Array.isArray(g.coordinates)
      )
        return false;
      const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      return (
        polygons.length > 0 &&
        polygons.every(
          (polygon) =>
            Array.isArray(polygon) &&
            polygon.length > 0 &&
            polygon.every(
              (ring) =>
                Array.isArray(ring) &&
                ring.length >= 4 &&
                ring.every(
                  (point) =>
                    Array.isArray(point) &&
                    point.length >= 2 &&
                    Number.isFinite(point[0]) &&
                    Number.isFinite(point[1]) &&
                    Math.abs(point[0]) <= 180 &&
                    Math.abs(point[1]) <= 90,
                ) &&
                ring[0][0] === ring.at(-1)![0] &&
                ring[0][1] === ring.at(-1)![1],
            ),
        )
      );
    })
  );
}

export async function loadWorld(signal: AbortSignal): Promise<WorldData> {
  const response = await fetch(WORLD_URL, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  if (!response.ok) throw new Error('World map unavailable');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > WORLD_MAX_BYTES)
    throw new Error('World map is too large');
  const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!validWorldData(data)) throw new Error('Invalid world map');
  return data;
}

export function returnToCampus(map: MapInstance, bounds: CampusData['bounds']) {
  map.setPadding(publicMapPadding(map.getContainer()));
  map.fitBounds(bounds, {
    // cameraForBounds already subtracts the map's persistent panel padding.
    padding: 20,
    maxZoom: 17,
    duration: 1100,
  });
}

export function installWorldLayers(
  map: MapInstance,
  data: WorldData,
  bounds: CampusData['bounds'],
) {
  if (map.getSource('world')) return;
  map.addSource('world', {
    type: 'geojson',
    data,
    attribution:
      'Made with <a href="https://www.naturalearthdata.com/">Natural Earth</a>',
  });
  map.addSource('world-labels', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: data.features.map(({ properties }) => ({
        type: 'Feature',
        properties,
        geometry: {
          type: 'Point',
          coordinates: [properties.labelX, properties.labelY],
        },
      })),
    },
  });
  map.addSource('world-campus', {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Point',
        coordinates: [
          (bounds[0][0] + bounds[1][0]) / 2,
          (bounds[0][1] + bounds[1][1]) / 2,
        ],
      },
    },
  });
  const fade: ExpressionSpecification = [
    'interpolate',
    ['linear'],
    ['zoom'],
    10,
    1,
    12,
    0,
  ];
  // Keep the campus theme's background intact; the ocean covers it only at world scale.
  map.addLayer(
    {
      id: 'world-ocean',
      type: 'background',
      maxzoom: 12,
      paint: { 'background-opacity': [...fade] },
    },
    'campus-fill',
  );
  map.addLayer(
    {
      id: 'world-land',
      source: 'world',
      type: 'fill',
      maxzoom: 12,
      paint: { 'fill-opacity': [...fade] },
    },
    'campus-fill',
  );
  map.addLayer(
    {
      id: 'world-borders',
      source: 'world',
      type: 'line',
      maxzoom: 12,
      paint: { 'line-width': 0.7, 'line-opacity': [...fade] },
    },
    'campus-fill',
  );
  map.addLayer(
    {
      id: 'world-country-labels',
      source: 'world-labels',
      type: 'symbol',
      minzoom: 0,
      maxzoom: 9,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Semibold'],
        'text-size': 11,
        'text-max-width': 8,
        'text-padding': 10,
        'symbol-sort-key': ['get', 'labelRank'],
      },
      paint: { 'text-halo-width': 1.5 },
    },
    'campus-fill',
  );
  map.addLayer({
    id: 'world-campus-dot',
    source: 'world-campus',
    type: 'circle',
    maxzoom: 12,
    paint: {
      'circle-color': '#1764ed',
      'circle-radius': 6,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  });
  map.addLayer({
    id: 'world-campus-label',
    source: 'world-campus',
    type: 'symbol',
    maxzoom: 12,
    layout: {
      'text-field': 'LASU Ojo',
      'text-font': ['Open Sans Semibold'],
      'text-size': 13,
      'text-anchor': 'top',
      'text-offset': [0, 1],
      'text-allow-overlap': true,
    },
    paint: { 'text-halo-width': 2 },
  });
  map.setMinZoom(WORLD_MIN_ZOOM);
  for (const layer of ['world-campus-dot', 'world-campus-label']) {
    map.on('mouseenter', layer, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layer, () => {
      map.getCanvas().style.cursor = '';
    });
  }
}

export function followZoom(
  current: number,
  hadPosition: boolean,
  beganFollowing: boolean,
  recovering = false,
) {
  return !hadPosition ||
    (beganFollowing && current < CAMPUS_MIN_ZOOM) ||
    (recovering && current < 17.99)
    ? 18
    : undefined;
}
