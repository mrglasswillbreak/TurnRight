import { useEffect, useEffectEvent } from 'react';
import { DEFAULT_CAMPUS } from './campus-context';
import { initialNavigation } from './navigation';
import { activatePending } from './offline';
import { publicMapPadding } from './public-map-layout';
import { placeHasConnection } from './routing';
import type { Position } from './types';
import type { CampusSession } from './useCampusSwitch';

import type { PublicAppStateBindings } from './usePublicAppState';
import type { PublicOfflineLifecycleBindings } from './usePublicOfflineLifecycle';
import type { PublicSearchBindings } from './usePublicSearch';
type Inputs = Pick<
  PublicAppStateBindings,
  | 'campusScope'
  | 'data'
  | 'setData'
  | 'setManifest'
  | 'setLatest'
  | 'setLoadError'
  | 'setToast'
  | 'setQuery'
  | 'setCategory'
  | 'setUnlinkedBuilding'
  | 'selected'
  | 'setSelected'
  | 'setFollow'
  | 'entranceId'
  | 'setEntranceId'
  | 'setSearching'
  | 'setShareFallback'
  | 'setSharedLinkMissing'
  | 'sharedLinkOpened'
  | 'setSaved'
  | 'setRecent'
  | 'setSavedOnly'
  | 'setReportDrafts'
  | 'startRequested'
  | 'setDialog'
  | 'setReportPin'
  | 'setDownloaded'
  | 'travelMode'
  | 'parkingId'
  | 'setParkingId'
  | 'setActiveLeg'
  | 'routeView'
  | 'setRouteView'
  | 'routes'
  | 'setRoutes'
  | 'setChosen'
  | 'origin'
  | 'setOrigin'
  | 'busy'
  | 'setBusy'
  | 'setRouteError'
  | 'setNavigating'
  | 'setNav'
  | 'map'
  | 'voice'
  | 'routeRequest'
  | 'setRerouting'
  | 'setPreviewingVoice'
  | 'setVoicePreviewFeedback'
> &
  Pick<
    PublicOfflineLifecycleBindings,
    | 'gps'
    | 'calculate'
    | 'journey'
    | 'currentRoute'
    | 'setCheckingDownload'
    | 'downloadGeneration'
    | 'reloadData'
  > &
  Pick<PublicSearchBindings, 'setSelectedStreet'>;
