import { useBuildingPreview } from './useBuildingPreview';
import type { BuildingSelection } from './visual-types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MotionMap } from './MotionAssistance';
import { publicMapPadding } from './public-map-layout';
import {
  CAMPUS_MIN_ZOOM,
  WORLD_PROJECTION,
  installWorldLayers,
  loadWorld,
  returnToCampus,
} from './world-map';
import * as maplibregl from 'maplibre-gl';
import type {
  Map as MapInstance,
  GeoJSONSource,
  StyleSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './models.css';
import { markModelSelection } from './model-selection';
import type { CampusData, GpsFix, Place, Route } from './types';
import type { Feature, FeatureCollection } from 'geojson';
import { displayGeometry, buildingPlace } from './map-display';
import { campusPalette } from './map-palette';
import { entranceConnected, placeEntrances } from './arrival';
import { applyMapTheme } from './map-theme';
import { installPlaceBadges } from './place-badges';
import type { createCampusModels, ModelStatus } from './campus-model-layer';
import { placeFeatures, closureFeatures } from './map-sources';
const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
maplibregl.setWorkerUrl(mapWorkerUrl);
const noRoutes: Route[] = [];
export interface MapViewProps {
  selectedStreet?: string | null;
  data: CampusData;
  selected?: Place | null;
  routes?: Route[];
  activeRoute?: number;
  fix?: GpsFix | null;
  dark?: boolean;
  threeD?: boolean;
  simple?: boolean;
  editor?: boolean;
  buildingOpacity?: number;
  editing?: boolean;
  buildingSelection?: BuildingSelection;
  follow?: boolean;
  motionActive?: boolean;
  panelBesideMap?: boolean;
  onSelect: (place: Place) => void;
  onBuildingSelect?: (feature: Feature, selection?: BuildingSelection) => void;
  onManualPan?: () => void;
  onWorldViewChange?: (world: boolean) => void;
  onReady?: (map: MapInstance) => void | (() => void);
}
export function MapView({
  data,
  selectedStreet,
  selected,
  routes = noRoutes,
  activeRoute = 0,
  fix,
  dark = false,
  threeD = false,
  simple = false,
  editor = false,
  buildingOpacity = 0.92,
  editing = false,
  buildingSelection,
  follow = false,
  motionActive = false,
  panelBesideMap = false,
  onSelect,
  onBuildingSelect,
  onManualPan,
  onWorldViewChange,
  onReady,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null),
    mapRef = useRef<MapInstance | null>(null);
  const callbacks = useRef({
    onSelect,
    onBuildingSelect,
    onManualPan,
    onWorldViewChange,
    onReady,
  });
  callbacks.current = {
    onSelect,
    onBuildingSelect,
    onManualPan,
    onWorldViewChange,
    onReady,
  };
  const ready = useRef(false);
  const models = useRef<ReturnType<typeof createCampusModels> | null>(null);
  const [modelIds, setModelIds] = useState<string[]>([]),
    [modelStatus, setModelStatus] = useState<ModelStatus>('ready'),
    [modelAttempt, setModelAttempt] = useState(0);
  const campusGeometry = useMemo(
    () => displayGeometry(data.map, data.visuals),
    [data.map, data.visuals],
  );
  const placesGeometry = useMemo(
    () => placeFeatures(data.places),
    [data.places],
  );
  const closuresGeometry = useMemo(
    () => closureFeatures(data.graph, data.closures),
    [data.graph, data.closures],
  );
  const sourceData = useMemo(
    () => ({
      campus: campusGeometry,
      boundary: data.boundary,
      places: placesGeometry,
      closures: closuresGeometry,
    }),
    [campusGeometry, data.boundary, placesGeometry, closuresGeometry],
  );
  const latestSources = useRef(sourceData);
  latestSources.current = sourceData;
  const appliedSources = useRef<Record<string, unknown>>({});
  const latestData = useRef(data);
  latestData.current = data;
  const camera = useRef({ selected, routes, activeRoute, dark, threeD });
  camera.current = { selected, routes, activeRoute, dark, threeD };
  const [mapError, setMapError] = useState('');
  const [worldError, setWorldError] = useState(false),
    [worldAttempt, setWorldAttempt] = useState(0),
    [worldView, setWorldView] = useState(false);
  const [motionMap, setMotionMap] = useState<MapInstance | null>(null);
  const selectedId = selected?.id || '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer('street-selected')) return;
      map.setFilter('street-selected', [
        '==',
        ['get', 'id'],
        selectedStreet || '',
      ]);
      const street = data.map.features.find(
        (f) => f.properties?.id === selectedStreet,
      );
      if (street?.geometry.type === 'LineString') {
        const bounds = new maplibregl.LngLatBounds();
        street.geometry.coordinates.forEach((p) => bounds.extend([p[0], p[1]]));
        map.fitBounds(bounds, {
          padding: container.current ? publicMapPadding(container.current) : 24,
          maxZoom: 19,
        });
      }
    };
    if (ready.current) apply();
    else map.once('load', apply);
    return () => {
      map.off('load', apply);
    };
  }, [selectedStreet, data]);
  const selectedLng = selected?.coordinates[0],
    selectedLat = selected?.coordinates[1];
  const selectedBuildingId = useMemo(
    () =>
      buildingSelection?.buildingId ||
      String(
        data.map.features.find(
          (f) =>
            f.properties?.kind === 'building' &&
            buildingPlace(data, f)?.id === selectedId,
        )?.properties?.id || '',
      ),
    [data, selectedId, buildingSelection?.buildingId],
  );
  const style = (theme: boolean): StyleSpecification => ({
    version: 8,
    glyphs: '/glyphs/{fontstack}/{range}.pbf',
    light: {
      anchor: 'viewport',
      color: theme ? '#becfe0' : '#ffffff',
      intensity: theme ? 0.35 : 0.45,
      position: [1.5, 210, 40],
    },
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': campusPalette[theme ? 'dark' : 'light'].ground,
        },
      },
    ],
  });
  useEffect(() => {
    if (!container.current) return;
    const dark = camera.current.dark;
    const palette = campusPalette[dark ? 'dark' : 'light'];
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
        : publicMapPadding(map.getContainer());
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
    const resize = () => {
      requestAnimationFrame(() => {
        if (mapRef.current !== map) return;
        const center = map.getCenter();
        map.resize();
        // Resizing must not undo a manual pan, tilt, or ongoing edit.
        map.jumpTo({ center, padding: mapPadding() });
      });
    };
    window.addEventListener('resize', resize);
    const viewportResize = () => requestAnimationFrame(requestPadding);
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
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: [
          '© OpenStreetMap contributors',
          'LASU / MangroveandpartnersLimited',
        ],
      }),
      'bottom-right',
    );
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
      map.addLayer({
        id: 'campus-fill',
        type: 'fill',
        source: 'boundary',
        paint: { 'fill-color': dark ? '#243632' : '#faf5e8' },
      });
      map.addLayer({
        id: 'land',
        type: 'fill',
        source: 'campus',
        filter: ['==', ['get', 'kind'], 'land'],
        paint: {
          'fill-color': [
            'match',
            ['get', 'name'],
            ['Green Area', 'Vegetation', 'Forest'],
            dark ? '#3b5645' : '#c0d0ac',
            ['Water Body', 'Water'],
            palette.water,
            dark ? '#34473e' : '#eee4cf',
          ],
          'fill-opacity': 0.65,
        },
      });
      map.addLayer({
        id: 'boundary-line',
        type: 'line',
        source: 'boundary',
        paint: {
          'line-color': '#809b78',
          'line-width': 1.5,
          'line-dasharray': [3, 4],
          'line-opacity': 0.7,
        },
      });
      map.addLayer({
        id: 'roads-case',
        type: 'line',
        source: 'campus',
        filter: ['==', ['get', 'kind'], 'path'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': dark ? '#57665b' : '#cec1a6',
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 15],
        },
      });
      map.addLayer({
        id: 'roads',
        type: 'line',
        source: 'campus',
        filter: ['==', ['get', 'kind'], 'path'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': dark ? '#9c9a7c' : '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 12],
        },
      });
      map.addLayer({
        id: 'building-contact',
        type: 'fill',
        source: 'campus',
        filter: ['==', ['get', 'kind'], 'building'],
        paint: {
          'fill-color': '#293329',
          'fill-opacity': 0.13,
          'fill-translate': [2, 3],
          'fill-translate-anchor': 'viewport',
        },
      });
      map.addLayer({
        id: 'buildings',
        type: 'fill',
        source: 'campus',
        filter: ['==', ['get', 'kind'], 'building'],
        paint: {
          'fill-color': ['get', 'displayRoof'],
          'fill-outline-color': dark ? '#697985' : '#c2cbd0',
        },
      });
      map.addLayer({
        id: 'buildings-3d',
        type: 'fill-extrusion',
        source: 'campus',
        filter: [
          'all',
          ['==', ['get', 'kind'], 'building'],
          ['>', ['get', 'displayHeight'], 0],
        ],
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': dark ? '#52616c' : '#d5dce5',
          'fill-extrusion-height': ['get', 'displayHeight'],
          'fill-extrusion-vertical-gradient': true,
          'fill-extrusion-opacity': 0.92,
        },
      });
      map.addLayer({
        id: 'building-roofs',
        type: 'fill-extrusion',
        source: 'campus',
        filter: ['==', ['get', 'kind'], 'building'],
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': ['get', 'displayRoof'],
          'fill-extrusion-base': ['get', 'displayHeight'],
          'fill-extrusion-height': ['+', ['get', 'displayHeight'], 0.04],
          'fill-extrusion-opacity': 0.92,
          'fill-extrusion-vertical-gradient': false,
        },
      });
      map.addLayer({
        id: 'building-outlines',
        type: 'line',
        source: 'campus',
        filter: ['==', ['get', 'kind'], 'building'],
        paint: {
          'line-color': dark ? '#9aabb3' : '#8094a1',
          'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.5, 19, 1.4],
          'line-opacity': 0.7,
        },
      });
      map.addLayer({
        id: 'barriers',
        type: 'line',
        source: 'campus',
        filter: ['==', ['get', 'kind'], 'barrier'],
        paint: {
          'line-color': '#b7947e',
          'line-width': 1.5,
          'line-dasharray': [2, 1],
        },
      });
      map.addLayer({
        id: 'closed-paths',
        type: 'line',
        source: 'closures',
        paint: {
          'line-color': ['case', ['get', 'conflict'], '#c58937', '#d34b4b'],
          'line-width': 5,
          'line-dasharray': [2, 2],
        },
      });
      map.addLayer({
        id: 'routes-case',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['case', ['get', 'active'], 10, 6],
        },
      });
      map.addLayer({
        id: 'routes-line',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'case',
            ['!', ['get', 'active']],
            '#809ac2',
            ['==', ['get', 'mode'], 'driving'],
            '#8b36c9',
            '#085adb',
          ],
          'line-width': ['case', ['get', 'active'], 6.5, 3.5],
        },
      });
      map.addLayer({
        id: 'places-dot',
        type: 'circle',
        source: 'places',
        minzoom: 14.5,
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14.5,
            ['case', ['<=', ['get', 'priority'], 1], 3, 1.3],
            17,
            4,
            19,
            5,
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14.5,
            0.7,
            18,
            1.5,
          ],
        },
      });
      map.addLayer({
        id: 'places-label',
        type: 'symbol',
        source: 'places',
        minzoom: 14.3,
        filter: ['<=', ['get', 'priority'], 1],
        layout: {
          'symbol-sort-key': ['get', 'priority'],
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 11, 18, 13],
          'text-max-width': 11,
          'text-offset': [0, 1],
          'text-anchor': 'top',
          'text-padding': 12,
        },
        paint: {
          'text-color': dark ? '#d7e3ee' : '#53616b',
          'text-halo-color': dark ? '#213039' : '#ffffff',
          'text-halo-width': 1.6,
        },
      });
      installPlaceBadges(map);
      map.addLayer({
        id: 'street-selected',
        type: 'line',
        source: 'campus',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'line-color': '#f59e0b',
          'line-width': 7,
          'line-opacity': 0.8,
        },
      });
      map.addLayer(
        {
          id: 'street-labels',
          type: 'symbol',
          source: 'campus',
          minzoom: 16,
          filter: [
            'all',
            ['==', ['get', 'kind'], 'path'],
            ['!=', ['get', 'streetLabel'], ''],
          ],
          layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 300,
            'text-field': ['get', 'streetLabel'],
            'text-font': ['Open Sans Semibold'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 16, 10, 19, 12],
            'text-letter-spacing': 0.08,
            'text-transform': 'uppercase',
            'text-max-angle': 30,
            'text-padding': 8,
            'text-pitch-alignment': 'map',
          },
        },
        'places-label',
      );
      map.addLayer({
        id: 'gps-accuracy',
        type: 'fill',
        source: 'position',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#1764ed', 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: 'gps-dot',
        type: 'circle',
        source: 'position',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': '#1764ed',
          'circle-radius': 8,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 3,
        },
      });
      const label = map
        .getStyle()
        .layers.find(
          (l) => l.id === 'places-label',
        ) as SymbolLayerSpecification;
      map.addLayer({
        ...label,
        id: 'places-label-detail',
        minzoom: 16.8,
        filter: ['>', ['get', 'priority'], 1],
      });
      map.addLayer(
        {
          ...label,
          id: 'places-label-selected',
          minzoom: 13,
          filter: ['==', ['get', 'id'], ''],
          layout: {
            ...label.layout,
            'text-size': 14,
            'text-allow-overlap': true,
            'icon-allow-overlap': true,
          },
        },
        'places-label',
      );
      map.addLayer(
        {
          ...label,
          id: 'route-end-labels',
          source: 'route-labels',
          minzoom: 13,
          filter: ['has', 'name'],
          layout: {
            ...label.layout,
            'symbol-sort-key': 0,
            'text-size': 13,
            'text-offset': [0, -1],
            'text-anchor': 'bottom',
            'text-allow-overlap': true,
          },
          paint: {
            ...label.paint,
            'text-color': '#085adb',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          },
        },
        'places-label-selected',
      );
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
          if (map.getZoom() < CAMPUS_MIN_ZOOM) {
            if (
              map.getLayer('world-campus-dot') &&
              map.queryRenderedFeatures(event.point, {
                layers: ['world-campus-dot', 'world-campus-label'],
              }).length
            ) {
              callbacks.current.onManualPan?.();
              returnToCampus(map, latestData.current.bounds);
            }
            return;
          }
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
          if (layer.id !== 'background')
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
  }, [panelBesideMap, editor]);
  useEffect(() => {
    if (!motionMap || editor) return;
    const controller = new AbortController();
    setWorldError(false);
    void loadWorld(controller.signal)
      .then((world) => {
        if (controller.signal.aborted || mapRef.current !== motionMap) return;
        installWorldLayers(motionMap, world, latestData.current.bounds);
        applyMapTheme(motionMap, camera.current.dark);
      })
      .catch(() => {
        if (!controller.signal.aborted) setWorldError(true);
      });
    return () => controller.abort();
  }, [motionMap, editor, worldAttempt]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      // Repaint in place: device changes must not reset a walk, camera or editor.
      applyMapTheme(map, dark);
    };
    if (ready.current) apply();
    else map.once('load', apply);
    return () => {
      map.off('load', apply);
    };
  }, [dark, panelBesideMap, editor]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer('buildings-3d')) return;
      map.setLayoutProperty(
        'buildings-3d',
        'visibility',
        threeD ? 'visible' : 'none',
      );
      map.setLayoutProperty(
        'building-roofs',
        'visibility',
        threeD ? 'visible' : 'none',
      );
      const pitch =
        threeD && (editor || map.getZoom() >= CAMPUS_MIN_ZOOM)
          ? editor
            ? 50
            : innerWidth < 768
              ? 40
              : 45
          : 0;
      if (map.getPitch() !== pitch) map.easeTo({ pitch, duration: 500 });
    };
    if (ready.current) apply();
    else map.once('load', apply);
    return () => {
      map.off('load', apply);
    };
  }, [threeD, panelBesideMap, editor]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer('buildings-3d')) return;
      for (const layer of ['buildings-3d', 'building-roofs'])
        map.setFilter(layer, [
          'all',
          ['==', ['get', 'kind'], 'building'],
          ['!', ['in', ['get', 'id'], ['literal', modelIds]]],
        ]);
      map.setPaintProperty('buildings-3d', 'fill-extrusion-height', [
        'get',
        'displayHeight',
      ]);
      map.setPaintProperty(
        'buildings-3d',
        'fill-extrusion-opacity',
        buildingOpacity,
      );
      map.setPaintProperty(
        'building-roofs',
        'fill-extrusion-opacity',
        buildingOpacity,
      );
      map.setFilter('places-label-selected', ['==', ['get', 'id'], selectedId]);
      map.setFilter('places-label', [
        'all',
        ['<=', ['get', 'priority'], 1],
        ['!=', ['get', 'id'], selectedId],
      ]);
      map.setFilter('places-label-detail', [
        'all',
        ['>', ['get', 'priority'], 1],
        ['!=', ['get', 'id'], selectedId],
      ]);
      for (const layer of [
        'places-label',
        'places-label-detail',
        'places-label-selected',
      ]) {
        map.setLayoutProperty(layer, 'symbol-sort-key', [
          'case',
          ['==', ['get', 'id'], selectedId],
          0,
          ['get', 'priority'],
        ]);
      }
      applyMapTheme(map, dark);
    };
    if (ready.current) apply();
    else map.once('load', apply);
    return () => {
      map.off('load', apply);
    };
  }, [editor, buildingOpacity, dark, selectedId, selectedBuildingId, modelIds]);
  const buildingPreview = useBuildingPreview(
    data,
    selectedBuildingId,
    editor && threeD && !simple,
  );
  const modelOptions = useRef<Parameters<typeof createCampusModels>[1]>({
    data,
    enabled: false,
    dark,
    selectedId: selectedBuildingId,
    onReady: setModelIds,
    onStatus: setModelStatus,
  });
  modelOptions.current = {
    data,
    enabled: threeD && !simple && !editing,
    selection: buildingSelection,
    opacity: buildingOpacity,
    overrides: buildingPreview.models,
    dark,
    selectedId: selectedBuildingId,
    onReady: setModelIds,
    onStatus: setModelStatus,
  };
  const visualRevision =
    data.visuals?.revision || (editor ? 'editor-preview' : undefined);
  useEffect(() => {
    if (!motionMap || !visualRevision || !threeD || simple) return;
    let cancelled = false;
    setModelStatus('ready');
    void import('./campus-model-layer')
      .then(({ createCampusModels }) => {
        if (cancelled || mapRef.current !== motionMap) return;
        models.current = createCampusModels(motionMap, modelOptions.current);
      })
      .catch(() => {
        if (!cancelled) setModelStatus('unavailable');
      });
    return () => {
      cancelled = true;
      models.current?.dispose();
      models.current = null;
    };
  }, [motionMap, visualRevision, threeD, simple, modelAttempt]);
  useEffect(() => {
    models.current?.update(modelOptions.current);
  }, [
    data.map,
    data.visuals,
    dark,
    threeD,
    simple,
    editing,
    buildingOpacity,
    selectedBuildingId,
    buildingSelection,
    buildingPreview.models,
  ]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      for (const [id, value] of Object.entries(sourceData)) {
        if (appliedSources.current[id] === value) continue;
        (map.getSource(id) as GeoJSONSource)?.setData(value);
        appliedSources.current[id] = value;
      }
    };
    if (ready.current) apply();
    else map.once('load', apply);
    return () => {
      map.off('load', apply);
    };
  }, [sourceData]);
  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      !selectedId ||
      selectedLng === undefined ||
      selectedLat === undefined
    )
      return;
    const marker = new maplibregl.Marker({ color: '#1764ed', scale: 0.85 })
      .setLngLat([selectedLng, selectedLat])
      .addTo(map);
    map.flyTo({
      center: [selectedLng, selectedLat],
      zoom: Math.max(map.getZoom(), 17),
      padding: panelBesideMap
        ? { top: 40, right: 40, bottom: 40, left: 40 }
        : publicMapPadding(map.getContainer()),
      duration: 750,
    });
    return () => {
      marker.remove();
    };
  }, [selectedId, selectedLng, selectedLat, panelBesideMap]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId || editor) return;
    const markers = placeEntrances(data, selectedId).map((entrance) => {
      const connected = entranceConnected(data, entrance);
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `entrance-marker ${connected ? 'connected' : 'unconfirmed'}`;
      element.textContent = connected ? '↪' : '?';
      const label = `${entrance.name}: ${connected ? 'connected entrance' : 'unconfirmed or restricted connection'}`;
      element.setAttribute('aria-label', label);
      element.title = label;
      return new maplibregl.Marker({ element })
        .setLngLat(entrance.coordinates)
        .setPopup(new maplibregl.Popup({ offset: 18 }).setText(label))
        .addTo(map);
    });
    const place = data.places.find((p) => p.id === selectedId);
    const approach =
      place?.arrivalKind === 'mapped-approach' &&
      data.graph.nodes.find((node) => node.id === place.graphNode);
    if (approach) {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'entrance-marker mapped-approach';
      element.textContent = '◇';
      const label = `Mapped approach to ${place.name}; final entrance not verified`;
      element.setAttribute('aria-label', label);
      element.title = label;
      markers.push(
        new maplibregl.Marker({ element })
          .setLngLat(approach.coordinates)
          .setPopup(new maplibregl.Popup({ offset: 18 }).setText(label))
          .addTo(map),
      );
    }
    return () => markers.forEach((marker) => marker.remove());
  }, [data, selectedId, editor]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const route = routes[activeRoute];
      (map.getSource('route-labels') as GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: route
          ? [
              {
                type: 'Feature',
                properties: { name: 'Start' },
                geometry: { type: 'Point', coordinates: route.coordinates[0] },
              },
              {
                type: 'Feature',
                properties: {
                  name: (
                    (route.mode === 'driving' && !route.legs
                      ? route.parkingName
                      : selected?.name) || 'Destination'
                  ).replace(/[^\x20-\x7E]/g, ' '),
                },
                geometry: {
                  type: 'Point',
                  coordinates: route.coordinates.at(-1)!,
                },
              },
            ]
          : [],
      });
      (map.getSource('routes') as GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: [...routes.entries()]
          .sort(
            ([i], [j]) => Number(i === activeRoute) - Number(j === activeRoute),
          )
          .flatMap(([i, journey]) =>
            (journey.legs || [journey]).map((r) => ({
              type: 'Feature',
              properties: {
                active: i === activeRoute,
                mode: r.mode || 'walking',
              },
              geometry: {
                type: 'LineString',
                coordinates:
                  r.coordinates.length > 1
                    ? r.coordinates
                    : [...r.coordinates, ...r.coordinates],
              },
            })),
          ),
      });
    };
    if (ready.current) apply();
    else map.once('load', apply);
    return () => {
      map.off('load', apply);
    };
  }, [routes, activeRoute, panelBesideMap, selected?.name]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!fix) {
        (map.getSource('position') as GeoJSONSource)?.setData(empty);
        return;
      }
      const ring = Array.from({ length: 49 }, (_, i) => {
        const angle = (i / 48) * Math.PI * 2;
        return [
          fix.coordinates[0] +
            (Math.cos(angle) * fix.accuracy) /
              (111320 * Math.cos((fix.coordinates[1] * Math.PI) / 180)),
          fix.coordinates[1] + (Math.sin(angle) * fix.accuracy) / 111320,
        ];
      });
      (map.getSource('position') as GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: fix.coordinates },
          },
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [ring] },
          },
        ],
      });
    };
    const frame = requestAnimationFrame(() => {
      if (ready.current) apply();
    });
    if (!ready.current) map.once('load', apply);
    return () => {
      cancelAnimationFrame(frame);
      map.off('load', apply);
    };
  }, [fix, panelBesideMap]);
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
          worldView
            ? 'Interactive world map'
            : 'Interactive map of LASU Ojo campus'
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
