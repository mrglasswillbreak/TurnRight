import type { Map as MapInstance } from 'maplibre-gl';
import { publicMapPadding } from './public-map-layout';

/** Fit a perspective sphere in the exposed rectangle, including at high latitudes.
 * MapLibre's globe radius is worldSize / (2π cos(latitude)); its camera is one
 * focal length above the surface. Solve the projected silhouette radius for zoom.
 */
export function globeFitZoom(
  width: number,
  height: number,
  latitude: number,
  padding: { top: number; bottom: number; left: number; right: number },
  fov = 36.86989764584402,
) {
  const diameter =
    Math.max(
      40,
      Math.min(
        width - padding.left - padding.right,
        height - padding.top - padding.bottom,
      ),
    ) * 0.88;
  const focal = height / (2 * Math.tan((fov * Math.PI) / 360));
  const radius = diameter / 2;
  const worldRadius =
    (radius * radius + radius * Math.sqrt(radius * radius + focal * focal)) /
    focal;
  return Math.max(
    -2,
    Math.min(
      3,
      Math.log2(
        (worldRadius *
          2 *
          Math.PI *
          Math.cos((Math.min(85, Math.abs(latitude)) * Math.PI) / 180)) /
          512,
      ),
    ),
  );
}

export function globeCamera(map: MapInstance, latitude = map.getCenter().lat) {
  const rect = map.getContainer().getBoundingClientRect();
  const padding = publicMapPadding(map.getContainer(), true);
  return {
    padding,
    zoom: globeFitZoom(
      rect.width,
      rect.height,
      latitude,
      padding,
      map.getVerticalFieldOfView(),
    ),
  };
}

export function frameGlobe(map: MapInstance, center: [number, number]) {
  map.easeTo({
    ...globeCamera(map, center[1]),
    center,
    pitch: 0,
    bearing: 0,
    roll: 0,
    duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700,
  });
}
