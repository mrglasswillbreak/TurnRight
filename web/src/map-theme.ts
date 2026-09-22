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
    'world-ocean': { 'background-color': p.water },
    'world-land': { 'fill-color': p.land },
    'world-borders': { 'line-color': p.boundary },
    'world-country-labels': label,
    'world-campus-label': { ...label, 'text-color': p.route },
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
      'fill-outline-color': p.footprintBorder,
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
    'places-label': {
      ...label,
      'text-color': dark
        ? ['coalesce', ['get', 'nightColor'], p.label]
        : p.label,
    },
    'places-label-detail': {
      ...label,
      'text-color': dark
        ? ['coalesce', ['get', 'nightColor'], p.label]
        : p.label,
    },
    'places-label-selected': {
      ...label,
      'text-color': dark
        ? ['coalesce', ['get', 'nightColor'], p.label]
        : p.label,
    },
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
      'line-color': [
        'case',
        ['!', ['get', 'active']],
        p.routeAlternative,
        ['==', ['get', 'mode'], 'driving'],
        '#a366de',
        p.route,
      ],
    },
    'editor-entrance-label': label,
    'editor-network': { 'line-color': p.selection },
    'editor-target': { 'circle-stroke-color': p.selection },
  } as const;
}

const applied = new WeakMap<
  MapInstance,
  { dark: boolean; badges: boolean; layers: Map<string, unknown> }
>();
export function applyMapTheme(map: MapInstance, dark: boolean) {
  const badges = dark && map.hasImage('place-other');
  const previous = applied.get(map);
  const changed = !previous || previous.dark !== dark;
  const state = changed
    ? { dark, badges, layers: new Map<string, unknown>() }
    : previous;
  const updated = new Set<string>();
  for (const [layer, paint] of Object.entries(mapTheme(dark)))
    if (
      map.getLayer(layer) &&
      state.layers.get(layer) !== map.getLayer(layer)
    ) {
      state.layers.set(layer, map.getLayer(layer));
      updated.add(layer);
      for (const [property, value] of Object.entries(paint))
        map.setPaintProperty(
          layer,
          property as Parameters<MapInstance['setPaintProperty']>[1],
          value,
        );
    }
  const badgeChanged = changed || state.badges !== badges;
  if (map.getLayer('places-dot') && (badgeChanged || updated.has('places-dot')))
    map.setLayoutProperty(
      'places-dot',
      'visibility',
      badges ? 'none' : 'visible',
    );
  for (const layer of [
    'places-label',
    'places-label-detail',
    'places-label-selected',
  ]) {
    if (!map.getLayer(layer) || (!badgeChanged && !updated.has(layer)))
      continue;
    map.setLayoutProperty(layer, 'icon-image', badges ? ['get', 'badge'] : '');
    map.setLayoutProperty(layer, 'icon-size', 0.72);
    map.setLayoutProperty(layer, 'icon-padding', 4);
    map.setLayoutProperty(
      layer,
      'text-variable-anchor',
      badges ? ['left', 'right', 'top', 'bottom'] : undefined,
    );
    map.setLayoutProperty(layer, 'text-radial-offset', badges ? 1.2 : 0);
    map.setLayoutProperty(layer, 'text-offset', badges ? [0, 0] : [0, 1]);
    map.setLayoutProperty(layer, 'text-padding', badges ? 6 : 12);
  }
  if (changed)
    map.setLight({
      color: dark ? '#c3d4e8' : '#ffffff',
      intensity: dark ? 0.3 : 0.45,
    });
  state.badges = badges;
  applied.set(map, state);
}
