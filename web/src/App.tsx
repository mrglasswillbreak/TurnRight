import { placeHasConnection } from './routing';
import { destinationLink, sharedDestination } from './destination-sharing';
import { flushSurveyRecovery, surveyRecordingActive } from './update-safety';
import {
  lazy,
  Suspense,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowUpRight,
  ArrowLeft,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Compass,
  Download,
  Flag,
  GraduationCap,
  Heart,
  LocateFixed,
  MapPin,
  Navigation,
  Plus,
  Search,
  Shield,
  WifiOff,
  X,
  Settings,
  Info,
  Utensils,
  Share2,
  Copy,
} from 'lucide-react';
import type { Map as MapInstance } from 'maplibre-gl';
import { registerSW } from 'virtual:pwa-register';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MapView } from './MapView';
import { MapViewControl } from './MapViewControl';
import { useIsMobile } from '@/hooks/use-mobile';
import { SheetHandle, useSheetSize } from './ResizableSheet';
import { AppUpdateNotice } from './AppUpdateNotice';
import { publicMapPadding } from './public-map-layout';
import { ResultTap } from './result-tap';
import { CAMPUS_MIN_ZOOM, returnToCampus } from './world-map';
import './public-dock.css';
import { MapRenderingSettings, useSimple3D } from './MapRenderingSettings';
import { AppearanceSettings } from './AppearanceSettings';
import type { Feature } from 'geojson';
import { buildingPlace, resolvePlaceId, resolvePlaceIds } from './map-display';
import { BuildingVisualDetails } from './BuildingVisualDetails';
import { useMapViewPreference } from './useMapViewPreference';
import {
  activatePending,
  getPreference,
  latestPackage,
  loadCampus,
  setPreference,
} from './offline';
import { OfflinePanel } from './OfflinePanel';
import { ReportForm } from './ReportForm';
import { RoutePanel } from './RoutePanel';
import { OfflineVoice } from './audio';
import { useVoiceGuidance } from './useVoiceGuidance';
import { advanceNavigation, initialNavigation } from './navigation';
import { useGps } from './useGps';
import { MotionStatus, useMotionSession } from './MotionAssistance';
import { motionService } from './motion-service';
import { useRoutes } from './useRoutes';
import { useWebMcp } from './useWebMcp';
import { useAppearance } from './useAppearance';
import type {
  CampusData,
  CampusPackage,
  Category,
  Place,
  Position,
  Route,
} from './types';
const Admin = lazy(() => import('./Admin'));
const categories: {
  id: Category | 'all';
  label: string;
  Icon: typeof Building2;
}[] = [
  { id: 'all', label: 'All places', Icon: Compass },
  { id: 'academic', label: 'Academics', Icon: GraduationCap },
  { id: 'library', label: 'Libraries', Icon: BookOpen },
  { id: 'food', label: 'Food', Icon: Utensils },
  { id: 'services', label: 'Services', Icon: Building2 },
  { id: 'residence', label: 'Residences', Icon: Building2 },
  { id: 'worship', label: 'Worship', Icon: MapPin },
  { id: 'sports', label: 'Sports', Icon: Flag },
];
export default function App() {
  const { preference: appearance, dark, setAppearance } = useAppearance();
  const [data, setData] = useState<CampusData | null>(null),
    [manifest, setManifest] = useState<CampusPackage | null>(null),
    [latest, setLatest] = useState<CampusPackage | null>(null);
  const [loadError, setLoadError] = useState(''),
    [toast, setToast] = useState(''),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState('all');
  const [threeD, setThreeD] = useMapViewPreference();
  const [simple3D, setSimple3D] = useSimple3D();
  const [unlinkedBuilding, setUnlinkedBuilding] = useState<Feature | null>(
    null,
  );
  const [selected, setSelected] = useState<Place | null>(null),
    [follow, setFollow] = useState(false);
  const [worldView, setWorldView] = useState(false);
  const mobileMapControls = useIsMobile(
    '(max-width: 767px), (max-width: 1000px) and (max-height: 500px)',
  );
  const [updateReady, setUpdateReady] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [searching, setSearching] = useState(false);
  const mobileSearch = mobileMapControls && searching;
  // Leave space for both rows of map controls above the expanded mobile card.
  const panelSheet = useSheetSize(
    'search',
    96,
    true,
    mobileMapControls ? (updateReady ? 288 : 208) : 32,
    !mobileMapControls,
    mobileSearch,
  );
  const dialogSheet = useSheetSize(
    'dialogs',
    220,
    false,
    32,
    !mobileMapControls,
  );
  const panelExpanded = panelSheet.expanded;
  const setPanelExpanded = panelSheet.setExpanded;
  const [shareFallback, setShareFallback] = useState('');
  const [sharedLinkMissing, setSharedLinkMissing] = useState(false);
  const sharedLinkOpened = useRef('');
  const searchInput = useRef<HTMLInputElement>(null);
  const panelContent = useRef<HTMLDivElement>(null);
  const resultTap = useRef(new ResultTap());
  const [saved, setSaved] = useState<string[]>([]),
    [recent, setRecent] = useState<string[]>([]),
    [savedOnly, setSavedOnly] = useState(false);
  const [reportDrafts, setReportDrafts] = useState<
    { key: string; name: string; placeId?: string; coordinates: Position }[]
  >([]);
  const refreshDrafts = () => {
    void getPreference<typeof reportDrafts>('report-drafts', []).then(
      setReportDrafts,
    );
  };
  const startRequested = useRef(false);
  const [dialog, setDialog] = useState<
      'offline' | 'settings' | 'report' | 'building' | null
    >(null),
    [reportPin, setReportPin] = useState<Position | undefined>();
  const openDialogAtFullHeight = useEffectEvent(() => {
    if (!mobileMapControls) dialogSheet.setExpanded(true);
  });
  useEffect(() => {
    if (dialog) openDialogAtFullHeight();
  }, [dialog]);
  const [downloaded, setDownloaded] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [swReady, setSwReady] = useState(!!navigator.serviceWorker?.controller);
  const [routeView, setRouteView] = useState(false),
    [routes, setRoutes] = useState<Route[]>([]),
    [chosen, setChosen] = useState(0),
    [origin, setOrigin] = useState('gps'),
    [busy, setBusy] = useState(false),
    [routeError, setRouteError] = useState('');
  const [navigating, setNavigating] = useState(false),
    [nav, setNav] = useState(initialNavigation),
    [muted, setMuted] = useState(false),
    [clock, setClock] = useState(Date.now());
  const map = useRef<MapInstance | null>(null),
    voice = useRef(new OfflineVoice()),
    routeRequest = useRef(0),
    rerouteAt = useRef(0);
  const [rerouting, setRerouting] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState(false);
  const [voicePreviewFeedback, setVoicePreviewFeedback] = useState('');
  const [voiceMode, setVoiceMode] = useState<
    'natural' | 'basic' | 'unavailable'
  >('natural');
  const updateSW = useRef<((reload?: boolean) => Promise<void>) | null>(null),
    navigatingRef = useRef(false);
  const requestedReload = useRef(false);
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
  const currentRoute = routes[chosen];
  const repeatDirections = useVoiceGuidance(
    voice.current,
    navigating && currentRoute
      ? {
          route: currentRoute,
          nav,
          fix: gps.fix,
          destination: selected?.name || '',
          arrivalKind: currentRoute.arrivalKind || selected?.arrivalKind,
          rerouting,
          routeFailed: !!routeError && nav.offRouteSince !== null,
          now: clock,
        }
      : null,
    muted,
    setToast,
  );
  useMotionSession(navigating && !nav.arrived);
  useEffect(() => {
    panelContent.current?.scrollTo(0, 0);
  }, [selected?.id, routeView, navigating, query, category, savedOnly]);
  const reloadData = () =>
    loadCampus()
      .then((result) => {
        setData(result.data);
        setManifest(result.manifest);
        setDownloaded(result.downloaded);
        setLoadError('');
      })
      .catch((e) => setLoadError(e.message));
  const checkUpdates = async (announce = false) => {
    try {
      const next = await latestPackage();
      setLatest(next);
      if (announce)
        setToast(
          next.version === manifest?.version
            ? 'Your campus map is up to date.'
            : 'A new campus map is available in Offline Maps.',
        );
    } catch (e) {
      if (announce) setToast((e as Error).message);
    }
  };
  const checkUpdatesEvent = useEffectEvent(checkUpdates);
  useEffect(() => {
    void activatePending()
      .catch(() => false)
      .then(reloadData);
    void checkUpdatesEvent();
    getPreference('saved', [] as string[]).then(setSaved);
    getPreference('recent', [] as string[]).then(setRecent);
    getPreference('muted', false).then(setMuted);
    refreshDrafts();
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
  }, []);
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
  }, [manifest?.version]);
  useEffect(() => {
    voice.current.muted = muted;
    if (muted) voice.current.stop();
  }, [muted]);
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
        void setPreference(key, next).catch(() =>
          setToast(
            'Place links updated for this session. Storage could not save the change.',
          ),
        );
      }
    }
  }, [data, saved, recent]);
  useEffect(() => {
    if (packageVersion)
      void voice.current
        .load(packageVersion)
        .then(setVoiceMode)
        .catch(() => setVoiceMode('unavailable'));
  }, [packageVersion]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 9000);
    return () => clearTimeout(timeout);
  }, [toast]);
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
  }, [navigating]);
  useEffect(() => {
    if (navigating && currentRoute && gps.fix)
      setNav((previous) =>
        advanceNavigation(currentRoute, gps.fix!, previous, clock),
      );
  }, [gps.fix, clock, navigating, currentRoute]);
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
    calculate(data, gps.fix.coordinates, { placeId: selected.id })
      .then((next) => {
        if (request !== routeRequest.current || !navigatingRef.current) return;
        setRoutes(next);
        setChosen(0);
        setNav(initialNavigation);
        setRerouting(false);
        setRouteError('');
        setToast('Walking route updated.');
      })
      .catch((e) => {
        if (request !== routeRequest.current || !navigatingRef.current) return;
        setRerouting(false);
        setRouteError(e.message);
        setToast(e.message);
      });
  }, [nav.reroute, gps.fix, navigating, data, selected, calculate]);
  const places = useMemo(
    () =>
      (data?.places || [])
        .filter(
          (p) =>
            (!savedOnly || saved.includes(p.id)) &&
            (category === 'all' || p.category === category) &&
            `${p.name} ${p.aliases.join(' ')} ${p.department || ''} ${p.faculty || ''}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort(
          (a, b) =>
            Number(recent.includes(b.id)) - Number(recent.includes(a.id)) ||
            Number(/library|senate|health|faculty/i.test(b.name)) -
              Number(/library|senate|health|faculty/i.test(a.name)),
        ),
    [data, query, category, saved, savedOnly, recent],
  );
  const selectPlace = (place: Place) => {
    startRequested.current = false;
    if (navigating) {
      setToast('Finish this walk before choosing a new destination.');
      return;
    }
    setSearching(false);
    searchInput.current?.blur();
    routeRequest.current++;
    setShareFallback('');
    setSharedLinkMissing(false);
    setSelected(place);
    setPanelExpanded(true);
    setBusy(false);
    setRouteView(false);
    setRoutes([]);
    setRouteError('');
    const next = [place.id, ...recent.filter((id) => id !== place.id)].slice(
      0,
      12,
    );
    setRecent(next);
    void setPreference('recent', next);
  };
  const openDestinationLink = useEffectEvent(() => {
    if (!data || location.pathname.startsWith('/admin')) return;
    const stamp = `${location.search}:${data.version}`;
    if (sharedLinkOpened.current === stamp) return;
    const shared = sharedDestination(data, location.href);
    if (navigating && shared.requested) {
      setToast('Finish this walk before opening a shared destination.');
      return;
    }
    sharedLinkOpened.current = stamp;
    if (!shared.requested) return;
    if (shared.place) selectPlace(shared.place);
    else {
      setSharedLinkMissing(true);
      setPanelExpanded(true);
    }
  });
  useEffect(() => {
    openDestinationLink();
    const changed = () => openDestinationLink();
    window.addEventListener('popstate', changed);
    return () => window.removeEventListener('popstate', changed);
  }, [data, navigating]);
  const shareDestination = async (copy = false) => {
    if (!selected) return;
    const url = destinationLink(selected.id, location.origin);
    try {
      if (!copy && navigator.share)
        await navigator.share({
          title: selected.name,
          text: `Find ${selected.name} on TurnRight`,
          url,
        });
      else {
        await navigator.clipboard.writeText(url);
        setToast('Destination link copied.');
      }
      setShareFallback('');
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setShareFallback(url);
      setToast('Select and copy the destination link below.');
    }
  };
  useWebMcp(data, selectPlace, navigating);
  const toggleSaved = () => {
    if (!selected) return;
    const next = saved.includes(selected.id)
      ? saved.filter((id) => id !== selected.id)
      : [...saved, selected.id];
    setSaved(next);
    void setPreference('saved', next);
  };
  const previewRoute = async (from = origin) => {
    startRequested.current = false;
    if (!data || !selected) return;
    setRouteView(true);
    setBusy(false);
    setRouteError('');
    setOrigin(from);
    setRoutes([]);
    setChosen(0);
    const request = ++routeRequest.current;
    if (!placeHasConnection(data, selected)) {
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
        (p) => p.id === from && placeHasConnection(data, p),
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
      const result = await calculate(data, source, { placeId: selected.id });
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
      const live = await calculate(data, gps.fix.coordinates, {
        placeId: selected.id,
      });
      if (request !== routeRequest.current) return;
      const matching = live.findIndex((r) => r.id === currentRoute?.id);
      setRoutes(live);
      setChosen(Math.max(0, matching));
      setNav(initialNavigation);
      setNavigating(true);
      setFollow(true);
      setRerouting(false);
      setRouteError('');
    } catch (e) {
      setRouteError((e as Error).message);
    } finally {
      setBusy(false);
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
    startRequested.current = false;
    routeRequest.current++;
    setNavigating(false);
    setRerouting(false);
    setFollow(false);
    gps.stop();
    voice.current.stop();
    setNav(initialNavigation);
    if (await activatePending()) {
      await reloadData();
      setSelected(null);
      setRouteView(false);
      setRoutes([]);
      setToast('Your downloaded map update is now active.');
    }
  };
  if (!data || !manifest)
    return (
      <main className="loading-screen">
        <div className="brandmark">
          <ArrowUpRight />
        </div>
        <h1>
          TurnRight<span>.</span>
        </h1>
        <p>{loadError || 'Opening LASU campus…'}</p>
        {loadError && <Button onClick={reloadData}>Retry</Button>}
      </main>
    );
  if (location.pathname.startsWith('/admin'))
    return (
      <Suspense
        fallback={<main className="loading-screen">Opening map editor…</main>}
      >
        <Admin
          data={data}
          dark={dark}
          appearance={appearance}
          onAppearance={setAppearance}
          updateReady={updateReady}
          installUpdate={installAppUpdate}
        />
      </Suspense>
    );
  const BrandTag = worldView ? 'button' : 'div';
  const mapControls = (
    <div className="map-controls">
      <MapViewControl
        threeD={threeD}
        onView={(value) => {
          if (!setThreeD(value))
            setToast(
              'Map view changed for this session. Storage could not save your preference.',
            );
        }}
      />
      <div className="control-group">
        <button
          aria-label="Zoom in"
          onClick={() => {
            setFollow(false);
            map.current?.zoomIn();
          }}
        >
          <Plus />
        </button>
        <button
          aria-label="Zoom out"
          onClick={() => {
            setFollow(false);
            map.current?.zoomOut();
          }}
        >
          <span className="minus">−</span>
        </button>
      </div>
      <button
        aria-label="North up"
        onClick={() => {
          motionService().setMode('north');
          setFollow(false);
          map.current?.resetNorth();
        }}
      >
        <Compass />
      </button>
      <button
        aria-label={gps.tracking ? 'Follow me' : 'Find my location'}
        className={follow ? 'active' : ''}
        onClick={() => {
          gps.start();
          setFollow(true);
          if (!gps.fix)
            setToast(
              'Waiting for your location. Allow location access if prompted.',
            );
        }}
      >
        <LocateFixed />
      </button>
    </div>
  );
  return (
    <main
      className={`app-shell ${navigating ? 'is-navigating' : ''}`}
      data-panel-expanded={panelExpanded}
      data-mobile-controls={mobileMapControls}
      data-searching={mobileSearch}
      data-update-ready={updateReady}
      style={panelSheet.style}
      data-panel-view={
        navigating
          ? 'navigation'
          : routeView && selected
            ? 'route'
            : selected
              ? 'detail'
              : 'browse'
      }
    >
      <MapView
        data={data}
        selected={selected}
        routes={routes}
        activeRoute={chosen}
        fix={gps.fix}
        dark={dark}
        threeD={threeD}
        simple={simple3D}
        buildingOpacity={navigating ? 0.65 : 0.92}
        follow={follow}
        motionActive={navigating && !nav.arrived}
        onSelect={selectPlace}
        onBuildingSelect={(feature) => {
          if (navigatingRef.current) return;
          setSelected(null);
          setUnlinkedBuilding(feature);
          setDialog('building');
        }}
        onManualPan={() => setFollow(false)}
        onWorldViewChange={setWorldView}
        onReady={(instance) => {
          map.current = instance;
          instance.on('contextmenu', (e) => {
            if (navigatingRef.current || instance.getZoom() < CAMPUS_MIN_ZOOM)
              return;
            setReportPin([e.lngLat.lng, e.lngLat.lat]);
            setSelected(null);
            setDialog('report');
          });
        }}
      />

      {mapControls}
      {updateReady && (
        <AppUpdateNotice
          navigating={navigating}
          installing={installingUpdate}
          onInstall={installAppUpdate}
        />
      )}
      <BrandTag
        className="public-brand"
        aria-label={worldView ? 'Back to campus' : 'TurnRight · LASU Ojo'}
        onClick={
          worldView
            ? () => {
                setFollow(false);
                if (map.current) returnToCampus(map.current, data.bounds);
              }
            : undefined
        }
      >
        <span className="brandmark">
          <ArrowUpRight />
        </span>
        <span>
          <strong>{worldView ? 'Back to campus' : 'TurnRight'}</strong>
          <small>LASU · OJO</small>
        </span>
      </BrandTag>
      {/* Focus tracking only; this region has no pointer or keyboard actions. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <section
        className="explore-panel"
        aria-label={navigating ? 'Walking navigation' : 'Campus places'}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setSearching(false);
        }}
      >
        <SheetHandle sheet={panelSheet} label="Resize search panel" />
        <div className="dock-search-row">
          {navigating ? (
            <div className="navigation-summary" aria-live="polite">
              <Navigation size={21} />
              <span>
                <strong>
                  {nav.arrived
                    ? 'You have arrived'
                    : currentRoute?.maneuvers[nav.nextIndex]?.instruction ||
                      'Follow your walking route'}
                </strong>
                <small>{selected?.name}</small>
              </span>
            </div>
          ) : (
            <div className="search-box">
              <Search size={21} />
              <input
                aria-label="Search campus"
                ref={searchInput}
                placeholder="Search LASU campus"
                value={query}
                onFocus={() => {
                  setSearching(true);
                  setPanelExpanded(true);
                  panelContent.current?.scrollTo(0, 0);
                }}
                enterKeyHint="search"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(null);
                  setRouteView(false);
                  setRoutes([]);
                }}
              />
              {query && (
                <button
                  aria-label="Clear search"
                  onPointerDown={(event) => {
                    if (document.activeElement === searchInput.current)
                      event.preventDefault();
                  }}
                  onClick={() => setQuery('')}
                >
                  <X size={17} />
                </button>
              )}
            </div>
          )}
          <button
            className="dock-toggle"
            aria-expanded={panelExpanded}
            aria-controls="campus-panel-content"
            aria-label={panelExpanded ? 'Collapse card' : 'Expand card'}
            onClick={() => {
              setSearching(false);
              if (panelExpanded) searchInput.current?.blur();
              setPanelExpanded(!panelExpanded);
            }}
          >
            {panelExpanded ? (
              <ChevronDown size={22} />
            ) : (
              <ChevronUp size={22} />
            )}
          </button>
        </div>
        <div
          id="campus-panel-content"
          className="panel-content"
          ref={panelContent}
        >
          <div className="panel-toolbar">
            <nav className="app-rail" aria-label="Main navigation">
              <a href="/" className="brandmark" aria-label="TurnRight home">
                <ArrowUpRight />
              </a>
              <button
                className={`rail-item ${!savedOnly ? 'active' : ''}`}
                disabled={navigating}
                onClick={() => {
                  setSearching(false);
                  setSavedOnly(false);
                  setPanelExpanded(true);
                  setSelected(null);
                  setRouteView(false);
                  setRoutes([]);
                }}
              >
                <Compass />
                <span>Explore</span>
              </button>
              <button
                className={`rail-item ${savedOnly ? 'active' : ''}`}
                disabled={navigating}
                onClick={() => {
                  setSearching(false);
                  setSavedOnly(true);
                  setPanelExpanded(true);
                  setSelected(null);
                  setRouteView(false);
                  setRoutes([]);
                  setCategory('all');
                  setQuery('');
                }}
              >
                <Heart />
                <span>Saved</span>
              </button>
              <button
                className="rail-item"
                onClick={() => setDialog('offline')}
              >
                <Download />
                <span>Offline</span>
                {latest && latest.version !== manifest.version && (
                  <i className="update-dot" />
                )}
              </button>
              <div className="rail-spacer" />
              <button
                className="rail-item"
                onClick={() => setDialog('settings')}
              >
                <Settings />
                <span>Settings</span>
              </button>
              <a href="/admin" className="rail-item">
                <Shield />
                <span>Editor</span>
              </a>
            </nav>
          </div>
          {sharedLinkMissing && (
            <output className="notice dock-notice">
              This destination is unavailable in your downloaded map. Search for
              its current name, or check Offline for an update.
              <button
                className="text-button"
                onClick={() => {
                  setSharedLinkMissing(false);
                  setSelected(null);
                  setQuery('');
                  setCategory('all');
                  setSavedOnly(false);
                  searchInput.current?.focus();
                  const url = new URL(location.href);
                  url.searchParams.delete('place');
                  history.replaceState(null, '', url);
                }}
              >
                Search campus places
              </button>
            </output>
          )}
          {routeView && selected ? (
            <RoutePanel
              data={data}
              destination={selected}
              routes={routes}
              chosen={chosen}
              origin={origin}
              busy={busy}
              error={
                routeError || (origin === 'gps' || navigating ? gps.error : '')
              }
              navigating={navigating}
              nav={nav}
              muted={muted}
              onOrigin={(from) => {
                if (from === 'gps') gps.start();
                void previewRoute(from);
              }}
              onChoose={setChosen}
              onStart={() => {
                void motionService().requestFromGesture();
                void startNavigation();
              }}
              fix={gps.fix}
              following={follow}
              onStop={stopNavigation}
              onBack={() => {
                routeRequest.current++;
                startRequested.current = false;
                gps.stop();
                setRouteView(false);
                setRoutes([]);
              }}
              onMute={() => {
                setMuted(!muted);
                void setPreference('muted', !muted);
              }}
              onRepeat={repeatDirections}
            />
          ) : !selected ? (
            <>
              <div className="category-strip">
                {categories.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    className={category === id ? 'category active' : 'category'}
                    onClick={() => setCategory(id)}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">YOUR CAMPUS, CONNECTED</span>
                  <h1>
                    {savedOnly
                      ? 'Saved places'
                      : query
                        ? 'Search results'
                        : 'Explore campus'}
                  </h1>
                </div>
                <span className="count-pill">{places.length}</span>
              </div>
              <p className="section-description">
                {savedOnly
                  ? 'Your places, saved on this device.'
                  : 'Find a building. Pick a path. You’re on your way.'}
              </p>
              <div className="place-list">
                {places.map((place) => (
                  <button
                    className="place-row"
                    key={place.id}
                    onPointerDown={(event) => {
                      if (resultTap.current.begin(event, mobileSearch)) {
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }
                    }}
                    onPointerMove={(event) => resultTap.current.move(event)}
                    onPointerUp={(event) => {
                      if (resultTap.current.end(event)) {
                        event.preventDefault();
                        selectPlace(place);
                      }
                    }}
                    onPointerCancel={() => resultTap.current.cancel()}
                    onLostPointerCapture={() => resultTap.current.cancel()}
                    onContextMenu={() => resultTap.current.cancel()}
                    onClick={(event) => {
                      if (resultTap.current.allowClick(event.detail))
                        selectPlace(place);
                      else event.preventDefault();
                    }}
                  >
                    <span className={`place-icon ${place.category}`}>
                      {place.category === 'library' ? (
                        <BookOpen />
                      ) : place.category === 'academic' ? (
                        <GraduationCap />
                      ) : (
                        <MapPin />
                      )}
                    </span>
                    <span className="place-copy">
                      <strong>{place.name}</strong>
                      <span>
                        {place.category === 'academic'
                          ? 'Academic building'
                          : place.category.charAt(0).toUpperCase() +
                            place.category.slice(1)}{' '}
                        · Ojo campus
                      </span>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))}
                {!places.length && (
                  <div className="empty-state">
                    {savedOnly ? <Heart /> : <Search />}
                    <h3>
                      {savedOnly ? 'Keep your places close' : 'No places found'}
                    </h3>
                    <p>
                      {savedOnly
                        ? 'Open a place and tap Save to find it here.'
                        : 'Try a building name, department, or abbreviation.'}
                    </p>
                  </div>
                )}
              </div>
              <footer className="panel-footer">
                <span className="status-dot" />
                {downloaded && swReady
                  ? 'Ready offline'
                  : online
                    ? 'Campus map'
                    : 'Offline'}
                <button
                  className="text-button"
                  onClick={() => setDialog('offline')}
                >
                  {downloaded ? 'Manage map' : 'Download map'}
                </button>
              </footer>
            </>
          ) : (
            <div className="place-detail">
              <button className="text-button" onClick={() => setSelected(null)}>
                <ArrowLeft size={17} /> Back to places
              </button>
              <div className={`detail-icon ${selected.category}`}>
                <Building2 />
              </div>
              <span className="eyebrow">
                {selected.category.toUpperCase()} · LASU OJO
              </span>
              <h1>{selected.name}</h1>
              {(() => {
                const building = data.map.features.find(
                  (f) =>
                    f.properties?.kind === 'building' &&
                    buildingPlace(data, f)?.id === selected.id,
                );
                return (
                  building && (
                    <BuildingVisualDetails data={data} feature={building} />
                  )
                );
              })()}
              <p>
                {selected.department ||
                  selected.faculty ||
                  'Lagos State University, Ojo campus'}
              </p>
              <Button
                className="primary-action"
                onClick={() => void previewRoute()}
              >
                <Navigation size={18} /> Directions
              </Button>
              <div className="button-row place-actions">
                {typeof navigator.share === 'function' && (
                  <Button
                    variant="outline"
                    onClick={() => void shareDestination()}
                  >
                    <Share2 /> Share
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => void shareDestination(true)}
                >
                  <Copy /> Copy link
                </Button>
                <Button variant="outline" onClick={toggleSaved}>
                  <Heart
                    fill={saved.includes(selected.id) ? 'currentColor' : 'none'}
                  />
                  {saved.includes(selected.id) ? 'Saved' : 'Save'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setReportPin(undefined);
                    setDialog('report');
                  }}
                >
                  <Flag /> Report
                </Button>
              </div>
              {shareFallback && (
                <label className="field-label">
                  Destination link
                  <input
                    aria-label="Destination link"
                    readOnly
                    value={shareFallback}
                    onFocus={(event) => event.target.select()}
                  />
                </label>
              )}
              <div className="detail-facts">
                <div>
                  <MapPin />
                  <span>
                    {selected.coordinates[1].toFixed(5)},{' '}
                    {selected.coordinates[0].toFixed(5)}
                  </span>
                </div>
                <div>
                  <Flag />
                  <span>
                    {selected.arrivalKind === 'entrance'
                      ? 'Connected to a mapped entrance.'
                      : selected.graphNode
                        ? `Mapped path ${selected.approachDistance} m away. Entrance connection unverified.`
                        : 'Walking connection not yet mapped.'}
                  </span>
                </div>
                <div>
                  <Info />
                  <span>
                    Source:{' '}
                    {selected.source === 'osm'
                      ? 'OpenStreetMap'
                      : selected.source === 'campus-review'
                        ? 'Campus administrator'
                        : 'LASU ArcGIS campus map'}
                    . Not field-verified.
                  </span>
                </div>
              </div>
            </div>
          )}
          <div className="map-topbar">
            <button
              className="location-pill"
              onClick={() => setDialog('offline')}
            >
              {!online ? (
                <WifiOff size={14} />
              ) : (
                <span className="status-dot" />
              )}
              <span>{!online ? 'Offline' : 'Lagos State University'}</span>
              <span className="pill-divider" />
              <span>
                {downloaded && swReady ? 'Map downloaded' : 'Ojo, Lagos'}
              </span>
            </button>
          </div>
          {threeD && (
            <div className="map-caption">
              3D heights include estimates. Some heights are unknown.
            </div>
          )}
        </div>
      </section>
      {gps.error && !routeView && (
        <output className="gps-status">{gps.error}</output>
      )}
      {toast && (
        <output className="toast">
          <span>{toast}</span>
          <button aria-label="Dismiss" onClick={() => setToast('')}>
            <X size={18} />
          </button>
        </output>
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent
          className="app-dialog resizable-dialog"
          style={dialogSheet.style}
        >
          <SheetHandle sheet={dialogSheet} label="Resize dialog" />
          <DialogHeader>
            <DialogTitle>
              {dialog === 'building'
                ? String(
                    unlinkedBuilding?.properties?.name || 'Campus building',
                  )
                : dialog === 'offline'
                  ? 'Offline maps'
                  : dialog === 'report'
                    ? 'Report a map issue'
                    : 'Settings & map information'}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'building'
                ? 'Building footprint and source information.'
                : dialog === 'offline'
                  ? 'Take LASU campus with you.'
                  : dialog === 'report'
                    ? 'Help make campus easier to navigate.'
                    : 'Make TurnRight work for you.'}
            </DialogDescription>
          </DialogHeader>
          <div className="dialog-scroll-content">
            {dialog === 'building' && unlinkedBuilding && (
              <div className="settings-content">
                <BuildingVisualDetails data={data} feature={unlinkedBuilding} />
                <p>
                  Source:{' '}
                  {String(unlinkedBuilding.properties?.source || 'Campus map')}.
                  This footprint is not yet linked to a named destination.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    const g = unlinkedBuilding.geometry;
                    const point =
                      g.type === 'Polygon'
                        ? g.coordinates[0][0]
                        : g.type === 'MultiPolygon'
                          ? g.coordinates[0][0][0]
                          : undefined;
                    if (point) setReportPin(point as Position);
                    setDialog('report');
                  }}
                >
                  <Flag /> Report building details
                </Button>
              </div>
            )}
            {dialog === 'offline' && (
              <OfflinePanel
                manifest={manifest}
                latest={latest}
                downloaded={downloaded}
                navigating={navigating}
                swReady={swReady}
                onCheck={() => void checkUpdates(true)}
                onDelete={() => setDownloaded(false)}
                onInstall={(nextData, nextManifest, pending) => {
                  setDownloaded(true);
                  if (!pending) {
                    setData(nextData);
                    setManifest(nextManifest);
                    setRoutes([]);
                    setRouteView(false);
                    setSelected(null);
                  }
                  setToast(
                    pending
                      ? 'Download complete. It will activate after your walk.'
                      : 'Campus map downloaded and verified.',
                  );
                }}
              />
            )}{' '}
            {dialog === 'report' && (
              <ReportForm
                onDraftSaved={refreshDrafts}
                place={selected}
                coordinates={reportPin}
                onDone={() => {
                  setDialog(null);
                  setToast(
                    'Report submitted. Thank you for helping improve the map.',
                  );
                }}
              />
            )}{' '}
            {dialog === 'settings' && (
              <div className="settings-content">
                <AppearanceSettings
                  preference={appearance}
                  dark={dark}
                  onChange={setAppearance}
                />
                <MapRenderingSettings
                  simple={simple3D}
                  onSimple={setSimple3D}
                />
                <div className="settings-row">
                  <span>Voice directions</span>
                  <button
                    role="switch"
                    aria-checked={!muted}
                    aria-label="Voice directions"
                    className={`toggle ${!muted ? 'on' : ''}`}
                    onClick={() => {
                      setMuted(!muted);
                      void setPreference('muted', !muted);
                    }}
                  >
                    <i />
                  </button>
                </div>
                <div className="settings-row">
                  <span>App update</span>
                  <Button
                    variant="outline"
                    disabled={!updateReady || navigating || installingUpdate}
                    onClick={installAppUpdate}
                  >
                    {installingUpdate
                      ? 'Installing…'
                      : updateReady
                        ? navigating
                          ? 'After navigation'
                          : 'Install update'
                        : 'Up to date'}
                  </Button>
                </div>
                <MotionStatus modes fix={gps.fix} following={follow} />
                <p className="small-note">
                  {voiceMode === 'natural'
                    ? 'Natural offline voice · British English. Saved with the app.'
                    : voiceMode === 'basic'
                      ? 'Using basic offline voice. Reload online to retry the natural voice.'
                      : 'Voice unavailable. Save the app and download the campus map before going offline.'}
                </p>
                <Button
                  variant="outline"
                  disabled={muted || navigating || previewingVoice}
                  onClick={async () => {
                    setPreviewingVoice(true);
                    setVoicePreviewFeedback('');
                    try {
                      await voice.current.unlock();
                      setVoiceMode(await voice.current.load(manifest.version));
                      await voice.current.preview();
                      setVoicePreviewFeedback('Voice preview played.');
                    } catch (error) {
                      setVoicePreviewFeedback(
                        error instanceof Error
                          ? error.message
                          : 'Audio is unavailable. Check device volume and download the campus map.',
                      );
                    } finally {
                      setPreviewingVoice(false);
                    }
                  }}
                >
                  {previewingVoice
                    ? 'Playing preview…'
                    : 'Preview voice directions'}
                </Button>
                {voicePreviewFeedback && (
                  <output className="small-note" aria-live="polite">
                    {voicePreviewFeedback}
                  </output>
                )}
                <p className="small-note">
                  Install: in Android Chrome, choose Install app from the menu.
                  On iPhone, use Safari → Share → Add to Home Screen. Keep the
                  app visible during navigation.
                </p>
                <h3 className="subheading">Map coverage</h3>
                {data.accessPolicy && (
                  <p className="small-note">
                    Student walking access on the main internal roads was
                    confirmed by the project owner on{' '}
                    {data.accessPolicy.confirmedAt}. Restricted areas,
                    no-walking paths, and closures remain excluded.
                  </p>
                )}
                <p>
                  {data.coverage.placeCount} places ·{' '}
                  {data.coverage.approachCount} mapped approaches ·{' '}
                  {data.coverage.routableCount} connected entrances.
                </p>
                <p className="notice">
                  This source-derived campus map has not been field-verified.
                  Missing entrances and paths are shown in place details.
                </p>
                {reportDrafts.length > 0 && (
                  <>
                    <h3 className="subheading">Saved report drafts</h3>
                    {reportDrafts.map((draft) => (
                      <Button
                        key={draft.key}
                        variant="outline"
                        onClick={() => {
                          setSelected(
                            data.places.find(
                              (p) =>
                                p.id ===
                                resolvePlaceId(data, draft.placeId || ''),
                            ) || null,
                          );
                          setReportPin(draft.coordinates);
                          setDialog('report');
                        }}
                      >
                        {draft.name} · Resume draft
                      </Button>
                    ))}
                  </>
                )}
                <h3 className="subheading">Your privacy</h3>
                <p>
                  Location and navigation history stay on your phone. Student
                  reports only send the pin and description you submit.
                  TurnRight is an independent personal project, not an official
                  LASU service.
                </p>
                <h3 className="subheading">Sources & attribution</h3>
                {data.sources.map((source) => (
                  <p key={source.id}>
                    <a
                      className="source-link"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.attribution}
                    </a>
                    <br />
                    <span className="small-note">{source.license}</span>
                  </p>
                ))}
                <a className="text-button" href={manifest.dataUrl} download>
                  Download source-derived campus database
                </a>
                <p className="small-note">
                  English voice directions · Walking only · Updated{' '}
                  {new Date(manifest.createdAt).toLocaleDateString()} ·{' '}
                  {manifest.version}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
