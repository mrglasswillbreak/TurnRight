import { useEffect } from 'react';
import type { MapViewState } from './useMapView';
export function useMapModelRenderer({
  motionMap,
  visualRevision,
  threeD,
  simple,
  setModelStatus,
  mapRef,
  models,
  modelOptions,
  modelAttempt,
}: Pick<
  MapViewState,
  | 'motionMap'
  | 'visualRevision'
  | 'threeD'
  | 'simple'
  | 'setModelStatus'
  | 'mapRef'
  | 'models'
  | 'modelOptions'
  | 'modelAttempt'
>): void {
  useEffect(() => {
    if (!motionMap || !visualRevision || !threeD || simple) return;
    let cancelled = false;
    setModelStatus('ready');
    void import('./campus-model-layer')
      .then(({ createCampusModels }) => {
        if (cancelled || mapRef.current !== motionMap) return;
        models.current = createCampusModels(motionMap, modelOptions.current);
      })
      .catch(() => {
        if (!cancelled) setModelStatus('unavailable');
      });
    return () => {
      cancelled = true;
      models.current?.dispose();
      models.current = null;
    };
  }, [
    motionMap,
    visualRevision,
    threeD,
    simple,
    modelAttempt,
    mapRef,
    modelOptions,
    models,
    setModelStatus,
  ]);
}
