import type { Feature } from 'geojson';
import type { Map } from 'maplibre-gl';
import type { Position } from './types';
import { Button } from '@/components/ui/button';

export default function LandmarkViewButton({
  feature,
  map,
  mobile,
  onEnable,
}: {
  feature: Feature;
  map: Map | null;
  mobile: boolean;
  onEnable: () => void;
}) {
  return (
    <Button
      variant="outline"
      onClick={() => {
        onEnable();
        const points: Position[] = [];
        const collect = (v: unknown) => {
          if (!Array.isArray(v)) return;
          if (typeof v[0] === 'number' && typeof v[1] === 'number')
            points.push([v[0], v[1]]);
          else v.forEach(collect);
        };
        if ('coordinates' in feature.geometry)
          collect(feature.geometry.coordinates);
        if (!points.length) return;
        map?.fitBounds(
          [
            [
              Math.min(...points.map((p) => p[0])),
              Math.min(...points.map((p) => p[1])),
            ],
            [
              Math.max(...points.map((p) => p[0])),
              Math.max(...points.map((p) => p[1])),
            ],
          ],
          {
            padding: mobile
              ? { top: 90, bottom: 300, left: 45, right: 45 }
              : { top: 100, bottom: 100, left: 420, right: 100 },
            maxZoom: 19,
            pitch: 58,
            bearing: -20,
            duration: matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 0
              : 650,
          },
        );
      }}
    >
      View in 3D
    </Button>
  );
}
