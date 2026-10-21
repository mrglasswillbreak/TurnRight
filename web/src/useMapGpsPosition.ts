import { useEffect } from 'react';
import type { GeoJSONSource } from 'maplibre-gl';
import { empty } from './map-view-data';
import type { MapViewState } from './useMapView';
export function useMapGpsPosition({
  mapRef,
  fix,
  ready,
  panelBesideMap,
}: Pick<MapViewState, 'mapRef' | 'fix' | 'ready' | 'panelBesideMap'>): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!fix) {
        (map.getSource('position') as GeoJSONSource)?.setData(empty);
        return;
      }
      const ring = Array.from({ length: 49 }, (_, i) => {
        const angle = (i / 48) * Math.PI * 2;
        return [
          fix.coordinates[0] +
            (Math.cos(angle) * fix.accuracy) /
              (111320 * Math.cos((fix.coordinates[1] * Math.PI) / 180)),
          fix.coordinates[1] + (Math.sin(angle) * fix.accuracy) / 111320,
        ];
      });
      (map.getSource('position') as GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              locationLabel:
                Date.now() - fix.timestamp <= 12000
                  ? 'You are here'
                  : 'Last known location',
            },
            geometry: { type: 'Point', coordinates: fix.coordinates },
          },
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [ring] },
          },
        ],
      });
    };
    const frame = requestAnimationFrame(() => {
      if (ready.current) apply();
    });
    if (!ready.current) map.once('load', apply);
    const expiry =
      fix && setTimeout(apply, Math.max(0, fix.timestamp + 12001 - Date.now()));
    return () => {
      cancelAnimationFrame(frame);
      if (expiry) clearTimeout(expiry);
      map.off('load', apply);
    };
  }, [fix, panelBesideMap, mapRef, ready]);
}
