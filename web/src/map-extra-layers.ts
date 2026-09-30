import type { Map } from 'maplibre-gl';
import { campusPalette } from './map-palette';

/** Extra GIS presentation is lazy: conversion and authoring never enter startup. */
export function extraMapLayers(map: Map, dark: boolean) {
  const p = campusPalette[dark ? 'dark' : 'light'];
  const visible = ['!=', ['get', 'visible'], false] as const;
  const overlay = ['all', ['==', ['get', 'kind'], 'overlay'], visible] as const;
  const color = ['coalesce', ['get', 'color'], p.selection] as const;
  const opacity = ['coalesce', ['get', 'opacity'], 0.5] as const;
  const order = ['coalesce', ['get', 'order'], 0] as const;
  const specs = [
    {
      id: 'overlay-fill',
      type: 'fill',
      source: 'campus',
      filter: ['all', overlay, ['==', ['geometry-type'], 'Polygon']],
      layout: { 'fill-sort-key': order },
      paint: { 'fill-color': color, 'fill-opacity': opacity },
    },
    {
      id: 'land-edges',
      type: 'line',
      source: 'campus',
      filter: ['all', ['==', ['get', 'kind'], 'land'], visible],
      paint: {
        'line-color': p.boundary,
        'line-width': [
          'match',
          ['get', 'landClass'],
          'parcel',
          0.5,
          'road',
          0.7,
          'sidewalk',
          0.4,
          0.2,
        ],
        'line-opacity': 0.35,
      },
    },
    {
      id: 'overlay-lines',
      type: 'line',
      source: 'campus',
      filter: ['all', overlay, ['==', ['geometry-type'], 'LineString']],
      layout: { 'line-sort-key': order },
      paint: {
        'line-color': color,
        'line-width': ['coalesce', ['get', 'lineWidth'], 2],
        'line-opacity': opacity,
      },
    },
    {
      id: 'overlay-points',
      type: 'circle',
      source: 'campus',
      filter: ['all', overlay, ['==', ['geometry-type'], 'Point']],
      layout: { 'circle-sort-key': order },
      paint: {
        'circle-color': color,
        'circle-radius': 4,
        'circle-opacity': opacity,
      },
    },
    {
      id: 'overlay-labels',
      type: 'symbol',
      source: 'campus',
      filter: overlay,
      minzoom: 16,
      layout: {
        'text-field': ['coalesce', ['get', 'label'], ['get', 'name'], ''],
        'text-font': ['Open Sans Semibold'],
        'text-size': 11,
        'symbol-sort-key': order,
      },
      paint: {
        'text-color': p.label,
        'text-halo-color': p.halo,
        'text-halo-width': 1.5,
      },
    },
  ] as unknown as import('maplibre-gl').LayerSpecification[];
  for (const spec of specs) {
    if (!map.getLayer(spec.id))
      map.addLayer(
        spec,
        spec.id === 'overlay-fill' ? 'roads-case' : 'building-contact',
      );
    else
      for (const [key, value] of Object.entries(spec.paint || {}))
        map.setPaintProperty(
          spec.id,
          key as Parameters<Map['setPaintProperty']>[1],
          value,
        );
  }
}
