import type { CustomLayerInterface, Map as CampusMap } from 'maplibre-gl';

/** MapLibre rebuilds its style after context loss and omits custom layers. */
export function modelContextRecovery(
  map: CampusMap,
  layer: CustomLayerInterface,
  lost: () => void,
  restored: () => void,
) {
  let pending = false;
  const complete = () => {
    if (!pending) return;
    pending = false;
    map.off('style.load', complete);
    if (!map.getLayer(layer.id))
      map.addLayer(layer, map.getLayer('barriers') ? 'barriers' : undefined);
    restored();
  };
  const onLost = () => {
    pending = true;
    lost();
  };
  const onRestored = () => {
    if (map.isStyleLoaded()) complete();
    else map.once('style.load', complete);
  };
  map.on('webglcontextlost', onLost);
  map.on('webglcontextrestored', onRestored);
  return () => {
    pending = false;
    map.off('webglcontextlost', onLost);
    map.off('webglcontextrestored', onRestored);
    map.off('style.load', complete);
  };
}
