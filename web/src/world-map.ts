import type { Map as MapInstance, ProjectionSpecification } from 'maplibre-gl';
import type { CampusData } from './types';
import { publicMapPadding } from './public-map-layout';

export const CAMPUS_MIN_ZOOM = 12;
export const WORLD_MIN_ZOOM = -2;
export const WORLD_PROJECTION: ProjectionSpecification = {
  type: [
    'interpolate',
    ['linear'],
    ['zoom'],
    11,
    'vertical-perspective',
    12,
    'mercator',
  ],
};
export function returnToCampus(map: MapInstance, bounds: CampusData['bounds']) {
  map.setPadding(publicMapPadding(map.getContainer()));
  map.fitBounds(bounds, {
    // cameraForBounds already subtracts the map's persistent panel padding.
    padding: 20,
    maxZoom: 17,
    duration: 1100,
  });
}

export function followZoom(
  current: number,
  hadPosition: boolean,
  beganFollowing: boolean,
  recovering = false,
) {
  return !hadPosition ||
    (beganFollowing && current < CAMPUS_MIN_ZOOM) ||
    (recovering && current < 17.99)
    ? 18
    : undefined;
}
