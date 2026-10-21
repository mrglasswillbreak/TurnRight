import { useEffect } from 'react';
import { CAMPUS_MIN_ZOOM } from './world-map';
import type { MapViewState } from './useMapView';
export function useMapDimensions({
  mapRef,
  threeD,
  editor,
  ready,
  panelBesideMap,
}: Pick<
  MapViewState,
  'mapRef' | 'threeD' | 'editor' | 'ready' | 'panelBesideMap'
>): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer('buildings-3d')) return;
      map.setLayoutProperty(
        'buildings-3d',
        'visibility',
        threeD ? 'visible' : 'none',
      );
      map.setLayoutProperty(
        'building-roofs',
        'visibility',
        threeD ? 'visible' : 'none',
      );
      const pitch =
        threeD && (editor || map.getZoom() >= CAMPUS_MIN_ZOOM)
          ? editor
            ? 50
            : innerWidth < 768
              ? 40
              : 45
          : 0;
      if (map.getPitch() !== pitch) map.easeTo({ pitch, duration: 500 });
    };
    if (ready.current) apply();
    else map.once('load', apply);
    return () => {
      map.off('load', apply);
    };
  }, [threeD, panelBesideMap, editor, mapRef, ready]);
}
