import { useEffect } from 'react';
import { publicMapPadding } from './public-map-layout';
import * as maplibregl from 'maplibre-gl';
import type { MapViewState } from './useMapView';
export function useMapStreetSelection({
  mapRef,
  selectedStreet,
  data,
  container,
  ready,
}: Pick<
  MapViewState,
  'mapRef' | 'selectedStreet' | 'data' | 'container' | 'ready'
>): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer('street-selected')) return;
      map.setFilter('street-selected', [
        '==',
        ['get', 'id'],
        selectedStreet || '',
      ]);
      const street = data.map.features.find(
        (f) => f.properties?.id === selectedStreet,
      );
      if (street?.geometry.type === 'LineString') {
        const bounds = new maplibregl.LngLatBounds();
        street.geometry.coordinates.forEach((p) => bounds.extend([p[0], p[1]]));
        map.fitBounds(bounds, {
          padding: container.current ? publicMapPadding(container.current) : 24,
          maxZoom: 19,
        });
      }
    };
    if (ready.current) apply();
    else map.once('load', apply);
    return () => {
      map.off('load', apply);
    };
  }, [selectedStreet, data, container, mapRef, ready]);
}
