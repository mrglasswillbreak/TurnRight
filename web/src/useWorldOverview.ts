import { useEffect } from 'react';
import { applyMapTheme } from './map-theme';
import type { MapViewState } from './useMapView';
export function useWorldOverview({
  motionMap,
  editor,
  setWorldError,
  mapRef,
  camera,
  worldAttempt,
}: Pick<
  MapViewState,
  | 'motionMap'
  | 'editor'
  | 'setWorldError'
  | 'mapRef'
  | 'camera'
  | 'worldAttempt'
>): void {
  useEffect(() => {
    if (!motionMap || editor) return;
    const controller = new AbortController();
    setWorldError(false);
    void import('./world-overview')
      .then(async ({ loadWorld, installWorldLayers }) => {
        controller.signal.throwIfAborted();
        const world = await loadWorld(controller.signal);
        if (controller.signal.aborted || mapRef.current !== motionMap) return;
        installWorldLayers(motionMap, world);
        applyMapTheme(motionMap, camera.current.dark);
      })
      .catch(() => {
        if (!controller.signal.aborted) setWorldError(true);
      });
    return () => controller.abort();
  }, [motionMap, editor, worldAttempt, setWorldError, camera, mapRef]);
}
