import type { FeatureCollection } from 'geojson';
import type {
  Map as MapInstance,
  MapMouseEvent,
  ExpressionSpecification,
} from 'maplibre-gl';
import type { CampusIdentity } from './campus-context';
import { campusPalette } from './map-palette';

export function campusCenter(
  bounds: CampusIdentity['bounds'],
): [number, number] {
  const [[west, south], [east, north]] = bounds;
  const width = east >= west ? east - west : east + 360 - west;
  return [((west + width / 2 + 540) % 360) - 180, (south + north) / 2];
}

export function overviewFeatures(
  campuses: CampusIdentity[],
  active: string,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: campuses.flatMap((campus) => {
      const properties = {
        id: campus.id,
        slug: campus.slug,
        name: campus.name,
        active: campus.slug === active,
      };
      const point = {
        type: 'Feature' as const,
        id: `${campus.id}:pin`,
        properties,
        geometry: {
          type: 'Point' as const,
          coordinates: campusCenter(campus.bounds),
        },
      };
      return campus.outline
        ? [
            point,
            {
              type: 'Feature' as const,
              id: `${campus.id}:outline`,
              properties,
              geometry: campus.outline,
            },
          ]
        : [point];
    }),
  };
}

const layerIds = [
  'published-campus-outline-fill',
  'published-campus-outline-line',
  'published-campus-pins',
  'published-campus-labels',
];

export function installCampusOverview(
  map: MapInstance,
  campuses: CampusIdentity[],
  active: string,
  dark: boolean,
  onChoose: (campuses: CampusIdentity[]) => void,
) {
  const source = 'published-campuses';
  const palette = campusPalette[dark ? 'dark' : 'light'];
  const selected: ExpressionSpecification = ['==', ['get', 'active'], true];
  const hover: ExpressionSpecification = [
    'boolean',
    ['feature-state', 'hover'],
    false,
  ];
  const fade = (opacity: number): ExpressionSpecification => [
    'interpolate',
    ['linear'],
    ['zoom'],
    10,
    0,
    11,
    opacity,
    12,
    ['case', selected, 0, opacity],
  ];
  const polygon = ['!=', ['geometry-type'], 'Point'] as ExpressionSpecification;
  const point = ['==', ['geometry-type'], 'Point'] as ExpressionSpecification;
  map.addSource(source, {
    type: 'geojson',
    data: overviewFeatures(campuses, active),
  });
  map.addLayer(
    {
      id: layerIds[0],
      source,
      type: 'fill',
      filter: polygon,
      minzoom: 10,
      paint: {
        'fill-color': ['case', hover, palette.route, palette.campus],
        'fill-opacity': fade(0.55),
      },
    },
    'campus-fill',
  );
  map.addLayer(
    {
      id: layerIds[1],
      source,
      type: 'line',
      filter: polygon,
      minzoom: 10,
      paint: {
        'line-color': [
          'case',
          selected,
          palette.route,
          hover,
          palette.route,
          palette.boundary,
        ],
        'line-width': ['case', selected, 3, hover, 3, 2],
        'line-opacity': fade(0.95),
      },
    },
    'campus-fill',
  );
  map.addLayer({
    id: layerIds[2],
    source,
    type: 'circle',
    filter: point,
    maxzoom: 12,
    paint: {
      'circle-color': [
        'case',
        selected,
        palette.route,
        hover,
        palette.route,
        palette.boundary,
      ],
      'circle-radius': ['case', hover, 10, 8],
      'circle-stroke-color': palette.halo,
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: layerIds[3],
    source,
    type: 'symbol',
    filter: point,
    minzoom: 3,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Semibold'],
      'text-size': 13,
      'text-offset': [0, 1.5],
      'symbol-sort-key': ['case', selected, 0, 1],
    },
    paint: {
      'text-color': palette.label,
      'text-halo-color': palette.halo,
      'text-halo-width': 2,
      'text-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        11,
        1,
        12,
        ['case', selected, 0, 1],
      ],
    },
  });
  const hits = (event: MapMouseEvent) => {
    // Do not turn clicks on detailed places into a selection of their campus.
    const radius =
      ('pointerType' in event.originalEvent &&
        event.originalEvent.pointerType === 'touch') ||
      matchMedia('(pointer: coarse)').matches
        ? 22
        : 12;
    const features = map.queryRenderedFeatures(
      [
        [event.point.x - radius, event.point.y - radius],
        [event.point.x + radius, event.point.y + radius],
      ],
      { layers: layerIds },
    );
    const ids = new Set(
      features
        .filter((f) => map.getZoom() < 12 || !f.properties?.active)
        .map((f) => String(f.properties?.id)),
    );
    return campuses.filter((campus) => ids.has(campus.id));
  };
  const click = (event: MapMouseEvent) => {
    const choices = hits(event);
    if (choices.length) onChoose(choices);
  };
  let hovered: string[] = [];
  const leave = () => {
    for (const id of hovered)
      for (const suffix of ['pin', 'outline'])
        map.setFeatureState(
          { source, id: `${id}:${suffix}` },
          { hover: false },
        );
    hovered = [];
    map.getCanvas().style.cursor = '';
  };
  const move = (event: MapMouseEvent) => {
    const next = hits(event).map((c) => c.id);
    if (next.join() === hovered.join()) return;
    leave();
    hovered = next;
    for (const id of hovered)
      for (const suffix of ['pin', 'outline'])
        map.setFeatureState({ source, id: `${id}:${suffix}` }, { hover: true });
    if (hovered.length) map.getCanvas().style.cursor = 'pointer';
  };
  map.on('click', click);
  map.on('mousemove', move);
  map.getCanvas().addEventListener('mouseleave', leave);
  return () => {
    map.off('click', click);
    map.off('mousemove', move);
    map.getCanvas().removeEventListener('mouseleave', leave);
    leave();
    for (const id of [...layerIds].reverse())
      if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(source)) map.removeSource(source);
  };
}