export function usePublicRouting({
  campusScope,
  data,
  setData,
  setManifest,
  setLatest,
  setLoadError,
  setToast,
  setQuery,
  setCategory,
  setUnlinkedBuilding,
  selected,
  setSelected,
  setFollow,
  entranceId,
  setEntranceId,
  setSearching,
  setShareFallback,
  setSharedLinkMissing,
  sharedLinkOpened,
  setSaved,
  setRecent,
  setSavedOnly,
  setReportDrafts,
  startRequested,
  setDialog,
  setReportPin,
  setDownloaded,
  travelMode,
  parkingId,
  setParkingId,
  setActiveLeg,
  routeView,
  setRouteView,
  routes,
  setRoutes,
  setChosen,
  origin,
  setOrigin,
  busy,
  setBusy,
  setRouteError,
  setNavigating,
  setNav,
  map,
  voice,
  routeRequest,
  setRerouting,
  setPreviewingVoice,
  setVoicePreviewFeedback,
  gps,
  calculate,
  journey,
  currentRoute,
  setCheckingDownload,
  downloadGeneration,
  reloadData,
  setSelectedStreet,
}: Inputs) {
  const previewRoute = async (
    from = origin,
    mode = travelMode,
    parking = parkingId,
    entrance = entranceId,
  ) => {
    startRequested.current = false;
    if (!data || !selected) return;
    setRouteView(true);
    setBusy(false);
    setRouteError('');
    setOrigin(from);
    setRoutes([]);
    setChosen(0);
    const request = ++routeRequest.current;
    if (mode === 'walking' && !placeHasConnection(data, selected)) {
      setRouteError(
        'A walking connection for this place has not been mapped. You can report a missing path or entrance.',
      );
      return;
    }
    let source: string | Position | { placeId: string } | undefined;
    if (from === 'gps') {
      source = gps.fix?.coordinates;
      if (!source || Date.now() - gps.fix!.timestamp > 12000) {
        setRouteError(
          'Waiting for your location. You can also choose a mapped starting place above.',
        );
        return;
      }
    } else {
      gps.stop();
      source = data.places.some(
        (p) =>
          p.id === from && (mode === 'driving' || placeHasConnection(data, p)),
      )
        ? { placeId: from }
        : undefined;
    }
    if (!source) {
      setRouteError('Choose a mapped starting place.');
      return;
    }
    setBusy(true);
    try {
      const result = await calculate(
        data,
        source,
        { placeId: selected.id, entranceId: entrance || undefined },
        mode,
        parking || undefined,
      );
      if (request !== routeRequest.current) return;
      setRoutes(result);
      setChosen(0);
      const points = result[0].coordinates;
      map.current?.setPadding(publicMapPadding(map.current.getContainer()));
      if (points.length > 1)
        map.current?.fitBounds(
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
            padding: 20,
            maxZoom: 18,
          },
        );
    } catch (e) {
      if (request === routeRequest.current) setRouteError((e as Error).message);
    } finally {
      if (request === routeRequest.current) setBusy(false);
    }
  };
  const previewGps = useEffectEvent(() => {
    if (
      routeView &&
      origin === 'gps' &&
      !routes.length &&
      !busy &&
      gps.fix &&
      Date.now() - gps.fix.timestamp < 12000
    )
      void previewRoute('gps');
  });
  useEffect(() => previewGps(), [gps.fix?.timestamp]);
  const startNavigation = async () => {
    const request = ++routeRequest.current;
    await voice.current
      .unlock()
      .catch(() =>
        setToast(
          'Audio could not start. On-screen directions remain available.',
        ),
      );
    gps.start();
    if (
      !gps.fix ||
      Date.now() - gps.fix.timestamp > 12000 ||
      gps.fix.accuracy > 35
    ) {
      startRequested.current = true;
      setRouteError(
        'Waiting for a fresh, accurate location to start navigation. Keep the app visible and allow location access.',
      );
      return;
    }
    if (!selected || !data) return;
    setBusy(true);
    try {
      const live = await calculate(
        data,
        gps.fix.coordinates,
        {
          placeId: selected.id,
          entranceId: entranceId || journey?.destinationEntranceId,
        },
        travelMode,
        journey?.parkingId || parkingId || undefined,
      );
      if (request !== routeRequest.current) return;
      const matching = live.findIndex((r) => r.id === currentRoute?.id);
      setRoutes(live);
      setActiveLeg(0);
      setChosen(Math.max(0, matching));
      setNav(initialNavigation);
      setNavigating(true);
      setFollow(true);
      setRerouting(false);
      setRouteError('');
    } catch (e) {
      if (request === routeRequest.current) setRouteError((e as Error).message);
    } finally {
      if (request === routeRequest.current) setBusy(false);
    }
  };
  const finishStart = useEffectEvent(() => {
    if (
      startRequested.current &&
      routeView &&
      gps.fix &&
      gps.fix.accuracy <= 35 &&
      Date.now() - gps.fix.timestamp < 12000
    ) {
      startRequested.current = false;
      void startNavigation();
    }
  });
  useEffect(() => finishStart(), [gps.fix?.timestamp]);
  const stopNavigation = async () => {
    const campus = campusScope.current;
    startRequested.current = false;
    routeRequest.current++;
    setNavigating(false);
    setRerouting(false);
    setFollow(false);
    gps.stop();
    voice.current.stop();
    setNav(initialNavigation);
    if ((await activatePending(campus)) && campus === campusScope.current) {
      await reloadData();
      setSelected(null);
      setRouteView(false);
      setRoutes([]);
      setToast('Your downloaded map update is now active.');
    }
  };
  const commitCampus = ({
    result,
    saved,
    recent,
    reportDrafts,
  }: CampusSession) => {
    campusScope.current = result.manifest.campus?.slug || DEFAULT_CAMPUS;
    const generation = ++downloadGeneration.current;
    routeRequest.current++;
    startRequested.current = false;
    gps.stop();
    voice.current.stop();
    sharedLinkOpened.current = '';
    setData(result.data);
    setManifest(result.manifest);
    setLatest(null);
    setDownloaded(result.downloaded);
    setCheckingDownload(!!result.verification);
    void result.verification?.then((complete) => {
      if (downloadGeneration.current === generation) {
        setDownloaded(complete);
        setCheckingDownload(false);
      }
    });
    setSaved(saved);
    setRecent(recent);
    setReportDrafts(reportDrafts);
    setSelected(null);
    setSelectedStreet(null);
    setUnlinkedBuilding(null);
    setQuery('');
    setCategory('all');
    setSavedOnly(false);
    setSearching(false);
    setEntranceId('');
    setParkingId('');
    setOrigin('gps');
    setChosen(0);
    setActiveLeg(0);
    setRoutes([]);
    setRouteView(false);
    setNavigating(false);
    setNav(initialNavigation);
    setBusy(false);
    setRerouting(false);
    setFollow(false);
    setDialog(null);
    setReportPin(undefined);
    setShareFallback('');
    setSharedLinkMissing(false);
    setLoadError('');
    setToast('');
    setRouteError('');
    setVoicePreviewFeedback('');
    setPreviewingVoice(false);
  };
  return { previewRoute, startNavigation, stopNavigation, commitCampus };
}
export type PublicRoutingBindings = ReturnType<typeof usePublicRouting>;
