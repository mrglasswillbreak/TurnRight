import { useIsMobile } from '@/hooks/use-mobile';
import type { Feature } from 'geojson';
import type { Map as MapInstance } from 'maplibre-gl';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useSheetSize } from './ResizableSheet';
import { OfflineVoice } from './audio';
import { requestedCampus } from './campus-context';
import { initialNavigation } from './navigation';
import { getPreference } from './offline';
import { ResultTap } from './result-tap';
import type {
  CampusData,
  CampusPackage,
  Place,
  Position,
  Route,
  TravelMode,
} from './types';
import { useAppearance } from './useAppearance';
import { useMapViewPreference } from './useMapViewPreference';
import { useSimple3D } from './useSimple3D';

export function usePublicAppState() {
  const campusScope = useRef(requestedCampus());
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
  const [entranceId, setEntranceId] = useState('');
  const [worldView, setWorldView] = useState(false);
  const [campusSearch, setCampusSearch] = useState(false);
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
    mobileMapControls ? (updateReady ? 288 : 208) : 104,
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
    const campus = campusScope.current;
    void getPreference<typeof reportDrafts>('report-drafts', [], campus).then(
      (drafts) => {
        if (campusScope.current === campus) setReportDrafts(drafts);
      },
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
  const [travelMode, setTravelMode] = useState<TravelMode>(() => {
    try {
      return localStorage.getItem('turnright-travel-mode') === 'driving'
        ? 'driving'
        : 'walking';
    } catch {
      return 'walking';
    }
  });
  const [parkingId, setParkingId] = useState('');
  const [activeLeg, setActiveLeg] = useState(0);
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
  return {
    campusScope,
    appearance,
    dark,
    setAppearance,
    data,
    setData,
    manifest,
    setManifest,
    latest,
    setLatest,
    loadError,
    setLoadError,
    toast,
    setToast,
    query,
    setQuery,
    category,
    setCategory,
    threeD,
    setThreeD,
    simple3D,
    setSimple3D,
    unlinkedBuilding,
    setUnlinkedBuilding,
    selected,
    setSelected,
    follow,
    setFollow,
    entranceId,
    setEntranceId,
    worldView,
    setWorldView,
    campusSearch,
    setCampusSearch,
    mobileMapControls,
    updateReady,
    setUpdateReady,
    installingUpdate,
    setInstallingUpdate,
    setSearching,
    mobileSearch,
    panelSheet,
    dialogSheet,
    panelExpanded,
    setPanelExpanded,
    shareFallback,
    setShareFallback,
    sharedLinkMissing,
    setSharedLinkMissing,
    sharedLinkOpened,
    searchInput,
    panelContent,
    resultTap,
    saved,
    setSaved,
    recent,
    setRecent,
    savedOnly,
    setSavedOnly,
    reportDrafts,
    setReportDrafts,
    refreshDrafts,
    startRequested,
    dialog,
    setDialog,
    reportPin,
    setReportPin,
    downloaded,
    setDownloaded,
    online,
    setOnline,
    swReady,
    setSwReady,
    travelMode,
    setTravelMode,
    parkingId,
    setParkingId,
    activeLeg,
    setActiveLeg,
    routeView,
    setRouteView,
    routes,
    setRoutes,
    chosen,
    setChosen,
    origin,
    setOrigin,
    busy,
    setBusy,
    routeError,
    setRouteError,
    navigating,
    setNavigating,
    nav,
    setNav,
    muted,
    setMuted,
    clock,
    setClock,
    map,
    voice,
    routeRequest,
    rerouteAt,
    rerouting,
    setRerouting,
    previewingVoice,
    setPreviewingVoice,
    voicePreviewFeedback,
    setVoicePreviewFeedback,
    voiceMode,
    setVoiceMode,
    updateSW,
    navigatingRef,
    requestedReload,
  };
}
export type PublicAppStateBindings = ReturnType<typeof usePublicAppState>;
