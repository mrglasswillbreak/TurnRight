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
export const WORLD_URL = '/world/countries-50m-v5.1.2.geojson';
export const WORLD_MAX_BYTES = 3 * 1024 * 1024;
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
export type WorldData = FeatureCollection<
  Polygon | MultiPolygon,
  CountryLabel
> & {
  lakes?: FeatureCollection;
  cities?: FeatureCollection;
};

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
  await Promise.all(
    ['lakes', 'cities'].map(async (kind) => {
      try {
        const response = await fetch(`/world/${kind}-50m-v5.1.2.geojson`, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        });
        if (!response.ok) return;
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > WORLD_MAX_BYTES) return;
        const extra = JSON.parse(
          new TextDecoder().decode(bytes),
        ) as FeatureCollection;
        if (
          extra.type !== 'FeatureCollection' ||
          !Array.isArray(extra.features) ||
          extra.features.length > 10000
        )
          return;
        if (
          !extra.features.every(
            (f) =>
              f.type === 'Feature' &&
              !!f.geometry &&
              (kind === 'cities'
                ? f.geometry.type === 'Point' &&
                  typeof f.properties?.name === 'string' &&
                  Number.isFinite(f.properties?.labelRank)
                : ['Polygon', 'MultiPolygon'].includes(f.geometry.type)),
          )
        )
          return;
        if (kind === 'lakes') data.lakes = extra;
        else data.cities = extra;
      } catch {
        /* The verified vector overview remains useful without optional layers. */
      }
    }),
  );
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
  map.addSource('world-imagery', {
    type: 'raster',
    tiles: ['/world/blue-marble-200409/{z}/{x}/{y}.webp'],
    tileSize: 512,
    minzoom: 0,
    maxzoom: 4,
    attribution:
      '<a href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/">NASA Earth Observatory · September 2004</a> · shaded relief overview; resampled and compressed',
  });
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
      id: 'world-imagery',
      source: 'world-imagery',
      type: 'raster',
      maxzoom: 8,
      paint: {
        'raster-opacity': ['interpolate', ['linear'], ['zoom'], 5, 1, 8, 0],
        'raster-fade-duration': 0,
      },
    },
    'campus-fill',
  );
  for (const kind of ['lakes', 'cities'] as const) {
    if (!data[kind]) continue;
    map.addSource(`world-${kind}`, { type: 'geojson', data: data[kind]! });
    if (kind === 'lakes')
      map.addLayer(
        {
          id: 'world-lakes',
          type: 'fill',
          source: 'world-lakes',
          minzoom: 5,
          maxzoom: 12,
          paint: { 'fill-color': '#527d96', 'fill-opacity': fade },
        },
        'campus-fill',
      );
    else
      map.addLayer(
        {
          id: 'world-cities',
          type: 'symbol',
          source: 'world-cities',
          minzoom: 3,
          maxzoom: 10,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Semibold'],
            'text-size': 11,
            'text-padding': 8,
            'symbol-sort-key': ['get', 'labelRank'],
          },
          paint: {
            'text-color': '#1d3345',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
          },
        },
        'campus-fill',
      );
  }
  map.setSky?.({
    'sky-color': '#c7dff4',
    'horizon-color': '#d8e8f2',
    'fog-color': '#d8e8f2',
    'sky-horizon-blend': 0.5,
    'horizon-fog-blend': 0.5,
    'fog-ground-blend': 0,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 8, 0],
  });
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
  // Mercator imagery stops at ~85°. MapLibre extends its last texel row to
  // each pole, which otherwise turns Antarctica into a radial starburst.
  // These deliberately plain caps describe no additional photographic detail.
  map.addSource('world-polar-caps', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [-1, 1].map((hemisphere) => ({
        type: 'Feature',
        properties: { colour: hemisphere < 0 ? '#edf2f3' : '#070d21' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-180, hemisphere * 90],
              [-180, hemisphere * 85],
              [-90, hemisphere * 85],
              [0, hemisphere * 85],
              [90, hemisphere * 85],
              [180, hemisphere * 85],
              [180, hemisphere * 90],
              [-180, hemisphere * 90],
            ],
          ],
        },
      })),
    },
  });
  map.addLayer(
    {
      id: 'world-polar-caps',
      source: 'world-polar-caps',
      type: 'fill',
      maxzoom: 8,
      paint: {
        'fill-color': ['get', 'colour'],
        'fill-antialias': false,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 1, 8, 0],
      },
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
