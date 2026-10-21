import { useEffect } from 'react';
import { publicMapPadding } from './public-map-layout';
import * as maplibregl from 'maplibre-gl';
import type { MapViewState } from './useMapView';
export function useMapPlaceSelection({
  mapRef,
  selectedId,
  selectedLng,
  selectedLat,
  panelBesideMap,
}: Pick<
  MapViewState,
  'mapRef' | 'selectedId' | 'selectedLng' | 'selectedLat' | 'panelBesideMap'
>): void {
  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      !selectedId ||
      selectedLng === undefined ||
      selectedLat === undefined
    )
      return;
    const marker = new maplibregl.Marker({ color: '#1764ed', scale: 0.85 })
      .setLngLat([selectedLng, selectedLat])
      .addTo(map);
    map.flyTo({
      center: [selectedLng, selectedLat],
      zoom: Math.max(map.getZoom(), 17),
      padding: panelBesideMap
        ? { top: 40, right: 40, bottom: 40, left: 40 }
        : publicMapPadding(map.getContainer()),
      duration: 750,
    });
    return () => {
      marker.remove();
    };
  }, [selectedId, selectedLng, selectedLat, panelBesideMap, mapRef]);
}
