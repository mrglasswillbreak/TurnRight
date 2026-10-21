import { useEffect } from 'react';
import type { MapViewState } from './useMapView';
export function useMapExtraLayers({
  motionMap,
  dark,
  restoreLayerZoom,
}: Pick<MapViewState, 'motionMap' | 'dark' | 'restoreLayerZoom'>): void {
  useEffect(() => {
    if (!motionMap) return;
    let cancelled = false;
    const apply = () => {
      void import('./map-extra-layers').then(
        ({ extraMapLayers, layerZoomLimits }) => {
          if (!cancelled && motionMap.getLayer('building-contact')) {
            extraMapLayers(motionMap, dark);
            restoreLayerZoom.current = layerZoomLimits;
          }
        },
      );
    };
    if (motionMap.getLayer('building-contact')) apply();
    else motionMap.once('load', apply);
    return () => {
      cancelled = true;
      motionMap.off('load', apply);
    };
  }, [motionMap, dark, restoreLayerZoom]);
}
