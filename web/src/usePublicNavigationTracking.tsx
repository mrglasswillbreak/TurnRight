import { useEffect } from 'react';
import { advanceNavigation, initialNavigation } from './navigation';

import type { PublicAppStateBindings } from './usePublicAppState';
import type { PublicOfflineLifecycleBindings } from './usePublicOfflineLifecycle';
type Inputs = Pick<
  PublicAppStateBindings,
  | 'data'
  | 'setToast'
  | 'selected'
  | 'entranceId'
  | 'setActiveLeg'
  | 'setRoutes'
  | 'setChosen'
  | 'setRouteError'
  | 'navigating'
  | 'nav'
  | 'setNav'
  | 'clock'
  | 'setClock'
  | 'voice'
  | 'routeRequest'
  | 'rerouteAt'
  | 'setRerouting'
  | 'navigatingRef'
> &
  Pick<
    PublicOfflineLifecycleBindings,
    'gps' | 'calculate' | 'journey' | 'currentRoute'
  >;
export function usePublicNavigationTracking({
  data,
  setToast,
  selected,
  entranceId,
  setActiveLeg,
  setRoutes,
  setChosen,
  setRouteError,
  navigating,
  nav,
  setNav,
  clock,
  setClock,
  voice,
  routeRequest,
  rerouteAt,
  setRerouting,
  navigatingRef,
  gps,
  calculate,
  journey,
  currentRoute,
}: Inputs) {
  useEffect(() => {
    if (!navigating) return;
    const interval = setInterval(() => setClock(Date.now()), 3000);
    let lock: WakeLockSentinel | undefined,
      disposed = false;
    const wake = async () => {
      if (document.hidden) {
        voice.current.stop();
        return;
      }
      try {
        const next = await navigator.wakeLock?.request('screen');
        if (disposed) await next?.release();
        else lock = next;
      } catch {
        /* optional device capability */
      }
    };
    void wake();
    document.addEventListener('visibilitychange', wake);
    return () => {
      disposed = true;
      clearInterval(interval);
      void lock?.release();
      document.removeEventListener('visibilitychange', wake);
    };
  }, [navigating, setClock, voice]);
  useEffect(() => {
    if (navigating && currentRoute && gps.fix)
      setNav((previous) =>
        advanceNavigation(currentRoute, gps.fix!, previous, clock),
      );
  }, [gps.fix, clock, navigating, currentRoute, setNav]);
  const stopGps = gps.stop;
  useEffect(() => {
    if (navigating && nav.arrived) stopGps();
  }, [navigating, nav.arrived, stopGps]);
  useEffect(() => {
    if (
      !nav.reroute ||
      !navigating ||
      !gps.fix ||
      !selected ||
      !data ||
      Date.now() - rerouteAt.current < 15000
    )
      return;
    rerouteAt.current = Date.now();
    const request = ++routeRequest.current;
    setRerouting(true);
    setRouteError('');
    calculate(
      data,
      gps.fix.coordinates,
      {
        placeId: selected.id,
        entranceId: entranceId || journey?.destinationEntranceId,
      },
      currentRoute?.mode || 'walking',
      journey?.parkingId,
    )
      .then((next) => {
        if (request !== routeRequest.current || !navigatingRef.current) return;
        setRoutes(next);
        setActiveLeg(0);
        setChosen(0);
        setNav(initialNavigation);
        setRerouting(false);
        setRouteError('');
        setToast('Route updated.');
      })
      .catch((e) => {
        if (request !== routeRequest.current || !navigatingRef.current) return;
        setRerouting(false);
        setRouteError(e.message);
        setToast(e.message);
      });
  }, [
    nav.reroute,
    gps.fix,
    navigating,
    data,
    selected,
    calculate,
    currentRoute?.mode,
    journey?.parkingId,
    journey?.destinationEntranceId,
    entranceId,
    setChosen,
    navigatingRef,
    rerouteAt,
    setRouteError,
    setRerouting,
    routeRequest,
    setNav,
    setRoutes,
    setToast,
    setActiveLeg,
  ]);
  return {};
}
export type PublicNavigationTrackingBindings = ReturnType<
  typeof usePublicNavigationTracking
>;
