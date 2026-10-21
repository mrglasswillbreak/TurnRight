import { useEffect } from 'react';
import { applyMapTheme } from './map-theme';
import type { MapViewState } from './useMapView';
export function useMapBuildingPresentation({
  mapRef,
  modelIds,
  buildingOpacity,
  selectedId,
  dark,
  restoreLayerZoom,
  ready,
  editor,
  selectedBuildingId,
}: Pick<
  MapViewState,
  | 'mapRef'
  | 'modelIds'
  | 'buildingOpacity'
  | 'selectedId'
  | 'dark'
  | 'restoreLayerZoom'
  | 'ready'
  | 'editor'
  | 'selectedBuildingId'
>): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer('buildings-3d')) return;
      for (const layer of ['buildings-3d', 'building-roofs'])
        map.setFilter(layer, [
          'all',
          ['==', ['get', 'kind'], 'building'],
          ['!', ['in', ['get', 'id'], ['literal', modelIds]]],
        ]);
      map.setPaintProperty('buildings-3d', 'fill-extrusion-height', [
        'get',
        'displayHeight',
      ]);
      map.setPaintProperty(
        'buildings-3d',
        'fill-extrusion-opacity',
        buildingOpacity,
      );
      map.setPaintProperty(
        'building-roofs',
        'fill-extrusion-opacity',
        buildingOpacity,
      );
      map.setFilter('places-label-selected', ['==', ['get', 'id'], selectedId]);
      map.setFilter('places-label', [
        'all',
        ['<=', ['get', 'priority'], 1],
        ['!=', ['get', 'id'], selectedId],
      ]);
      map.setFilter('places-label-detail', [
        'all',
        ['>', ['get', 'priority'], 1],
        ['!=', ['get', 'id'], selectedId],
      ]);
      for (const layer of [
        'places-label',
        'places-label-detail',
        'places-label-selected',
      ]) {
        map.setLayoutProperty(layer, 'symbol-sort-key', [
          'case',
          ['==', ['get', 'id'], selectedId],
          0,
          ['get', 'priority'],
        ]);
      }
      applyMapTheme(map, dark);
      restoreLayerZoom.current?.(map, [
        'buildings-3d',
        'building-roofs',
        'places-label',
        'places-label-detail',
        'places-label-selected',
      ]);
    };
    if (ready.current) apply();
    else map.once('load', apply);
    return () => {
      map.off('load', apply);
    };
  }, [
    editor,
    buildingOpacity,
    dark,
    selectedId,
    selectedBuildingId,
    modelIds,
    restoreLayerZoom,
    mapRef,
    ready,
  ]);
}
