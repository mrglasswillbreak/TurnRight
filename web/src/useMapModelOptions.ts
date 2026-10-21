import { useEffect } from 'react';
import type { MapViewState } from './useMapView';
export function useMapModelOptions({
  models,
  modelOptions,
  data,
  dark,
  threeD,
  simple,
  editing,
  buildingOpacity,
  selectedBuildingId,
  buildingSelection,
  buildingPreview,
}: Pick<
  MapViewState,
  | 'models'
  | 'modelOptions'
  | 'data'
  | 'dark'
  | 'threeD'
  | 'simple'
  | 'editing'
  | 'buildingOpacity'
  | 'selectedBuildingId'
  | 'buildingSelection'
  | 'buildingPreview'
>): void {
  useEffect(() => {
    models.current?.update(modelOptions.current);
  }, [
    data.map,
    data.visuals,
    dark,
    threeD,
    simple,
    editing,
    buildingOpacity,
    selectedBuildingId,
    buildingSelection,
    buildingPreview.models,
    modelOptions,
    models,
  ]);
}
