import {
  Compass,
  Download,
  Heart,
  Settings,
  Shield,
  WifiOff,
} from 'lucide-react';
import { Suspense } from 'react';
import { BrandMark } from './BrandMark';
import { SheetHandle } from './ResizableSheet';
import { publicEditorHref } from './editor-link';
import { motionService } from './motion-service';
import { initialNavigation } from './navigation';
import { setPreference } from './offline';
import { RoutePanel } from './public-app-shared';

import { PublicDestinationDetails } from './PublicDestinationDetails';
import { PublicPlaceBrowse } from './PublicPlaceBrowse';
import { PublicSearchBar } from './PublicSearchBar';
import type { PublicAppStateBindings } from './usePublicAppState';
import type { PublicDestinationBindings } from './usePublicDestination';
import type { PublicOfflineLifecycleBindings } from './usePublicOfflineLifecycle';
import type { PublicRoutingBindings } from './usePublicRouting';
import type { PublicSearchBindings } from './usePublicSearch';
type Props = Pick<
  PublicAppStateBindings,
  | 'campusScope'
  | 'dark'
  | 'latest'
  | 'setToast'
  | 'query'
  | 'setQuery'
  | 'category'
  | 'setCategory'
  | 'threeD'
  | 'setThreeD'
  | 'unlinkedBuilding'
  | 'setUnlinkedBuilding'
  | 'selected'
  | 'setSelected'
  | 'follow'
  | 'setFollow'
  | 'entranceId'
  | 'setEntranceId'
  | 'setCampusSearch'
  | 'mobileMapControls'
  | 'setSearching'
  | 'panelSheet'
  | 'panelExpanded'
  | 'setPanelExpanded'
  | 'shareFallback'
  | 'sharedLinkMissing'
  | 'setSharedLinkMissing'
  | 'searchInput'
  | 'panelContent'
  | 'saved'
  | 'savedOnly'
  | 'setSavedOnly'
  | 'startRequested'
  | 'setDialog'
  | 'setReportPin'
  | 'downloaded'
  | 'online'
  | 'swReady'
  | 'travelMode'
  | 'setTravelMode'
  | 'parkingId'
  | 'setParkingId'
  | 'setActiveLeg'
  | 'routeView'
  | 'setRouteView'
  | 'routes'
  | 'setRoutes'
  | 'chosen'
  | 'setChosen'
  | 'origin'
  | 'busy'
  | 'routeError'
  | 'navigating'
  | 'nav'
  | 'setNav'
  | 'muted'
  | 'setMuted'
  | 'map'
  | 'voice'
  | 'routeRequest'
> &
  Pick<
    PublicOfflineLifecycleBindings,
    | 'gps'
    | 'currentRoute'
    | 'repeatDirections'
    | 'checkingDownload'
    | 'campusMap'
  > &
  Pick<
    PublicSearchBindings,
    | 'visitorLayers'
    | 'setVisitorLayers'
    | 'landmarksOnly'
    | 'setLandmarksOnly'
    | 'visiblePlaceCount'
    | 'setVisiblePlaceCount'
    | 'places'
    | 'streets'
    | 'setSelectedStreet'
    | 'placeRows'
  > &
  Pick<PublicDestinationBindings, 'shareDestination' | 'toggleSaved'> &
  Pick<
    PublicRoutingBindings,
    'previewRoute' | 'startNavigation' | 'stopNavigation' | 'commitCampus'
  > & {
    data: NonNullable<PublicAppStateBindings['data']>;
    manifest: NonNullable<PublicAppStateBindings['manifest']>;
    campusName: string;
  };
