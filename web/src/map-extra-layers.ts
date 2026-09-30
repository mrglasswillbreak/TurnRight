import type { Map } from 'maplibre-gl';
import { campusPalette } from './map-palette';
import { mapTheme } from './map-theme';

/** Extra GIS presentation is lazy: conversion and authoring never enter startup. */
export function extraMapLayers(map: Map, dark: boolean) {
  const p = campusPalette[dark ? 'dark' : 'light'];
  const styled = (key: string, fallback: unknown) =>
    [
      'coalesce',
      ['get', `mapStyle_${key}`],
      fallback,
    ] as import('maplibre-gl').ExpressionSpecification;
  const lineWidth = (fallback: unknown) =>
    Array.isArray(fallback) && fallback[0] === 'interpolate'
      ? (fallback.map((value, i) =>
          i >= 4 && i % 2 === 0 ? styled('lineWidth', value) : value,
        ) as import('maplibre-gl').ExpressionSpecification)
      : styled('lineWidth', fallback);
  const visible = ['!=', ['get', 'visible'], false] as const;
  const overlay = ['all', ['==', ['get', 'kind'], 'overlay'], visible] as const;
  const color = styled(
    dark ? 'darkColor' : 'color',
    styled('color', ['coalesce', ['get', 'color'], p.selection]),
  );
  const opacity = styled('opacity', ['coalesce', ['get', 'opacity'], 0.5]);
  const order = [
    'coalesce',
    ['get', 'layerOrder'],
    ['get', 'order'],
    0,
  ] as const;
  const specs = [
    {
      id: 'land-labels',
      type: 'symbol',
      source: 'campus',
      filter: [
        'all',
        ['==', ['get', 'kind'], 'land'],
        ['==', styled('labels', false), true],
      ],
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
        'line-width': styled('lineWidth', [
          'coalesce',
          ['get', 'lineWidth'],
          2,
        ]),
        'line-opacity': opacity,
      },
    },
    {
      id: 'overlay-points',
      type: 'circle',
      source: 'campus',
      filter: [
        'all',
        overlay,
        ['==', ['geometry-type'], 'Point'],
        ['==', styled('symbol', 'circle'), 'circle'],
      ],
      layout: { 'circle-sort-key': order },
      paint: {
        'circle-color': color,
        'circle-radius': styled('pointSize', 4),
        'circle-opacity': opacity,
      },
    },
    {
      id: 'overlay-symbols',
      type: 'symbol',
      source: 'campus',
      filter: [
        'all',
        overlay,
        ['==', ['geometry-type'], 'Point'],
        ['!=', styled('symbol', 'circle'), 'circle'],
      ],
      layout: {
        'icon-image': ['concat', 'layer-', styled('symbol', 'square')],
        'icon-size': ['/', styled('pointSize', 4), 12],
        'icon-allow-overlap': true,
        'symbol-sort-key': order,
      },
      paint: { 'icon-color': color, 'icon-opacity': opacity },
    },
    {
      id: 'overlay-labels',
      type: 'symbol',
      source: 'campus',
      filter: overlay,
      minzoom: 16,
      layout: {
        'text-field': [
          'case',
          ['==', styled('labels', true), false],
          '',
          ['coalesce', ['get', 'label'], ['get', 'name'], ''],
        ],
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
  for (const symbol of ['square', 'diamond'])
    if (!map.hasImage(`layer-${symbol}`)) {
      const pixels = new Uint8Array(48 * 48 * 4);
      for (let y = 0; y < 48; y++)
        for (let x = 0; x < 48; x++) {
          const d =
              symbol === 'square'
                ? 16 - Math.max(Math.abs(x - 24), Math.abs(y - 24))
                : 22 - Math.abs(x - 24) - Math.abs(y - 24),
            i = (y * 48 + x) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
          pixels[i + 3] = Math.max(0, Math.min(255, 128 + d * 8));
        }
      map.addImage(
        `layer-${symbol}`,
        { width: 48, height: 48, data: pixels },
        { sdf: true, pixelRatio: 2 },
      );
    }
  const bandBefore = {
    landscape: 'roads-case',
    surfaces: 'building-contact',
    buildings: 'barriers',
    annotations: 'routes-case',
  };
  const expanded = specs.flatMap((spec) =>
    !spec.id.startsWith('overlay-')
      ? [{ spec, before: 'building-contact' }]
      : Object.entries(bandBefore).map(([band, before]) => ({
          spec: {
            ...spec,
            id: band === 'annotations' ? spec.id : `${spec.id}-${band}`,
            filter: [
              'all',
              ('filter' in spec ? spec.filter : undefined) || true,
              ['==', ['coalesce', ['get', 'layerBand'], 'annotations'], band],
            ],
          } as import('maplibre-gl').LayerSpecification,
          before,
        })),
  );
  for (const { spec, before } of expanded) {
    if (!map.getLayer(spec.id)) map.addLayer(spec, before);
    else
      for (const [key, value] of Object.entries(spec.paint || {}))
        map.setPaintProperty(
          spec.id,
          key as Parameters<Map['setPaintProperty']>[1],
          value,
        );
  }
  for (const layer of map.getStyle().layers) {
    if (
      !('source' in layer) ||
      !['campus', 'road-display', 'places', 'boundary'].includes(
        String(layer.source),
      )
    )
      continue;
    const filter = 'filter' in layer ? layer.filter : undefined;
    if ((JSON.stringify(filter) || '').includes('mapStyle_minZoom')) continue;
    map.setFilter(layer.id, [
      'all',
      filter || true,
      ['>=', ['zoom'], styled('minZoom', 0)],
      ['<=', ['zoom'], styled('maxZoom', 24)],
    ] as import('maplibre-gl').FilterSpecification);
  }
  // Keep these per-feature expressions in the optional renderer, away from startup.
  const theme = mapTheme(dark) as unknown as Record<
    string,
    Record<string, unknown>
  >;
  for (const id of [
    'campus-fill',
    'boundary-line',
    'land',
    'roads',
    'roads-case',
    'land-edges',
    'buildings',
    'buildings-3d',
    'building-roofs',
    'places-dot',
  ]) {
    if (!map.getLayer(id)) continue;
    const base = theme[id] || {},
      type = map.getLayer(id)!.type;
    const colour =
      type === 'fill'
        ? 'fill-color'
        : type === 'fill-extrusion'
          ? 'fill-extrusion-color'
          : type === 'line'
            ? 'line-color'
            : 'circle-color';
    const fallback =
      base[colour] ?? (id === 'land-edges' ? p.boundary : p.selection);
    map.setPaintProperty(
      id,
      colour,
      styled(
        id === 'land-edges' || id === 'roads-case' || id === 'boundary-line'
          ? 'outline'
          : dark
            ? 'darkColor'
            : 'color',
        styled('color', fallback),
      ),
    );
    if (type === 'line') {
      map.setPaintProperty(
        id,
        'line-width',
        lineWidth(base['line-width'] ?? 1),
      );
      map.setPaintProperty(
        id,
        'line-opacity',
        styled('opacity', base['line-opacity'] ?? 1),
      );
    }
    if (type === 'fill') {
      map.setPaintProperty(
        id,
        'fill-opacity',
        styled('opacity', base['fill-opacity'] ?? 1),
      );
      map.setLayoutProperty(id, 'fill-sort-key', [
        '+',
        ['*', ['case', ['==', ['get', 'layerBand'], 'surfaces'], 1, 0], 20001],
        ['coalesce', ['get', 'layerOrder'], 0],
      ]);
    }
  }
}
