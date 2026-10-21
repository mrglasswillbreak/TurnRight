import type { Map as MapInstance, SymbolLayerSpecification } from 'maplibre-gl';
import { campusPalette } from './map-palette';
import { installPlaceBadges } from './place-badges';
import { CAMPUS_MIN_ZOOM } from './world-map';
export function installCampusLayers(
  map: MapInstance,
  dark: boolean,
  editor: boolean,
) {
  const palette = campusPalette[dark ? 'dark' : 'light'];
  map.addLayer({
    id: 'campus-fill',
    type: 'fill',
    source: 'boundary',
    paint: { 'fill-color': dark ? '#243632' : '#faf5e8' },
  });
  map.addLayer({
    id: 'land',
    type: 'fill',
    source: 'campus',
    filter: [
      'all',
      ['==', ['get', 'kind'], 'land'],
      ['!=', ['get', 'visible'], false],
    ],
    layout: {
      'fill-sort-key': [
        'match',
        ['get', 'landClass'],
        'parcel',
        -10,
        ['road', 'sidewalk', 'parking'],
        10,
        0,
      ],
    },
    paint: {
      'fill-color': [
        'match',
        ['get', 'name'],
        ['Green Area', 'Vegetation', 'Forest'],
        dark ? '#3b5645' : '#c0d0ac',
        ['Water Body', 'Water'],
        palette.water,
        dark ? '#34473e' : '#eee4cf',
      ],
      'fill-opacity': 0.65,
    },
  });
  map.addLayer({
    id: 'boundary-line',
    type: 'line',
    source: 'boundary',
    paint: {
      'line-color': '#809b78',
      'line-width': 1.5,
      'line-dasharray': [3, 4],
      'line-opacity': 0.7,
    },
  });
  map.addLayer({
    id: 'roads-case',
    type: 'line',
    source: 'road-display',
    filter: ['==', ['get', 'kind'], 'path'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': dark ? '#57665b' : '#cec1a6',
      'line-width': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 15],
    },
  });
  map.addLayer({
    id: 'roads',
    type: 'line',
    source: 'road-display',
    filter: ['==', ['get', 'kind'], 'path'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': dark ? '#9c9a7c' : '#ffffff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 12],
    },
  });
  map.addLayer({
    id: 'building-contact',
    type: 'fill',
    source: 'campus',
    filter: ['==', ['get', 'kind'], 'building'],
    paint: {
      'fill-color': '#293329',
      'fill-opacity': 0.13,
      'fill-translate': [2, 3],
      'fill-translate-anchor': 'viewport',
    },
  });
  map.addLayer({
    id: 'buildings',
    type: 'fill',
    source: 'campus',
    filter: ['==', ['get', 'kind'], 'building'],
    paint: {
      'fill-color': ['get', 'displayRoof'],
      'fill-outline-color': dark ? '#697985' : '#c2cbd0',
    },
  });
  map.addLayer({
    id: 'buildings-3d',
    type: 'fill-extrusion',
    source: 'campus',
    filter: [
      'all',
      ['==', ['get', 'kind'], 'building'],
      ['>', ['get', 'displayHeight'], 0],
    ],
    layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': dark ? '#52616c' : '#d5dce5',
      'fill-extrusion-height': ['get', 'displayHeight'],
      'fill-extrusion-vertical-gradient': true,
      'fill-extrusion-opacity': 0.92,
    },
  });
  map.addLayer({
    id: 'building-roofs',
    type: 'fill-extrusion',
    source: 'campus',
    filter: ['==', ['get', 'kind'], 'building'],
    layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': ['get', 'displayRoof'],
      'fill-extrusion-base': ['get', 'displayHeight'],
      'fill-extrusion-height': ['+', ['get', 'displayHeight'], 0.04],
      'fill-extrusion-opacity': 0.92,
      'fill-extrusion-vertical-gradient': false,
    },
  });
  map.addLayer({
    id: 'building-outlines',
    type: 'line',
    source: 'campus',
    filter: ['==', ['get', 'kind'], 'building'],
    paint: {
      'line-color': dark ? '#9aabb3' : '#8094a1',
      'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.5, 19, 1.4],
      'line-opacity': 0.7,
    },
  });
  map.addLayer({
    id: 'barriers',
    type: 'line',
    source: 'campus',
    filter: ['==', ['get', 'kind'], 'barrier'],
    paint: {
      'line-color': '#b7947e',
      'line-width': 1.5,
      'line-dasharray': [2, 1],
    },
  });
  map.addLayer({
    id: 'closed-paths',
    type: 'line',
    source: 'closures',
    paint: {
      'line-color': ['case', ['get', 'conflict'], '#c58937', '#d34b4b'],
      'line-width': 5,
      'line-dasharray': [2, 2],
    },
  });
  map.addLayer({
    id: 'routes-case',
    type: 'line',
    source: 'routes',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#ffffff',
      'line-width': ['case', ['get', 'active'], 10, 6],
    },
  });
  map.addLayer({
    id: 'routes-line',
    type: 'line',
    source: 'routes',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': [
        'case',
        ['!', ['get', 'active']],
        '#809ac2',
        ['==', ['get', 'mode'], 'driving'],
        '#8b36c9',
        '#085adb',
      ],
      'line-width': ['case', ['get', 'active'], 6.5, 3.5],
    },
  });
  map.addLayer({
    id: 'places-dot',
    type: 'circle',
    source: 'places',
    minzoom: 14.5,
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        14.5,
        ['case', ['<=', ['get', 'priority'], 1], 3, 1.3],
        17,
        4,
        19,
        5,
      ],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        14.5,
        0.7,
        18,
        1.5,
      ],
    },
  });
  map.addLayer({
    id: 'places-label',
    type: 'symbol',
    source: 'places',
    minzoom: 14.3,
    filter: ['<=', ['get', 'priority'], 1],
    layout: {
      'symbol-sort-key': ['get', 'priority'],
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Semibold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 15, 11, 18, 13],
      'text-max-width': 11,
      'text-offset': [0, 1],
      'text-anchor': 'top',
      'text-padding': 12,
    },
    paint: {
      'text-color': dark ? '#d7e3ee' : '#53616b',
      'text-halo-color': dark ? '#213039' : '#ffffff',
      'text-halo-width': 1.6,
    },
  });
  installPlaceBadges(map);
  map.addLayer({
    id: 'street-selected',
    type: 'line',
    source: 'campus',
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'line-color': '#f59e0b',
      'line-width': 7,
      'line-opacity': 0.8,
    },
  });
  map.addLayer(
    {
      id: 'street-labels',
      type: 'symbol',
      source: 'campus',
      minzoom: 16,
      filter: [
        'all',
        ['==', ['get', 'kind'], 'path'],
        ['!=', ['get', 'streetLabel'], ''],
      ],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 300,
        'text-field': ['get', 'streetLabel'],
        'text-font': ['Open Sans Semibold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 16, 10, 19, 12],
        'text-letter-spacing': 0.08,
        'text-transform': 'uppercase',
        'text-max-angle': 30,
        'text-padding': 8,
        'text-pitch-alignment': 'map',
      },
    },
    'places-label',
  );
  map.addLayer({
    id: 'gps-accuracy',
    type: 'fill',
    source: 'position',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#1764ed', 'fill-opacity': 0.12 },
  });
  map.addLayer({
    id: 'gps-dot',
    type: 'circle',
    source: 'position',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-color': '#1764ed',
      'circle-radius': 8,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 3,
    },
  });
  if (!editor)
    map.addLayer({
      id: 'gps-label',
      type: 'symbol',
      source: 'position',
      maxzoom: CAMPUS_MIN_ZOOM,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: {
        'text-field': ['get', 'locationLabel'],
        'text-font': ['Open Sans Semibold'],
        'text-size': 13,
        'text-anchor': 'bottom',
        'text-offset': [0, -1.3],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#1558c7',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
      },
    });
  const label = map
    .getStyle()
    .layers.find((l) => l.id === 'places-label') as SymbolLayerSpecification;
  map.addLayer({
    ...label,
    id: 'places-label-detail',
    minzoom: 16.8,
    filter: ['>', ['get', 'priority'], 1],
  });
  map.addLayer(
    {
      ...label,
      id: 'places-label-selected',
      minzoom: 13,
      filter: ['==', ['get', 'id'], ''],
      layout: {
        ...label.layout,
        'text-size': 14,
        'text-allow-overlap': true,
        'icon-allow-overlap': true,
      },
    },
    'places-label',
  );
  map.addLayer(
    {
      ...label,
      id: 'route-end-labels',
      source: 'route-labels',
      minzoom: 13,
      filter: ['has', 'name'],
      layout: {
        ...label.layout,
        'symbol-sort-key': 0,
        'text-size': 13,
        'text-offset': [0, -1],
        'text-anchor': 'bottom',
        'text-allow-overlap': true,
      },
      paint: {
        ...label.paint,
        'text-color': '#085adb',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
      },
    },
    'places-label-selected',
  );
}
