import { useEffect } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { MapViewState } from './useMapView';
export function useMapAttribution({
  motionMap,
  data,
  editor,
}: Pick<MapViewState, 'motionMap' | 'data' | 'editor'>): void {
  useEffect(() => {
    if (!motionMap) return;
    const control = new maplibregl.AttributionControl({
      compact: true,
      customAttribution: [
        ...new Set(data.sources.map((s) => s.attribution).filter(Boolean)),
      ].map((value) =>
        value.replace(
          /[&<>"']/g,
          (c) =>
            ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#39;',
            })[c]!,
        ),
      ),
    });
    motionMap.addControl(control, 'bottom-right');
    {
      const credits = motionMap
        .getContainer()
        .querySelector('details.maplibregl-ctrl-attrib');
      credits?.removeAttribute('open');
      credits?.classList.remove('maplibregl-compact-show');
    }
    return () => {
      if (motionMap.hasControl(control)) motionMap.removeControl(control);
    };
  }, [motionMap, data.sources, editor]);
}
