import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { ExpressionSpecification, Map as MapInstance } from 'maplibre-gl';
import { WORLD_MIN_ZOOM } from './world-map';
export const WORLD_URL = '/world/countries-50m-v5.1.2.geojson';
export const WORLD_MAX_BYTES = 3 * 1024 * 1024;
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

export function installWorldLayers(map: MapInstance, data: WorldData) {
  if (map.getSource('world')) return;
  const before = map.getLayer('published-campus-outline-fill')
    ? 'published-campus-outline-fill'
    : 'campus-fill';
  map.addSource('world-imagery', {
    type: 'raster',
    tiles: ['/world/blue-marble-200409/{z}/{x}/{y}.webp'],
    tileSize: 512,
    minzoom: 0,
    maxzoom: 4,
    attribution:
      '<a href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/">NASA Earth Observatory · September 2004</a> · palette-styled relief overview; resampled and compressed',
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
    before,
  );
  map.addLayer(
    {
      id: 'world-land',
      source: 'world',
      type: 'fill',
      maxzoom: 12,
      paint: { 'fill-opacity': [...fade] },
    },
    before,
  );
  map.addLayer(
    {
      id: 'world-imagery',
      source: 'world-imagery',
      type: 'raster',
      maxzoom: 8,
      paint: {
        // The campus palette leads; imagery supplies only quiet surface relief.
        'raster-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.28, 8, 0],
        'raster-saturation': -0.55,
        'raster-contrast': -0.4,
        'raster-brightness-min': 0.12,
        'raster-brightness-max': 0.92,
        'raster-fade-duration': 0,
      },
    },
    before,
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
        before,
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
        before,
      );
  }
  map.setSky?.({
    'sky-color': '#c7dff4',
    'horizon-color': '#d8e8f2',
    'fog-color': '#d8e8f2',
    'sky-horizon-blend': 0.5,
    'horizon-fog-blend': 0.5,
    'fog-ground-blend': 0,
    'atmosphere-blend': [
      'interpolate',
      ['linear'],
      ['zoom'],
      0,
      0.55,
      5,
      0.55,
      8,
      0,
    ],
  });
  map.addLayer(
    {
      id: 'world-borders',
      source: 'world',
      type: 'line',
      maxzoom: 12,
      paint: { 'line-width': 0.7, 'line-opacity': [...fade] },
    },
    before,
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
        properties: { hemisphere },
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
        'fill-color': [
          'case',
          ['<', ['get', 'hemisphere'], 0],
          '#f8f3e8',
          '#8eacb7',
        ],
        'fill-antialias': false,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 1, 8, 0],
      },
    },
    before,
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
    before,
  );
  map.setMinZoom(WORLD_MIN_ZOOM);
}
