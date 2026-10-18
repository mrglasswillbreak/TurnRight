import type { Map as MapInstance } from 'maplibre-gl';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useMotionSession } from './MotionAssistance';
import { DEFAULT_CAMPUS, rememberPublicCampus } from './campus-context';
import { resolvePlaceIds } from './map-display';
import {
  activatePending,
  getPreference,
  latestPackage,
  loadCampus,
  setPreference,
} from './offline';
import { flushSurveyRecovery, surveyRecordingActive } from './update-safety';
import { useGps } from './useGps';
import { useRoutes } from './useRoutes';
import { useVoiceGuidance } from './useVoiceGuidance';

import type { PublicAppStateBindings } from './usePublicAppState';
type Inputs = Pick<
  PublicAppStateBindings,
  | 'campusScope'
  | 'data'
  | 'setData'
  | 'manifest'
  | 'setManifest'
  | 'setLatest'
  | 'setLoadError'
  | 'toast'
  | 'setToast'
  | 'query'
  | 'category'
  | 'selected'
  | 'setUpdateReady'
  | 'installingUpdate'
  | 'setInstallingUpdate'
  | 'panelContent'
  | 'saved'
  | 'setSaved'
  | 'recent'
  | 'setRecent'
  | 'savedOnly'
  | 'refreshDrafts'
  | 'setDownloaded'
  | 'setOnline'
  | 'setSwReady'
  | 'activeLeg'
  | 'routeView'
  | 'routes'
  | 'chosen'
  | 'routeError'
  | 'navigating'
  | 'nav'
  | 'muted'
  | 'setMuted'
  | 'clock'
  | 'voice'
  | 'rerouting'
  | 'setVoiceMode'
  | 'updateSW'
  | 'navigatingRef'
  | 'requestedReload'
