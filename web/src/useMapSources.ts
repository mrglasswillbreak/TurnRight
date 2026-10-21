import { useEffect } from 'react';
import type { GeoJSONSource } from 'maplibre-gl';
import type { MapViewState } from './useMapView';
export function useMapSources({
  mapRef,
  sourceData,
  appliedSources,
  ready,
}: Pick<
  MapViewState,
  'mapRef' | 'sourceData' | 'appliedSources' | 'ready'
>): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      for (const [id, value] of Object.entries(sourceData)) {
        if (appliedSources.current[id] === value) continue;
        (map.getSource(id) as GeoJSONSource)?.setData(value);
        appliedSources.current[id] = value;
      }
    };
    if (ready.current) apply();
    else map.once('load', apply);
    return () => {
      map.off('load', apply);
    };
  }, [sourceData, mapRef, ready, appliedSources]);
}
