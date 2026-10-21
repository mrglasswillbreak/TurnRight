import { installCampusLayers } from './map-campus-style';
import { style } from './map-base-style';
import { useEffect } from 'react';
import { publicMapPadding } from './public-map-layout';
import { CAMPUS_MIN_ZOOM, WORLD_PROJECTION } from './world-map';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapInstance } from 'maplibre-gl';
import { markModelSelection } from './model-selection';
import { buildingPlace } from './map-display';
import { applyMapTheme } from './map-theme';
import { empty } from './map-view-data';
import type { MapViewState } from './useMapView';
export function useCampusMapLifecycle({
  container,
  camera,
  editor,
  setMapError,
  mapRef,
  setWorldView,
  callbacks,
  panelBesideMap,
  latestData,
  latestSources,
  appliedSources,
  models,
  ready,
  setMotionMap,
}: Pick<
  MapViewState,
  | 'container'
  | 'camera'
  | 'editor'
  | 'setMapError'
  | 'mapRef'
  | 'setWorldView'
  | 'callbacks'
  | 'panelBesideMap'
  | 'latestData'
  | 'latestSources'
  | 'appliedSources'
  | 'models'
  | 'ready'
  | 'setMotionMap'
>): void {
  useEffect(() => {
    if (!container.current) return;
    const dark = camera.current.dark;
    let map: MapInstance;
    let disposeExtension: void | (() => void);
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: {
          ...style(dark),
          projection: editor ? { type: 'mercator' } : WORLD_PROJECTION,
        },
        center: [3.201, 6.465],
        zoom: 16,
        maxZoom: 20,
        minZoom: CAMPUS_MIN_ZOOM,
        attributionControl: false,
        trackResize: false,
        pitch: camera.current.threeD
          ? editor
            ? 50
            : innerWidth < 768
              ? 40
              : 45
          : 0,
        maxPitch: 60,
        canvasContextAttributes: { antialias: true },
      });
      setMapError('');
    } catch {
      setMapError(
        'This browser could not open the interactive map. Enable hardware acceleration or try a current browser. Place search is still available.',
      );
      return;
    }
    mapRef.current = map;
    setWorldView(false);
    callbacks.current.onWorldViewChange?.(false);
    let wasWorld = false;
    let worldPitchPending = false;
    let pitchFrame = 0;
    const updateWorldView = () => {
      const world = !editor && map.getZoom() < CAMPUS_MIN_ZOOM;
      if (world === wasWorld) return;
      wasWorld = world;
      worldPitchPending = true;
      setWorldView(world);
      callbacks.current.onWorldViewChange?.(world);
    };
    const syncWorldPitch = () => {
      if (!worldPitchPending || map.isMoving()) return;
      cancelAnimationFrame(pitchFrame);
      // Starting an ease inside moveend can interrupt MapLibre's unfinished
      // camera cleanup, including the zoom used when resuming GPS following.
      pitchFrame = requestAnimationFrame(() => {
        if (mapRef.current !== map || map.isMoving()) return;
        worldPitchPending = false;
        const pitch =
          wasWorld || !camera.current.threeD ? 0 : innerWidth < 768 ? 40 : 45;
        if (map.getPitch() !== pitch) map.jumpTo({ pitch });
      });
    };
    map.on('zoom', updateWorldView);
    map.on('moveend', syncWorldPitch);
    const mapPadding = () => {
      return panelBesideMap
        ? { top: 60, right: 40, bottom: 60, left: 40 }
        : publicMapPadding(map.getContainer(), wasWorld);
    };
    const panel =
      !panelBesideMap &&
      map.getContainer().closest('.app-shell')?.querySelector('.explore-panel');
    let paddingPending = false;
    const syncPadding = () => {
      // setPadding stops camera animations. Let a selection flight finish first.
      if (
        !paddingPending ||
        panelBesideMap ||
        mapRef.current !== map ||
        map.isMoving()
      )
        return;
      paddingPending = false;
      const next = mapPadding(),
        current = map.getPadding();
      if (
        Object.entries(next).some(
          ([side, value]) =>
            Math.abs(value - (current[side as keyof typeof current] ?? 0)) >
            0.5,
        )
      )
        map.setPadding(next);
    };
    const requestPadding = () => {
      paddingPending = true;
      syncPadding();
    };
    const panelResize = new ResizeObserver(requestPadding);
    map.on('moveend', syncPadding);
    if (panel) {
      map.setPadding(mapPadding());
      panelResize.observe(panel);
    }
    const frame = () => {
      const padding = panelBesideMap ? mapPadding() : 20;
      const current = camera.current,
        route = current.routes[current.activeRoute];
      if (route?.coordinates.length) {
        const points = route.coordinates;
        map.fitBounds(
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
          { padding, maxZoom: 18, duration: 0 },
        );
      } else if (current.selected)
        map.jumpTo({
          center: current.selected.coordinates,
          zoom: 17,
          padding: mapPadding(),
        });
      else
        map.fitBounds(latestData.current.bounds, {
          padding,
          duration: 0,
          pitch: map.getPitch(),
        });
    };
    let resizeFrame = 0;
    const resize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (mapRef.current !== map) return;
        const center = map.getCenter();
        map.resize();
        // Resizing must not undo a manual pan, tilt, or ongoing edit.
        map.jumpTo({ center, padding: mapPadding() });
      });
    };
    // Dynamic browser chrome and CSS/keyboard changes need not emit window.resize.
    const mapResize = new ResizeObserver(resize);
    mapResize.observe(map.getContainer());
    window.addEventListener('resize', resize);
    const viewportResize = resize;
    window.visualViewport?.addEventListener('resize', viewportResize);
    window.visualViewport?.addEventListener('scroll', viewportResize);
    map.on('error', (event) => console.error('Campus map:', event.error));
    map.on('webglcontextlost', () =>
      setMapError(
        'Map graphics paused. Restore this tab or reload to retry. Place search remains available.',
      ),
    );
    map.on('webglcontextrestored', () => setMapError(''));
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 90 }),
      'bottom-left',
    );
    map.on('load', () => {
      for (const [id, value] of Object.entries(latestSources.current))
        map.addSource(id, { type: 'geojson', data: value });
      appliedSources.current = { ...latestSources.current };
      map.addSource('routes', { type: 'geojson', data: empty });
      map.addSource('route-labels', { type: 'geojson', data: empty });
      map.addSource('position', { type: 'geojson', data: empty });
      installCampusLayers(map, dark, editor);
      if (editor) {
        map.on('click', (event) => {
          if (
            map.queryRenderedFeatures(event.point, {
              layers: [
                'places-label',
                'places-label-detail',
                'places-label-selected',
              ],
            }).length
          )
            return;
          const hit = models.current?.pick(event.point);
          const id = hit?.buildingId;
          const feature =
            id &&
            latestData.current.map.features.find(
              (f) => f.properties?.id === id,
            );
          if (feature && callbacks.current.onBuildingSelect) {
            markModelSelection(event.originalEvent);
            callbacks.current.onBuildingSelect(feature, hit);
          }
        });
      } else {
        map.on('click', (event) => {
          if (map.getZoom() < CAMPUS_MIN_ZOOM) return;
          if (
            map.getLayer('published-campus-outline-fill') &&
            map
              .queryRenderedFeatures(event.point, {
                layers: [
                  'published-campus-outline-fill',
                  'published-campus-labels',
                ],
              })
              .some((feature) => !feature.properties?.active)
          )
            return;
          const placeHit = map.queryRenderedFeatures(event.point, {
            layers: [
              'places-dot',
              'places-label',
              'places-label-detail',
              'places-label-selected',
            ],
          })[0];
          const place = latestData.current.places.find(
            (p) => p.id === placeHit?.properties?.id,
          );
          if (place) {
            callbacks.current.onSelect(place);
            return;
          }
          const modelId = models.current?.pick(event.point)?.buildingId;
          const model =
            modelId &&
            latestData.current.map.features.find(
              (f) => f.properties?.id === modelId,
            );
          if (model) {
            const linked = buildingPlace(latestData.current, model);
            if (linked) callbacks.current.onSelect(linked);
            else callbacks.current.onBuildingSelect?.(model);
            return;
          }
          const hits = map.queryRenderedFeatures(event.point, {
            layers: [
              'places-dot',
              'places-label',
              'places-label-detail',
              'buildings-3d',
              'buildings',
            ],
          });
          const hit = hits.find((f) => f.layer.id.startsWith('buildings'));
          const building =
            hit &&
            latestData.current.map.features.find(
              (f) =>
                f.properties?.kind === 'building' &&
                f.properties.id === hit.properties?.id,
            );
          if (building) {
            const linked = buildingPlace(latestData.current, building);
            if (linked) callbacks.current.onSelect(linked);
            else callbacks.current.onBuildingSelect?.(building);
          }
        });
        for (const layer of [
          'places-dot',
          'places-label',
          'places-label-detail',
          'places-label-selected',
          'buildings-3d',
          'buildings',
        ]) {
          map.on('mouseenter', layer, () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', layer, () => {
            map.getCanvas().style.cursor = '';
          });
        }
      }
      if (!editor) {
        for (const layer of map.getStyle().layers) {
          if (layer.id !== 'background' && !layer.id.startsWith('gps-'))
            map.setLayerZoomRange(
              layer.id,
              Math.max(CAMPUS_MIN_ZOOM, layer.minzoom || 0),
              layer.maxzoom || 24,
            );
        }
      }
      frame();
      ready.current = true;
      setMotionMap(map);
      disposeExtension = callbacks.current.onReady?.(map);
      applyMapTheme(map, camera.current.dark);
    });
    map.on('dragstart', () => callbacks.current.onManualPan?.());
    // Suspend following as soon as a gesture begins, before sensor camera
    // updates can interrupt MapLibre's first drag/rotation frame.
    for (const type of ['mousedown', 'touchstart', 'wheel'] as const)
      map.on(type, () => callbacks.current.onManualPan?.());
    for (const type of ['rotatestart', 'pitchstart', 'zoomstart'] as const)
      map.on(type, (event) => {
        if (event.originalEvent) callbacks.current.onManualPan?.();
      });
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(resizeFrame);
      mapResize.disconnect();
      window.visualViewport?.removeEventListener('resize', viewportResize);
      window.visualViewport?.removeEventListener('scroll', viewportResize);
      map.off('moveend', syncPadding);
      map.off('zoom', updateWorldView);
      map.off('moveend', syncWorldPitch);
      cancelAnimationFrame(pitchFrame);
      panelResize.disconnect();
      ready.current = false;
      setMotionMap(null);
      // Drawing adapters must release their layers while the map still owns its sources.
      disposeExtension?.();
      models.current?.dispose();
      models.current = null;
      map.remove();
      mapRef.current = null;
      ready.current = false;
    };
  }, [
    panelBesideMap,
    editor,
    camera,
    callbacks,
    models,
    setMapError,
    latestData,
    setWorldView,
    latestSources,
    appliedSources,
    mapRef,
    ready,
    container,
    setMotionMap,
  ]);
}
