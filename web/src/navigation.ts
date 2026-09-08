import { closestProgress, distance } from "./geo";
import type { GpsFix, Route } from "./types";
export interface NavigationState {
  progress: number;
  nextIndex: number;
  offRouteSince: number | null;
  reroute: boolean;
  arrived: boolean;
  quality: "good" | "weak" | "stale";
  arrivalFixes: number;
  lastFixTime: number;
}
export const initialNavigation: NavigationState = {
  progress: 0,
  nextIndex: 1,
  offRouteSince: null,
  reroute: false,
  arrived: false,
  quality: "good",
  arrivalFixes: 0,
  lastFixTime: 0,
};
export function advanceNavigation(
  route: Route,
  fix: GpsFix,
  state: NavigationState,
  now = Date.now(),
): NavigationState {
  if (now - fix.timestamp > 12000)
    return { ...state, quality: "stale", reroute: false, offRouteSince: null, arrivalFixes: 0 };
  if (fix.accuracy > 35 || fix.accuracy <= 0)
    return { ...state, quality: "weak", reroute: false, offRouteSince: null, arrivalFixes: 0 };
  if (fix.timestamp <= state.lastFixTime) return state;
  const match = closestProgress(fix.coordinates, route.coordinates, state.progress);
  const offRoute = match.distance > Math.max(22, fix.accuracy * 1.4);
  const offRouteSince = offRoute ? (state.offRouteSince ?? now) : null;
  const progress = offRoute
    ? state.progress
    : Math.min(route.distance, Math.max(0, match.progress));
  const nextIndex = Math.max(
    1,
    route.maneuvers.findIndex((m, index) => index > 0 && m.at > progress + 5),
  );
  const atEnd =
    !offRoute &&
    route.distance - progress < 12 &&
    distance(fix.coordinates, route.coordinates.at(-1)!) < Math.min(20, Math.max(10, fix.accuracy));
  const arrivalFixes = atEnd ? state.arrivalFixes + 1 : 0;
  return {
    progress,
    nextIndex: route.distance - progress <= 8 ? route.maneuvers.length - 1 : nextIndex,
    offRouteSince,
    reroute: offRouteSince !== null && now - offRouteSince >= 8000,
    arrived: arrivalFixes >= 3,
    quality: "good",
    arrivalFixes,
    lastFixTime: fix.timestamp,
  };
}
