import type { Map as MapInstance, MapMouseEvent } from 'maplibre-gl';
import type { Dataset, DatasetFeature } from './gis-types';
import { gisStyle } from './gis-style';
export function showGisPage(
  map: MapInstance,
  dataset: Pick<Dataset, 'style'>,
  features: DatasetFeature[],
  selected: Set<string>,
  select: (key: string) => void,
  layerId = 'workspace-gis-page',
) {
  const id = layerId;
  const collection = {
    type: 'FeatureCollection' as const,
    features: features
      .filter((f) => f.geometry)
      .map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          _key: f.id,
          _color: gisStyle(dataset.style, f.properties).color,
          _size: gisStyle(dataset.style, f.properties).pointSize,
          _selected: selected.has(f.id),
          _label: dataset.style.labelField
            ? String(f.properties[dataset.style.labelField] ?? '')
            : '',
        },
      })),
  };
  const attach = () => {
    if (!map.isStyleLoaded()) return;
    if (map.getSource(id)) return;
    map.addSource(id, { type: 'geojson', data: collection });
    if (!map.getLayer(id + '-fill'))
      map.addLayer({
        id: id + '-fill',
        source: id,
        type: 'fill',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': [
            'case',
            ['get', '_selected'],
            '#f59e0b',
            ['get', '_color'],
          ],
          'fill-opacity': 0.4,
        },
      });
    if (!map.getLayer(id + '-line'))
      map.addLayer({
        id: id + '-line',
        source: id,
        type: 'line',
        filter: ['!=', ['geometry-type'], 'Point'],
        paint: {
          'line-color': ['get', '_color'],
          'line-width': ['case', ['get', '_selected'], 4, 2],
        },
      });
    if (!map.getLayer(id + '-point'))
      map.addLayer({
        id: id + '-point',
        source: id,
        type: 'circle',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': [
            'case',
            ['get', '_selected'],
            '#f59e0b',
            ['get', '_color'],
          ],
          'circle-radius': ['get', '_size'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1,
        },
      });
    if (!map.getLayer(id + '-label'))
      map.addLayer({
        id: id + '-label',
        source: id,
        type: 'symbol',
        layout: {
          'text-field': ['get', '_label'],
          'text-size': 12,
          'text-offset': [0, 1.2],
        },
        paint: {
          'text-color': '#172033',
          'text-halo-color': '#fff',
          'text-halo-width': 1,
        },
      });
  };
  const click = (event: MapMouseEvent) => {
    const hits = map.queryRenderedFeatures(event.point, {
      layers: [id + '-point', id + '-line', id + '-fill'].filter(
        (l) => !!map.getLayer(l),
      ),
    });
    const key = hits[0]?.properties?._key;
    if (typeof key === 'string') select(key);
  };
  attach();
  map.on('idle', attach);
  map.on('click', click);
  return () => {
    map.off('idle', attach);
    map.off('click', click);
    for (const suffix of ['-label', '-point', '-line', '-fill'])
      if (map.getLayer(id + suffix)) map.removeLayer(id + suffix);
    if (map.getSource(id)) map.removeSource(id);
  };
}
export function focusGisFeature(
  map: MapInstance | null,
  feature: DatasetFeature,
) {
  if (!map || !feature.geometry) return;
  const points: number[][] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      if (typeof v[0] === 'number') points.push(v as number[]);
      else v.forEach(walk);
    }
  };
  const geometry = (g: typeof feature.geometry) => {
    if (g?.type === 'GeometryCollection') g.geometries.forEach(geometry);
    else if (g && 'coordinates' in g) walk(g.coordinates);
  };
  geometry(feature.geometry);
  if (!points.length) return;
  let west = 180,
    south = 90,
    east = -180,
    north = -90;
  for (const [x, y] of points) {
    west = Math.min(west, x);
    east = Math.max(east, x);
    south = Math.min(south, y);
    north = Math.max(north, y);
  }
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    { maxZoom: 19, padding: 70 },
  );
}
