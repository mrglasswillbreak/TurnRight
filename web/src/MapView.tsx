import { useBuildingPreview } from './useBuildingPreview';
import type { BuildingSelection } from './visual-types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MotionMap } from './MotionAssistance';
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
import { applyMapTheme } from './map-theme';
import { installPlaceBadges } from './place-badges';
import type { createCampusModels, ModelStatus } from './campus-model-layer';
import { placeFeatures, closureFeatures } from './map-sources';
const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
maplibregl.setWorkerUrl(mapWorkerUrl);
const noRoutes: Route[] = [];
export interface MapViewProps {
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
  onReady?: (map: MapInstance) => void | (() => void);
}
export function MapView({
  data,
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
  onReady,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null),
    mapRef = useRef<MapInstance | null>(null);
  const callbacks = useRef({
    onSelect,
    onBuildingSelect,
    onManualPan,
    onReady,
  });
  callbacks.current = { onSelect, onBuildingSelect, onManualPan, onReady };
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
  const [motionMap, setMotionMap] = useState<MapInstance | null>(null);
  const selectedId = selected?.id || '';
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
        style: style(dark),
        center: [3.201, 6.465],
        zoom: 16,
        maxZoom: 20,
        minZoom: 12,
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
    const mapPadding = () => {
      const mobile = innerWidth < 768;
      return panelBesideMap
        ? { top: 60, right: 40, bottom: 60, left: 40 }
        : {
            top: mobile ? 125 : 85,
            right: 70,
            bottom: mobile ? innerHeight * 0.49 : 65,
            left: mobile ? 25 : 485,
          };
    };
    const frame = () => {
      const padding = mapPadding();
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
        map.jumpTo({ center: current.selected.coordinates, zoom: 17, padding });
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
          'line-color': ['case', ['get', 'active'], '#085adb', '#809ac2'],
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
      const pitch = threeD ? (editor ? 50 : innerWidth < 768 ? 40 : 45) : 0;
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
    data,
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
      padding: {
        left: panelBesideMap ? 40 : window.innerWidth > 767 ? 360 : 0,
        bottom: panelBesideMap ? 40 : window.innerWidth < 768 ? 180 : 0,
      },
      duration: 750,
    });
    return () => {
      marker.remove();
    };
  }, [selectedId, selectedLng, selectedLat, panelBesideMap]);
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
                  name: (selected?.name || 'Destination').replace(
                    /[^\x20-\x7E]/g,
                    ' ',
                  ),
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
          .map(([i, r]) => ({
            type: 'Feature',
            properties: { active: i === activeRoute },
            geometry: {
              type: 'LineString',
              coordinates:
                r.coordinates.length > 1
                  ? r.coordinates
                  : [...r.coordinates, ...r.coordinates],
            },
          })),
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
    if (ready.current) apply();
    else map.once('load', apply);
    return () => {
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
        />
      )}
      <div
        className="map-canvas"
        ref={container}
        aria-label="Interactive map of LASU Ojo campus"
      />
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
