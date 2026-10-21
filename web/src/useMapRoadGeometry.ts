import { useEffect } from 'react';
import type { MapViewState } from './useMapView';
export function useMapRoadGeometry({
  campusGeometry,
  setRoadGeometry,
}: Pick<MapViewState, 'campusGeometry' | 'setRoadGeometry'>): void {
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    if (
      campusGeometry.features.some((f) =>
        ['road', 'sidewalk', 'parking'].includes(f.properties?.landClass),
      )
    )
      void import('./road-display').then(({ requestRoadDisplay }) => {
        if (!cancelled)
          dispose = requestRoadDisplay(campusGeometry, (geometry) => {
            if (!cancelled)
              setRoadGeometry({ source: campusGeometry, geometry });
          });
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [campusGeometry, setRoadGeometry]);
}