export function PublicExplorePanel(props: Props) {
  const {
    data,
    manifest,
    latest,
    setToast,
    setQuery,
    setCategory,
    threeD,
    unlinkedBuilding,
    selected,
    setSelected,
    follow,
    setFollow,
    entranceId,
    setEntranceId,
    setSearching,
    panelSheet,
    setPanelExpanded,
    sharedLinkMissing,
    setSharedLinkMissing,
    searchInput,
    panelContent,
    savedOnly,
    setSavedOnly,
    startRequested,
    setDialog,
    downloaded,
    online,
    swReady,
    travelMode,
    setTravelMode,
    parkingId,
    setParkingId,
    setActiveLeg,
    routeView,
    setRouteView,
    routes,
    setRoutes,
    chosen,
    setChosen,
    origin,
    busy,
    routeError,
    navigating,
    nav,
    setNav,
    muted,
    setMuted,
    voice,
    routeRequest,
    gps,
    currentRoute,
    repeatDirections,
    previewRoute,
    startNavigation,
    stopNavigation,
    campusName,
  } = props;
  return (
    // This region tracks focus only; it does not perform pointer or keyboard actions.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      className="explore-panel"
      aria-label={navigating ? 'Walking navigation' : 'Campus places'}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setSearching(false);
      }}
    >
      <SheetHandle sheet={panelSheet} label="Resize search panel" />
      <PublicSearchBar {...props} data={data} manifest={manifest} />
      <div
        id="campus-panel-content"
        className="panel-content"
        ref={panelContent}
      >
        <div className="panel-toolbar">
          <nav className="app-rail" aria-label="Main navigation">
            <a href="/" className="brandmark" aria-label="TurnRight home">
              <BrandMark />
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
            <button className="rail-item" onClick={() => setDialog('offline')}>
              <Download />
              <span>Offline</span>
              {latest && latest.version !== manifest.version && (
                <i className="update-dot" />
              )}
            </button>
            <div className="rail-spacer" />
            <button className="rail-item" onClick={() => setDialog('settings')}>
              <Settings />
              <span>Settings</span>
            </button>
            <a
              href={publicEditorHref(
                data,
                selected,
                unlinkedBuilding
                  ? String(unlinkedBuilding.properties?.id || '')
                  : undefined,
              )}
              className="rail-item"
            >
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
        {!data.graph.edges.some(
          (edge) =>
            edge.walkingAccess !== 'no' && edge.walkingAccess !== 'private',
        ) && (
          <output className="notice dock-notice">
            Directions are not available for this campus yet. You can browse
            buildings and places while paths and connections are reviewed.
          </output>
        )}
        {routeView && selected ? (
          <Suspense
            fallback={<output className="notice">Loading directions…</output>}
          >
            <RoutePanel
              data={data}
              destination={selected}
              mode={travelMode}
              parkingId={parkingId}
              entranceId={entranceId}
              onEntrance={(id) => {
                setEntranceId(id);
                void previewRoute(origin, travelMode, parkingId, id);
              }}
              onMode={(mode) => {
                setTravelMode(mode);
                setActiveLeg(0);
                try {
                  localStorage.setItem('turnright-travel-mode', mode);
                } catch {
                  setToast('Travel mode is saved for this session only.');
                }
                void previewRoute(origin, mode);
              }}
              onParking={(id) => {
                setParkingId(id);
                void previewRoute(origin, travelMode, id);
              }}
              activeRoute={navigating ? currentRoute : undefined}
              onParked={() => {
                voice.current.stop();
                setActiveLeg(1);
                setNav(initialNavigation);
                gps.start();
                setFollow(true);
              }}
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
          </Suspense>
        ) : !selected ? (
          <PublicPlaceBrowse {...props} />
        ) : (
          <PublicDestinationDetails
            {...props}
            data={data}
            selected={selected}
          />
        )}
        <div className="map-topbar">
          <button
            className="location-pill"
            onClick={() => setDialog('offline')}
          >
            {!online ? <WifiOff size={14} /> : <span className="status-dot" />}
            <span>{!online ? 'Offline' : campusName}</span>
            <span className="pill-divider" />
            <span>
              {downloaded && swReady ? 'Map downloaded' : 'Campus map'}
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
  );
}
