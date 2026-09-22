import { bearing, closestProgress, distance, projectSegment } from './geo';
import type { GpsFix, Route } from './types';
export interface NavigationState {
  progress: number;
  nextIndex: number;
  offRouteSince: number | null;
  reroute: boolean;
  arrived: boolean;
  quality: 'good' | 'weak' | 'stale';
  arrivalFixes: number;
  lastFixTime: number;
}
export const initialNavigation: NavigationState = {
  progress: 0,
  nextIndex: 1,
  offRouteSince: null,
  reroute: false,
  arrived: false,
  quality: 'good',
  arrivalFixes: 0,
  lastFixTime: 0,
};
function drivingProgress(route: Route, fix: GpsFix, previous: number) {
  let along = 0;
  let best = { score: Infinity, distance: Infinity, progress: previous };
  for (let i = 1; i < route.coordinates.length; i++) {
    const a = route.coordinates[i - 1],
      b = route.coordinates[i];
    const length = distance(a, b),
      projection = projectSegment(fix.coordinates, a, b);
    const progress = along + projection.t * length;
    const headingPenalty =
      fix.heading !== null && (fix.speed ?? 0) > 2
        ? (Math.abs(((bearing(a, b) - fix.heading + 540) % 360) - 180) / 180) *
          20
        : 0;
    const score =
      projection.distance +
      headingPenalty +
      Math.max(0, previous - progress - 15) * 0.6;
    if (score < best.score)
      best = { score, distance: projection.distance, progress };
    along += length;
  }
  return best;
}
export function advanceNavigation(
  route: Route,
  fix: GpsFix,
  state: NavigationState,
  now = Date.now(),
): NavigationState {
  if (now - fix.timestamp > 12000)
    return {
      ...state,
      quality: 'stale',
      reroute: false,
      offRouteSince: null,
      arrivalFixes: 0,
    };
  if (fix.accuracy > 35 || fix.accuracy <= 0)
    return {
      ...state,
      quality: 'weak',
      reroute: false,
      offRouteSince: null,
      arrivalFixes: 0,
    };
  if (fix.timestamp <= state.lastFixTime) return state;
  const driving = route.mode === 'driving';
  const match =
    route.coordinates.length === 1
      ? {
          progress: 0,
          distance: distance(fix.coordinates, route.coordinates[0]),
        }
      : driving
        ? drivingProgress(route, fix, state.progress)
        : closestProgress(fix.coordinates, route.coordinates, state.progress);
  const offRoute =
    match.distance >
    Math.max(driving ? 18 : 22, fix.accuracy * (driving ? 1.2 : 1.4));
  const offRouteSince = offRoute ? (state.offRouteSince ?? now) : null;
  const progress = offRoute
    ? state.progress
    : Math.min(route.distance, Math.max(0, match.progress));
  const nextIndex = Math.max(
    1,
    route.maneuvers.findIndex((m, index) => index > 0 && m.at >= progress - 5),
  );
  const atEnd =
    (!driving || fix.speed === null || fix.speed < 2) &&
    !offRoute &&
    route.distance - progress < 12 &&
    distance(fix.coordinates, route.coordinates.at(-1)!) <
      Math.min(20, Math.max(10, fix.accuracy));
  const arrivalFixes = atEnd ? state.arrivalFixes + 1 : 0;
  return {
    progress,
    nextIndex,
    offRouteSince,
    reroute:
      offRouteSince !== null && now - offRouteSince >= (driving ? 5000 : 8000),
    arrived: arrivalFixes >= 3,
    quality: 'good',
    arrivalFixes,
    lastFixTime: fix.timestamp,
  };
}
