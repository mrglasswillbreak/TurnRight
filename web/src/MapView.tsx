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
import type { CampusData, GpsFix, Place, Route } from './types';
import type { Feature, FeatureCollection } from 'geojson';
import { displayGeometry, buildingPlace } from './map-display';
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
  editor?: boolean;
  buildingOpacity?: number;
  follow?: boolean;
  motionActive?: boolean;
  panelBesideMap?: boolean;
  onSelect: (place: Place) => void;
  onBuildingSelect?: (feature: Feature) => void;
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
  editor = false,
  buildingOpacity = 0.92,
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
  const callbacks = useRef({ onSelect, onBuildingSelect, onManualPan, onReady });
  callbacks.current = { onSelect, onBuildingSelect, onManualPan, onReady };
  const ready = useRef(false);
  const campusGeometry = useMemo(() => displayGeometry(data.map), [data.map]);
  const placesGeometry = useMemo(() => placeFeatures(data.places), [data.places]);
  const closuresGeometry = useMemo(() => closureFeatures(data.graph, data.closures), [data.graph, data.closures]);
  const sourceData = useMemo(() => ({ campus: campusGeometry, boundary: data.boundary, places: placesGeometry, closures: closuresGeometry }), [campusGeometry, data.boundary, placesGeometry, closuresGeometry]);
  const latestSources = useRef(sourceData);
  latestSources.current = sourceData;
  const appliedSources = useRef<Record<string, unknown>>({});
  const latestData = useRef(data);
  latestData.current = data;
  const camera = useRef({ selected, routes, activeRoute, dark, threeD });
  camera.current = { selected, routes, activeRoute, dark, threeD };
  const [mapError, setMapError] = useState('');
  const [motionMap, setMotionMap] = useState<MapInstance | null>(null);
  const style = (theme: boolean): StyleSpecification => ({
    version: 8,
    glyphs: '/glyphs/{fontstack}/{range}.pbf',
    light: { anchor: 'viewport', color: theme ? '#becfe0' : '#ffffff', intensity: theme ? 0.35 : 0.45, position: [1.5, 210, 40] },
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': theme ? '#172126' : '#edf0eb' },
      },
    ],
  });
  useEffect(() => {
    if (!container.current) return;
    const dark = camera.current.dark;
    const data = latestData.current;
    let map: MapInstance;
    let disposeExtension: void | (() => void);
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: style(dark),
        center: [3.201, 6.465],
        zoom: 16,
        maxZoom: 20,
        minZoom: 13,
        attributionControl: false,
        trackResize: false,
        pitch: camera.current.threeD ? (editor ? 50 : innerWidth < 768 ? 40 : 45) : 0,
        maxPitch: 60,
      });
      setMapError('');
    } catch {
      setMapError(
        'This browser could not open the interactive map. Enable hardware acceleration or try a current browser. Place search is still available.',
      );
      return;
    }
    mapRef.current = map;
    const frame = () => {
      const mobile = innerWidth < 768,
        padding = panelBesideMap
          ? { top: 60, right: 40, bottom: 60, left: 40 }
          : {
              top: mobile ? 125 : 85,
              right: 70,
              bottom: mobile ? innerHeight * 0.49 : 65,
              left: mobile ? 25 : 485,
            };
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
        map.fitBounds(
          latestData.current.bounds,
          { padding, duration: 0, pitch: map.getPitch() },
        );
    };
    const resize = () => {
      requestAnimationFrame(() => {
        if (mapRef.current !== map) return;
        const center = map.getCenter();
        map.resize();
        // Resizing must not undo a manual pan, tilt, or ongoing edit.
        map.jumpTo({ center });
      });
    };
    window.addEventListener('resize', resize);
    map.on('error', (event) => console.error('Campus map:', event.error));
    map.on('webglcontextlost', () => setMapError('Map graphics paused. Restore this tab or reload to retry. Place search remains available.'));
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
        paint: { 'fill-color': dark ? '#243338' : '#f8faf5' },
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
            dark ? '#263f36' : '#dbe8cf',
            ['Water Body', 'Water'],
            '#bddce6',
            dark ? '#293a3a' : '#ecede1',
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
          'line-color': dark ? '#526068' : '#d6d6cf',
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
          'line-color': dark ? '#77808a' : '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 12],
        },
      });
      map.addLayer({
        id: 'buildings',
        type: 'fill',
        source: 'campus',
        filter: ['==', ['get', 'kind'], 'building'],
        paint: {
          'fill-color': dark ? '#52616c' : '#dce0e3',
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
        id: 'building-outlines',
        type: 'line', source: 'campus',
        filter: ['==', ['get', 'kind'], 'building'],
        paint: { 'line-color': dark ? '#9aabb3' : '#8094a1', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.5, 19, 1.4], 'line-opacity': 0.7 },
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
        paint: { 'line-color': '#ffffff', 'line-width': ['case', ['get', 'active'], 10, 6] },
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
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 3, 18, 5],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
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
      const label = map.getStyle().layers.find(l => l.id === 'places-label') as SymbolLayerSpecification;
      map.addLayer({ ...label, id: 'places-label-detail', minzoom: 16.8, filter: ['>', ['get', 'priority'], 1] });
      map.addLayer({ ...label, id: 'places-label-selected', minzoom: 13, filter: ['==', ['get', 'id'], ''], layout: { ...label.layout, 'text-size': 14, 'text-allow-overlap': true } }, 'places-label');
      map.addLayer({ ...label, id: 'route-end-labels', source: 'route-labels', minzoom: 13, filter: ['has', 'name'],
        layout: { ...label.layout, 'text-size': 13, 'text-offset': [0, -1], 'text-anchor': 'bottom', 'text-allow-overlap': true },
        paint: { ...label.paint, 'text-color': '#085adb', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
      }, 'places-label-selected');
      if (!editor) {
        map.on('click', event => {
          const hits = map.queryRenderedFeatures(event.point, { layers: ['places-dot', 'places-label', 'places-label-detail', 'buildings-3d', 'buildings'] });
          const placeHit = hits.find(f => f.layer.id.startsWith('places'));
          const place = latestData.current.places.find(p => p.id === placeHit?.properties?.id);
          if (place) { callbacks.current.onSelect(place); return; }
          const hit = hits.find(f => f.layer.id.startsWith('buildings'));
          const building = hit && latestData.current.map.features.find(f => f.properties?.kind === 'building' && f.properties.id === hit.properties?.id);
          if (building) {
            const linked = buildingPlace(latestData.current, building);
            if (linked) callbacks.current.onSelect(linked);
            else callbacks.current.onBuildingSelect?.(building);
          }
        });
        for (const layer of ['places-dot', 'places-label', 'places-label-detail', 'buildings-3d', 'buildings']) {
          map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
        }
      }
      frame();
      ready.current = true;
      setMotionMap(map);
      disposeExtension = callbacks.current.onReady?.(map);
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
      const paint: [
        string,
        Parameters<MapInstance['setPaintProperty']>[1],
        Parameters<MapInstance['setPaintProperty']>[2],
      ][] = [
        ['background', 'background-color', dark ? '#172126' : '#edf0eb'],
        ['campus-fill', 'fill-color', dark ? '#243338' : '#f8faf5'],
        [
          'land',
          'fill-color',
          [
            'match',
            ['get', 'name'],
            ['Green Area', 'Vegetation', 'Forest'],
            dark ? '#263f36' : '#dbe8cf',
            ['Water Body', 'Water'],
            '#bddce6',
            dark ? '#293a3a' : '#ecede1',
          ],
        ],
        ['roads-case', 'line-color', dark ? '#526068' : '#d6d6cf'],
        ['roads', 'line-color', dark ? '#77808a' : '#ffffff'],
        ['buildings', 'fill-color', dark ? '#52616c' : '#dce0e3'],
        ['buildings', 'fill-outline-color', dark ? '#697985' : '#c2cbd0'],
        ['building-outlines', 'line-color', dark ? '#9aabb3' : '#8094a1'],
        ['buildings-3d', 'fill-extrusion-color', dark ? '#52616c' : '#d5dce5'],
        ['places-label', 'text-color', dark ? '#d7e3ee' : '#53616b'],
        ['places-label', 'text-halo-color', dark ? '#213039' : '#ffffff'],
      ];
      for (const [layer, property, value] of paint)
        if (map.getLayer(layer)) map.setPaintProperty(layer, property, value);
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
      map.setFilter('buildings-3d', ['==', ['get', 'kind'], 'building']);
      map.setPaintProperty('buildings-3d', 'fill-extrusion-height', ['get', 'displayHeight']);
      map.setPaintProperty('buildings-3d', 'fill-extrusion-opacity', buildingOpacity);
      const selectedBuilding = selected && data.map.features.find(f => f.properties?.kind === 'building' && buildingPlace(data, f)?.id === selected.id);
      map.setPaintProperty('buildings-3d', 'fill-extrusion-color', [
        'case', ['==', ['get', 'id'], String(selectedBuilding?.properties?.id || '')], dark ? '#5799e5' : '#6ca2da',
        ['==', ['get', 'heightKind'], 'illustrative'], dark ? '#475b56' : '#c5d2cb',
        dark ? '#728b9e' : '#b3c6d8',
      ]);
      map.setLight({ color: dark ? '#becfe0' : '#ffffff', intensity: dark ? 0.35 : 0.45 });
      map.setFilter('places-label-selected', ['==', ['get', 'id'], selected?.id || '']);
      map.setFilter('places-label', ['all', ['<=', ['get', 'priority'], 1], ['!=', ['get', 'id'], selected?.id || '']]);
      map.setFilter('places-label-detail', ['all', ['>', ['get', 'priority'], 1], ['!=', ['get', 'id'], selected?.id || '']]);
      for (const layer of ['places-label', 'places-label-detail', 'places-label-selected']) {
        map.setPaintProperty(layer, 'text-color', dark ? '#d7e3ee' : '#53616b');
        map.setPaintProperty(layer, 'text-halo-color', dark ? '#213039' : '#ffffff');
        map.setLayoutProperty(layer, 'symbol-sort-key', ['case', ['==', ['get', 'id'], selected?.id || ''], 0, ['get', 'priority']]);
      }
    };
    if (ready.current) apply();
    else map.once('load', apply);
    return () => {
      map.off('load', apply);
    };
  }, [editor, buildingOpacity, dark, selected?.id, data.map, data.places]);
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
    if (!map || !selected) return;
    const marker = new maplibregl.Marker({ color: '#1764ed', scale: 0.85 })
      .setLngLat(selected.coordinates)
      .addTo(map);
    map.flyTo({
      center: selected.coordinates,
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
  }, [selected?.id, selected?.coordinates, panelBesideMap]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const route = routes[activeRoute];
      (map.getSource('route-labels') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: route ? [
        { type: 'Feature', properties: { name: 'Start' }, geometry: { type: 'Point', coordinates: route.coordinates[0] } },
        { type: 'Feature', properties: { name: selected?.name || 'Destination' }, geometry: { type: 'Point', coordinates: route.coordinates.at(-1)! } },
      ] : [] });
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
    return () => { map.off('load', apply); };
  }, [routes, activeRoute, panelBesideMap, selected?.name]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!fix) { (map.getSource('position') as GeoJSONSource)?.setData(empty); return; }
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
    return () => { map.off('load', apply); };
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
      {mapError && (
        <div className="map-error" role="alert">
          {mapError}
        </div>
      )}
    </>
  );
}
