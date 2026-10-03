import type { Map as MapInstance } from 'maplibre-gl';
import type { CampusIdentity } from './campus-context';
import { campusCenter } from './campus-overview';
import { publicMapPadding } from './public-map-layout';

function flightDistance(from: [number, number], to: [number, number]) {
  const radians = Math.PI / 180;
  const a =
    Math.sin(((to[1] - from[1]) * radians) / 2) ** 2 +
    Math.cos(from[1] * radians) *
      Math.cos(to[1] * radians) *
      Math.sin(((to[0] - from[0]) * radians) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function campusFlightDuration(
  from: [number, number],
  to: [number, number],
) {
  const km = flightDistance(from, to);
  return Math.round(1100 + Math.min(1100, Math.log1p(km) * 180));
}

/** Keep the shortest longitude path, including boundaries crossing the date line. */
export function campusFlightBounds(
  bounds: CampusIdentity['bounds'],
  longitude: number,
): CampusIdentity['bounds'] {
  const [[w, s], [e, n]] = bounds;
  const east = e < w ? e + 360 : e;
  const offset = Math.round((longitude - (w + east) / 2) / 360) * 360;
  return [
    [w + offset, s],
    [east + offset, n],
  ];
}

export function flyToCampus(
  map: MapInstance,
  bounds: CampusIdentity['bounds'],
  threeD: boolean,
  onFinish: () => void,
) {
  map.stop();
  const start = map.getCenter().toArray();
  map.setPadding(publicMapPadding(map.getContainer()));
  const camera = map.cameraForBounds(campusFlightBounds(bounds, start[0]), {
    padding: 20,
    maxZoom: 17,
    bearing: 0,
  });
  if (!camera) {
    onFinish();
    return () => {};
  }
  const finish = () => {
    map.off('moveend', finish);
    onFinish();
  };
  map.once('moveend', finish);
  const options = {
    ...camera,
    bearing: 0,
    roll: 0,
    pitch: threeD ? (innerWidth < 768 ? 40 : 45) : 0,
    duration: matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : campusFlightDuration(start, campusCenter(bounds)),
  };
  // MapLibre's globe flight uses acos(dot) without clamping: an almost
  // identical centre can yield NaN. A straight zoom needs no flight arc.
  const center = camera.center;
  const target: [number, number] = !center ? campusCenter(bounds) : Array.isArray(center)
    ? center : ['lng' in center ? center.lng : center.lon, center.lat];
  if (flightDistance(start, target) < 0.001)
    map.easeTo(options);
  else map.flyTo(options);
  return () => {
    map.off('moveend', finish);
    map.stop();
  };
}