>;
export function usePublicOfflineLifecycle({
  campusScope,
  data,
  setData,
  manifest,
  setManifest,
  setLatest,
  setLoadError,
  toast,
  setToast,
  query,
  category,
  selected,
  setUpdateReady,
  installingUpdate,
  setInstallingUpdate,
  panelContent,
  saved,
  setSaved,
  recent,
  setRecent,
  savedOnly,
  refreshDrafts,
  setDownloaded,
  setOnline,
  setSwReady,
  activeLeg,
  routeView,
  routes,
  chosen,
  routeError,
  navigating,
  nav,
  muted,
  setMuted,
  clock,
  voice,
  rerouting,
  setVoiceMode,
  updateSW,
  navigatingRef,
  requestedReload,
}: Inputs) {
  const installAppUpdate = async () => {
    if (navigatingRef.current || installingUpdate) return;
    setInstallingUpdate(true);
    try {
      await flushSurveyRecovery();
      const registration = await navigator.serviceWorker.getRegistration();
      if (navigatingRef.current) return;
      requestedReload.current = true;
      if (registration?.waiting) await updateSW.current?.(true);
      else location.reload();
    } catch (error) {
      requestedReload.current = false;
      setToast(
        error instanceof Error
          ? error.message
          : 'Could not install the update. Try again.',
      );
    } finally {
      setInstallingUpdate(false);
    }
  };
  navigatingRef.current = navigating;
  const gps = useGps(),
    calculate = useRoutes();
  const journey = routes[chosen];
  const currentRoute = navigating
    ? journey?.legs?.[activeLeg] || journey
    : journey;
  const repeatDirections = useVoiceGuidance(
    voice.current,
    navigating && currentRoute
      ? {
          route: currentRoute,
          nav,
          fix: gps.fix,
          destination:
            currentRoute.mode === 'driving'
              ? currentRoute.parkingName || ''
              : selected?.name || '',
          arrivalKind: currentRoute.arrivalKind || selected?.arrivalKind,
          rerouting,
          routeFailed: !!routeError && nav.offRouteSince !== null,
          now: clock,
        }
      : null,
    muted,
    setToast,
  );
  useMotionSession(gps.tracking || (navigating && !nav.arrived));
  useEffect(() => {
    panelContent.current?.scrollTo(0, 0);
  }, [
    selected?.id,
    routeView,
    navigating,
    query,
    category,
    savedOnly,
    panelContent,
  ]);
  const [checkingDownload, setCheckingDownload] = useState(false);
  const [campusMap, setCampusMap] = useState<MapInstance | null>(null);
  const downloadGeneration = useRef(0);
  const reloadData = () => {
    const generation = ++downloadGeneration.current;
    return loadCampus(
      location.pathname.startsWith('/admin')
        ? DEFAULT_CAMPUS
        : campusScope.current,
    )
      .then((result) => {
        if (generation !== downloadGeneration.current) return;
        if (!location.pathname.startsWith('/admin'))
          rememberPublicCampus(result.manifest.campus?.slug || DEFAULT_CAMPUS);
        setData(result.data);
        setManifest(result.manifest);
        setDownloaded(result.downloaded);
        setCheckingDownload(!!result.verification);
        setLoadError('');
        void result.verification?.then((complete) => {
          if (generation === downloadGeneration.current) {
            setDownloaded(complete);
            setCheckingDownload(false);
          }
        });
      })
      .catch((e) => {
        if (generation === downloadGeneration.current) {
          setLoadError(e.message);
          setCheckingDownload(false);
        }
      });
  };
  const checkUpdates = async (announce = false) => {
    const campus = campusScope.current;
    try {
      const next = await latestPackage(campus);
      if (campusScope.current !== campus) return;
      setLatest(next);
      if (announce)
        setToast(
          next.version === manifest?.version
            ? 'Your campus map is up to date.'
            : 'A new campus map is available in Offline Maps.',
        );
    } catch (e) {
      if (announce && campusScope.current === campus)
        setToast((e as Error).message);
    }
  };
  const checkUpdatesEvent = useEffectEvent(checkUpdates);
  const reloadDataEvent = useEffectEvent(reloadData);
  const refreshDraftsEvent = useEffectEvent(refreshDrafts);
  useEffect(() => {
    const campus = campusScope.current;
    void activatePending(campus)
      .catch(() => false)
      .then(() => {
        if (campusScope.current === campus) return reloadDataEvent();
      });
    void checkUpdatesEvent();
    getPreference('saved', [] as string[], campus).then((ids) => {
      if (campusScope.current === campus) setSaved(ids);
    });
    getPreference('recent', [] as string[], campus).then((ids) => {
      if (campusScope.current === campus) setRecent(ids);
    });
    getPreference('muted', false).then(setMuted);
    refreshDraftsEvent();
    if ('serviceWorker' in navigator) {
      let registration: ServiceWorkerRegistration | undefined;
      const checkAppUpdate = () => {
        if (navigator.onLine && !document.hidden)
          void registration?.update().catch(() => {});
      };
      updateSW.current = registerSW({
        immediate: true,
        onRegisteredSW(_url, nextRegistration) {
          registration = nextRegistration;
        },
        onNeedReload() {
          if (
            requestedReload.current &&
            !navigatingRef.current &&
            !surveyRecordingActive()
          )
            location.reload();
          else setUpdateReady(true);
        },
        onNeedRefresh() {
          setUpdateReady(true);
        },
        onOfflineReady() {
          setSwReady(!!navigator.serviceWorker.controller);
        },
      });
      const control = () => setSwReady(!!navigator.serviceWorker.controller);
      navigator.serviceWorker.addEventListener('controllerchange', control);
      const updateInterval = window.setInterval(checkAppUpdate, 60_000);
      window.addEventListener('online', checkAppUpdate);
      window.addEventListener('focus', checkAppUpdate);
      document.addEventListener('visibilitychange', checkAppUpdate);
      return () => {
        clearInterval(updateInterval);
        window.removeEventListener('online', checkAppUpdate);
        window.removeEventListener('focus', checkAppUpdate);
        document.removeEventListener('visibilitychange', checkAppUpdate);
        navigator.serviceWorker.removeEventListener(
          'controllerchange',
          control,
        );
      };
    }
  }, [
    setSwReady,
    updateSW,
    setRecent,
    requestedReload,
    setMuted,
    campusScope,
    navigatingRef,
    setSaved,
    setUpdateReady,
  ]);
  useEffect(() => {
    const on = () => {
        setOnline(true);
        void checkUpdatesEvent();
      },
      off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [manifest?.version, setOnline]);
  useEffect(() => {
    voice.current.muted = muted;
    if (muted) voice.current.stop();
  }, [muted, voice]);
  const packageVersion = manifest?.version;
  useEffect(() => {
    if (!data) return;
    for (const [key, ids, set] of [
      ['saved', saved, setSaved],
      ['recent', recent, setRecent],
    ] as const) {
      const next = resolvePlaceIds(data, ids);
      if (JSON.stringify(next) !== JSON.stringify(ids)) {
        set(next);
        void setPreference(key, next, campusScope.current).catch(() =>
          setToast(
            'Place links updated for this session. Storage could not save the change.',
          ),
        );
      }
    }
  }, [data, saved, recent, campusScope, setSaved, setRecent, setToast]);
  useEffect(() => {
    let cancelled = false;
    if (packageVersion)
      void voice.current
        .load(packageVersion)
        .then((mode) => {
          if (!cancelled) setVoiceMode(mode);
        })
        .catch(() => {
          if (!cancelled) setVoiceMode('unavailable');
        });
    return () => {
      cancelled = true;
    };
  }, [packageVersion, setVoiceMode, voice]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 9000);
    return () => clearTimeout(timeout);
  }, [toast, setToast]);
  return {
    installAppUpdate,
    gps,
    calculate,
    journey,
    currentRoute,
    repeatDirections,
    checkingDownload,
    setCheckingDownload,
    campusMap,
    setCampusMap,
    downloadGeneration,
    reloadData,
    checkUpdates,
  };
}
export type PublicOfflineLifecycleBindings = ReturnType<
  typeof usePublicOfflineLifecycle
>;
