import { Suspense } from 'react';
import { MotionMap } from './MotionAssistance';
export type { MapViewProps } from './map-view-types';
import { WorldAnimation } from './MapWorldAnimation';
import { useMapView, type MapViewControllerProps } from './useMapView';

import 'maplibre-gl/dist/maplibre-gl.css';
import './models.css';
import './map-worker';
export function MapView(props: MapViewControllerProps) {
  const state = useMapView(props);
  const {
    motionMap,
    editor,
    fix,
    follow,
    motionActive,
    routes,
    activeRoute,
    container,
    worldView,
    worldError,
    setWorldAttempt,
    animationPaused,
    selectedBuildingId,
    selected,
    threeD,
    simple,
    editing,
    buildingPreview,
    modelStatus,
    setModelAttempt,
    mapError,
  } = state;

  return (
    <>
      {motionMap && !editor && (
        <MotionMap
          map={motionMap}
          fix={fix}
          follow={follow}
          active={motionActive}
          driving={routes[activeRoute]?.mode === 'driving'}
        />
      )}
      <div
        className="map-canvas"
        ref={container}
        data-world-view={worldView}
        aria-label={
          worldView ? 'Interactive world map' : 'Interactive campus map'
        }
      />
      {!editor && worldError && (
        <output className="world-map-error">
          <span>World map unavailable. The campus map is still usable.</span>
          <button onClick={() => setWorldAttempt((n) => n + 1)}>
            Retry world map
          </button>
        </output>
      )}
      {!editor && worldView && motionMap && (
        <Suspense fallback={null}>
          <WorldAnimation
            map={motionMap}
            blocked={
              animationPaused ||
              !!selectedBuildingId ||
              !!selected ||
              routes.length > 0 ||
              follow ||
              motionActive
            }
          />
        </Suspense>
      )}
      {threeD &&
        !simple &&
        (editing || buildingPreview.pending || modelStatus === 'reduced') && (
          <output className="map-detail-status" aria-live="polite">
            {editing
              ? 'Enhanced models paused for map editing'
              : buildingPreview.pending
                ? 'Updating 3D preview…'
                : 'Detail reduced for smoother movement'}
          </output>
        )}
      {threeD && !simple && !editing && modelStatus === 'unavailable' && (
        <div className="map-rendering-error" role="alert">
          <strong>Enhanced 3D is unavailable</strong>
          <p>Simple buildings are shown. Your edits are preserved.</p>
          <button onClick={() => setModelAttempt((n) => n + 1)}>
            Retry enhanced 3D
          </button>
        </div>
      )}
      {editor && threeD && !simple && buildingPreview.error && (
        <div className="building-preview-error" role="alert">
          <strong>3D preview is outdated</strong>
          <p>{buildingPreview.error}</p>
          <button onClick={buildingPreview.retry}>Retry 3D preview</button>
        </div>
      )}
      {mapError && (
        <div className="map-error" role="alert">
          {mapError}
        </div>
      )}
    </>
  );
}
