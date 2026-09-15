import type { ExpressionSpecification, Map as MapInstance } from 'maplibre-gl';
import { campusPalette } from './map-palette';

const width = (pad: number): ExpressionSpecification => [
  'interpolate',
  ['linear'],
  ['zoom'],
  14,
  [
    'match',
    ['get', 'pathClass'],
    'street',
    2.5 + pad,
    'service',
    2 + pad,
    'parking',
    1.2 + pad,
    1 + pad,
  ],
  18,
  [
    'match',
    ['get', 'pathClass'],
    'street',
    12 + pad,
    'service',
    9 + pad,
    'parking',
    5 + pad,
    3 + pad,
  ],
  20,
  [
    'match',
    ['get', 'pathClass'],
    'street',
    30 + pad,
    'service',
    24 + pad,
    'parking',
    13 + pad,
    7 + pad,
  ],
];

/** One paint definition for initial loading, theme changes and late editor layers. */
export function mapTheme(dark: boolean) {
  const p = campusPalette[dark ? 'dark' : 'light'];
  const label = {
    'text-color': p.label,
    'text-halo-color': p.halo,
    'text-halo-width': 1.8,
  };
  return {
    background: { 'background-color': p.ground },
    'campus-fill': { 'fill-color': p.campus },
    land: {
      'fill-color': [
        'match',
        ['get', 'landClass'],
        'water',
        p.water,
        'wetland',
        p.wetland,
        'green',
        p.green,
        'bare',
        p.bare,
        p.land,
      ],
      'fill-opacity': dark ? 1 : 0.65,
    },
    'boundary-line': {
      'line-color': p.boundary,
      'line-opacity': dark ? 0.3 : 0.7,
    },
    'roads-case': {
      'line-color': p.roadEdge,
      'line-width': width(1.5),
    },
    roads: {
      'line-color': [
        'case',
        ['get', 'unpaved'],
        p.unpaved,
        ['==', ['get', 'pathClass'], 'footway'],
        p.path,
        p.road,
      ],
      'line-width': width(0),
    },
    'building-contact': {
      'fill-color': p.contact,
      'fill-opacity': dark ? 0.24 : 0.13,
    },
    buildings: {
      'fill-color': ['get', dark ? 'displayRoofDark' : 'displayRoof'],
      'fill-outline-color': p.outline,
    },
    'buildings-3d': {
      'fill-extrusion-color': ['get', dark ? 'displayWallDark' : 'displayWall'],
    },
    'building-roofs': {
      'fill-extrusion-color': ['get', dark ? 'displayRoofDark' : 'displayRoof'],
    },
    'building-outlines': {
      'line-color': p.outline,
      'line-opacity': dark ? 0.35 : 0.7,
    },
    barriers: { 'line-color': p.barrier },
    'places-dot': {
      'circle-color': [
        'coalesce',
        ['get', dark ? 'nightColor' : 'color'],
        ['get', 'color'],
      ],
      'circle-stroke-color': p.halo,
    },
    'places-label': label,
    'places-label-detail': label,
    'places-label-selected': label,
    'street-labels': {
      ...label,
      'text-color': p.streetLabel,
      'text-halo-width': 1.4,
    },
    'route-end-labels': {
      ...label,
      'text-color': p.route,
      'text-halo-width': 2,
    },
    'routes-case': { 'line-color': p.routeCase },
    'routes-line': {
      'line-color': ['case', ['get', 'active'], p.route, p.routeAlternative],
    },
    'editor-entrance-label': label,
    'editor-network': { 'line-color': p.selection },
    'editor-target': { 'circle-stroke-color': p.selection },
  } as const;
}

export function applyMapTheme(map: MapInstance, dark: boolean) {
  for (const [layer, paint] of Object.entries(mapTheme(dark)))
    if (map.getLayer(layer))
      for (const [property, value] of Object.entries(paint))
        map.setPaintProperty(layer, property as Parameters<MapInstance['setPaintProperty']>[1], value);
  map.setLight({
    color: dark ? '#c3d4e8' : '#ffffff',
    intensity: dark ? 0.3 : 0.45,
  });
}
