import { Button } from '@/components/ui/button';
import { Compass, LocateFixed, Plus, X } from 'lucide-react';
import { Suspense } from 'react';
import { AppUpdateNotice } from './AppUpdateNotice';
import { BrandMark } from './BrandMark';
import { MapView } from './MapView';
import { MapViewControl } from './MapViewControl';
import { motionService } from './motion-service';
import {
  Admin,
  PublicMapLayout,
  VisitorLayerControls,
} from './public-app-shared';
import './public-dock.css';
import { CAMPUS_MIN_ZOOM, returnToCampus } from './world-map';

import { PublicDialogs } from './PublicDialogs';
import { PublicExplorePanel } from './PublicExplorePanel';
import { usePublicAppState } from './usePublicAppState';
import { usePublicDestination } from './usePublicDestination';
import { usePublicNavigationTracking } from './usePublicNavigationTracking';
import { usePublicOfflineLifecycle } from './usePublicOfflineLifecycle';
import { usePublicRouting } from './usePublicRouting';
import { usePublicSearch } from './usePublicSearch';

export default function App() {
  const publicAppStateBindings = usePublicAppState();
  const {
    appearance,
    dark,
    setAppearance,
    data,
    manifest,
    loadError,
    toast,
    setToast,
    threeD,
    setThreeD,
    simple3D,
    setUnlinkedBuilding,
    selected,
    setSelected,
    follow,
    setFollow,
    worldView,
    setWorldView,
    campusSearch,
    mobileMapControls,
    updateReady,
    installingUpdate,
    mobileSearch,
    panelSheet,
    panelExpanded,
    dialog,
    setDialog,
    setReportPin,
    routeView,
    routes,
    chosen,
    navigating,
    nav,
    map,
    navigatingRef,
  } = publicAppStateBindings;
  const publicOfflineLifecycleBindings = usePublicOfflineLifecycle({
    ...publicAppStateBindings,
  });
  const {
    installAppUpdate,
    gps,
    currentRoute,
    campusMap,
    setCampusMap,
    reloadData,
  } = publicOfflineLifecycleBindings;
  usePublicNavigationTracking({
    ...publicAppStateBindings,
    ...publicOfflineLifecycleBindings,
  });
  const publicSearchBindings = usePublicSearch({ ...publicAppStateBindings });
  const { visitorLayers, setVisitorLayers, selectedStreet, selectPlace } =
    publicSearchBindings;
  const publicDestinationBindings = usePublicDestination({
    ...publicAppStateBindings,
    ...publicSearchBindings,
  });
  const publicRoutingBindings = usePublicRouting({
    ...publicAppStateBindings,
    ...publicOfflineLifecycleBindings,
    ...publicSearchBindings,
  });
  if (!data || !manifest)
    return (
      <main className="loading-screen">
        <div className="brandmark">
          <BrandMark />
        </div>
        <h1>
          TurnRight<span>.</span>
        </h1>
        <p>{loadError || 'Opening campus map…'}</p>
        {loadError && (
          <>
            <Button onClick={reloadData}>Retry</Button>
            <a href="/?campus=lasu">Open LASU</a>
          </>
        )}
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
  const campusName = manifest.campus?.name || 'LASU · Ojo';
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
          void motionService().requestFromGesture();
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
        visitorLayers={visitorLayers}
        animationPaused={!!dialog || !!selectedStreet || campusSearch}
        selectedStreet={selectedStreet}
        data={data}
        selected={selected}
        routes={navigating && currentRoute ? [currentRoute] : routes}
        activeRoute={navigating ? 0 : chosen}
        fix={gps.fix}
        dark={dark}
        threeD={threeD}
        simple={simple3D}
        buildingOpacity={navigating ? 0.65 : 0.92}
        follow={follow}
        motionActive={gps.tracking || (navigating && !nav.arrived)}
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
          setCampusMap(instance);
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
      {!worldView && !navigating && (
        <Suspense fallback={null}>
          <VisitorLayerControls
            value={visitorLayers}
            onChange={setVisitorLayers}
            illustrative={!!data.visuals?.scenery}
          />
        </Suspense>
      )}
      {campusMap && new URLSearchParams(location.search).has('mapLayout') && (
        <Suspense fallback={null}>
          <PublicMapLayout
            key={manifest.version}
            map={campusMap}
            data={data}
            manifest={manifest}
          />
        </Suspense>
      )}
      {updateReady && (
        <AppUpdateNotice
          navigating={navigating}
          installing={installingUpdate}
          onInstall={installAppUpdate}
        />
      )}
      <BrandTag
        className="public-brand"
        aria-label={worldView ? 'Back to campus' : `TurnRight · ${campusName}`}
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
          <BrandMark />
        </span>
        <span>
          <strong>{worldView ? 'Back to campus' : 'TurnRight'}</strong>
          <small>{campusName}</small>
        </span>
      </BrandTag>
      {/* Focus tracking only; this region has no pointer or keyboard actions. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <PublicExplorePanel
        {...publicAppStateBindings}
        {...publicOfflineLifecycleBindings}
        {...publicSearchBindings}
        {...publicDestinationBindings}
        {...publicRoutingBindings}
        data={data}
        manifest={manifest}
        campusName={campusName}
      />
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
      <PublicDialogs
        {...publicAppStateBindings}
        {...publicOfflineLifecycleBindings}
        data={data}
        manifest={manifest}
        campusName={campusName}
      />
    </main>
  );
}
