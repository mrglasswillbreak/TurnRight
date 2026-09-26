import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import type {
  GeoJSONSource,
  Map as MapInstance,
  MapMouseEvent,
} from 'maplibre-gl';
import { MapView } from './MapView';
import { emptyCampus, type CampusIdentity } from './campus-context';
import type { CampusData, Position } from './types';

export function ImportMapPreview({
  campus,
  features,
  boundary,
  drawing = false,
  vertices = [],
  onVertex,
  dark = false,
}: {
  campus: CampusIdentity;
  features?: FeatureCollection;
  boundary?: CampusData['boundary'];
  drawing?: boolean;
  vertices?: Position[];
  onVertex?: (p: Position) => void;
  dark?: boolean;
}) {
  const map = useRef<MapInstance | null>(null),
    callback = useRef({ drawing, onVertex, vertices });
  callback.current = { drawing, onVertex, vertices };
  const data = useMemo(
    () => ({
      ...emptyCampus(campus, boundary),
      places: (features?.features || []).flatMap((feature, index) => {
        const points =
          feature.geometry?.type === 'Point'
            ? [feature.geometry.coordinates]
            : feature.geometry?.type === 'MultiPoint'
              ? feature.geometry.coordinates
              : [];
        return points.map((coordinates, i) => ({
          id: `import-point-${index}-${i}`,
          sourceId: `${index}-${i}`,
          arrivalKind: 'unmapped' as const,
          name: String(
            feature.properties?.name ||
              feature.properties?.Name ||
              `Point ${index + 1}`,
          ),
          coordinates: coordinates as Position,
          category: 'other' as const,
          aliases: [],
          source: 'import-preview',
        }));
      }),
      map: {
        type: 'FeatureCollection' as const,
        features: (features?.features || [])
          .filter((f) => f.geometry)
          .map((f, i) => ({
            ...f,
            properties: {
              ...f.properties,
              id: f.properties?.id || `preview-${i}`,
              kind:
                f.properties?.kind ||
                (/Polygon/.test(f.geometry.type)
                  ? 'building'
                  : /Line/.test(f.geometry.type)
                    ? 'path'
                    : 'place'),
            },
          })),
      },
    }),
    [campus, features, boundary],
  );
  const update = useCallback(() => {
    const m = map.current;
    if (!m?.getSource('import-boundary')) return;
    const points = callback.current.vertices;
    const outlines: Feature[] = points.map((p, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: p },
      properties: { id: i },
    }));
    if (points.length > 1)
      outlines.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: points.length > 2 ? [...points, points[0]] : points,
        },
        properties: {},
      });
    (m.getSource('import-boundary') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: outlines,
    });
  }, []);
  useEffect(update, [vertices, update]);
  const ready = useCallback(
    (m: MapInstance) => {
      map.current = m;
      m.addSource('import-boundary', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'import-boundary-line',
        type: 'line',
        source: 'import-boundary',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#0d9488', 'line-width': 4 },
      });
      m.addLayer({
        id: 'import-boundary-points',
        type: 'circle',
        source: 'import-boundary',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': '#0d9488',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      const click = (e: MapMouseEvent) => {
        if (callback.current.drawing)
          callback.current.onVertex?.([
            Number(e.lngLat.lng.toFixed(7)),
            Number(e.lngLat.lat.toFixed(7)),
          ]);
      };
      m.on('click', click);
      update();
      const observer = new ResizeObserver(() => m.resize());
      observer.observe(m.getContainer());
      return () => {
        observer.disconnect();
        m.off('click', click);
        map.current = null;
      };
    },
    [update],
  );
  return (
    <div
      className={`import-map ${drawing ? 'drawing' : ''}`}
      aria-label={
        drawing ? 'Draw campus boundary on the map' : 'Import map preview'
      }
    >
      <MapView
        data={data}
        editor
        dark={dark}
        onSelect={() => {}}
        onReady={ready}
      />
    </div>
  );
}
