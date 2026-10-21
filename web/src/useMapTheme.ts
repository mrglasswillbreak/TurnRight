import { useEffect } from 'react';
import { applyMapTheme } from './map-theme';
import type { MapViewState } from './useMapView';
export function useMapTheme({
  mapRef,
  dark,
  ready,
  panelBesideMap,
  editor,
}: Pick<
  MapViewState,
  'mapRef' | 'dark' | 'ready' | 'panelBesideMap' | 'editor'
>): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      // Repaint in place: device changes must not reset a walk, camera or editor.
      applyMapTheme(map, dark);
    };
    if (ready.current) apply();
    else map.once('load', apply);
    return () => {
      map.off('load', apply);
    };
  }, [dark, panelBesideMap, editor, mapRef, ready]);
}
