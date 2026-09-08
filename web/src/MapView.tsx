import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapInstance, GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CampusData, GpsFix, Place, Route } from './types';
import type { FeatureCollection } from 'geojson';
const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
const colors: Record<string, string> = { academic: '#6863cf', library: '#406fc3', worship: '#ad789e', food: '#db8741', services: '#337f91', residence: '#8896a5', sports: '#639466', gate: '#d58b4d', other: '#778795' };
export interface MapViewProps { data: CampusData; selected?: Place | null; routes?: Route[]; activeRoute?: number; fix?: GpsFix | null; dark?: boolean; threeD?: boolean; follow?: boolean; onSelect: (place: Place) => void; onManualPan?: () => void; onReady?: (map: MapInstance) => void }
export function MapView({ data, selected, routes = [], activeRoute = 0, fix, dark = false, threeD = false, follow = false, onSelect, onManualPan, onReady }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null), mapRef = useRef<MapInstance | null>(null);
  const callbacks = useRef({ onSelect, onManualPan, onReady }); callbacks.current = { onSelect, onManualPan, onReady };
  const ready = useRef(false);
  const style = (theme: boolean): StyleSpecification => ({ version: 8, glyphs: '/glyphs/{fontstack}/{range}.pbf', sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': theme ? '#172126' : '#edf0eb' } }] });
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({ container: container.current, style: style(dark), center: [3.201, 6.465], zoom: 16, maxZoom: 20, minZoom: 13, attributionControl: false, pitch: 0 });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: ['© OpenStreetMap contributors', 'LASU / MangroveandpartnersLimited'] }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), 'bottom-left');
    map.on('load', () => {
      map.addSource('campus', { type: 'geojson', data: data.map });
      map.addSource('boundary', { type: 'geojson', data: data.boundary });
      map.addSource('places', { type: 'geojson', data: { type: 'FeatureCollection', features: data.places.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p.coordinates }, properties: { id: p.id, name: p.name.replace(/[^\x20-\x7E]/g, ' '), category: p.category, color: colors[p.category] } })) } });
      map.addSource('routes', { type: 'geojson', data: empty });
      map.addSource('position', { type: 'geojson', data: empty });
      map.addLayer({ id: 'campus-fill', type: 'fill', source: 'boundary', paint: { 'fill-color': dark ? '#243338' : '#f8faf5' } });
      map.addLayer({ id: 'land', type: 'fill', source: 'campus', filter: ['==', ['get', 'kind'], 'land'], paint: { 'fill-color': ['match', ['get', 'name'], ['Green Area', 'Vegetation', 'Forest'], dark ? '#263f36' : '#dbe8cf', ['Water Body', 'Water'], '#bddce6', dark ? '#293a3a' : '#ecede1'], 'fill-opacity': 0.65 } });
      map.addLayer({ id: 'boundary-line', type: 'line', source: 'boundary', paint: { 'line-color': '#809b78', 'line-width': 1.5, 'line-dasharray': [3, 4], 'line-opacity': 0.7 } });
      map.addLayer({ id: 'roads-case', type: 'line', source: 'campus', filter: ['==', ['get', 'kind'], 'path'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': dark ? '#526068' : '#d6d6cf', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 15] } });
      map.addLayer({ id: 'roads', type: 'line', source: 'campus', filter: ['==', ['get', 'kind'], 'path'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': dark ? '#77808a' : '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 12] } });
      map.addLayer({ id: 'buildings', type: 'fill', source: 'campus', filter: ['==', ['get', 'kind'], 'building'], paint: { 'fill-color': dark ? '#52616c' : '#dce0e3', 'fill-outline-color': dark ? '#697985' : '#c2cbd0' } });
      map.addLayer({ id: 'buildings-3d', type: 'fill-extrusion', source: 'campus', filter: ['all', ['==', ['get', 'kind'], 'building'], ['>', ['coalesce', ['get', 'height'], 0], 0]], layout: { visibility: 'none' }, paint: { 'fill-extrusion-color': dark ? '#52616c' : '#d5dce5', 'fill-extrusion-height': ['coalesce', ['get', 'height'], 0], 'fill-extrusion-opacity': 0.92 } });
      map.addLayer({ id: 'barriers', type: 'line', source: 'campus', filter: ['==', ['get', 'kind'], 'barrier'], paint: { 'line-color': '#b7947e', 'line-width': 1.5, 'line-dasharray': [2, 1] } });
      map.addLayer({ id: 'routes-case', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9 } });
      map.addLayer({ id: 'routes-line', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['get', 'active'], '#1764ed', '#a2b8e8'], 'line-width': ['case', ['get', 'active'], 6, 4] } });
      map.addLayer({ id: 'places-dot', type: 'circle', source: 'places', minzoom: 14.5, paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 3, 18, 5], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'places-label', type: 'symbol', source: 'places', minzoom: 15.2, layout: { 'text-field': ['get', 'name'], 'text-font': ['Open Sans Semibold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 15, 11, 18, 13], 'text-max-width': 11, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-padding': 12 }, paint: { 'text-color': dark ? '#d7e3ee' : '#53616b', 'text-halo-color': dark ? '#213039' : '#ffffff', 'text-halo-width': 1.6 } });
      map.addLayer({ id: 'gps-accuracy', type: 'fill', source: 'position', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#1764ed', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'gps-dot', type: 'circle', source: 'position', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': '#1764ed', 'circle-radius': 8, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
      map.on('click', 'places-dot', event => { const id = event.features?.[0]?.properties?.id; const p = data.places.find(p => p.id === id); if (p) callbacks.current.onSelect(p); });
      map.on('click', 'places-label', event => { const id = event.features?.[0]?.properties?.id; const p = data.places.find(p => p.id === id); if (p) callbacks.current.onSelect(p); });
      map.on('mouseenter', 'places-dot', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'places-dot', () => { map.getCanvas().style.cursor = ''; });
      // Focus on the developed southern campus while allowing the full boundary.
      map.fitBounds([[3.1966, 6.4599], [3.2073, 6.4702]], { padding: { top: 90, right: 70, bottom: window.innerWidth < 768 ? 260 : 70, left: window.innerWidth < 768 ? 25 : 455 }, duration: 0 });
      ready.current = true; callbacks.current.onReady?.(map);
    });
    map.on('dragstart', () => callbacks.current.onManualPan?.());
    return () => { ready.current = false; map.remove(); mapRef.current = null; };
  }, [data, dark]);
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const apply = () => { if (!map.getLayer('buildings-3d')) return; map.setLayoutProperty('buildings-3d', 'visibility', threeD ? 'visible' : 'none'); map.easeTo({ pitch: threeD ? 50 : 0, duration: 700 }); };
    if (ready.current) apply(); else map.once('load', apply);
  }, [threeD, data, dark]);
  useEffect(() => {
    const map = mapRef.current; if (!map || !selected) return;
    const marker = new maplibregl.Marker({ color: '#1764ed', scale: 0.85 }).setLngLat(selected.coordinates).addTo(map);
    map.flyTo({ center: selected.coordinates, zoom: Math.max(map.getZoom(), 17), padding: { left: window.innerWidth > 767 ? 360 : 0, bottom: window.innerWidth < 768 ? 180 : 0 }, duration: 750 });
    return () => { marker.remove(); };
  }, [selected, data, dark]);
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const apply = () => { (map.getSource('routes') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: [...routes.entries()].sort(([i], [j]) => Number(i === activeRoute) - Number(j === activeRoute)).map(([i, r]) => ({ type: 'Feature', properties: { active: i === activeRoute }, geometry: { type: 'LineString', coordinates: r.coordinates.length > 1 ? r.coordinates : [...r.coordinates, ...r.coordinates] } })) }); };
    if (ready.current) apply(); else map.once('load', apply);
  }, [routes, activeRoute, data, dark]);
  useEffect(() => {
    const map = mapRef.current; if (!map || !fix) return;
    const apply = () => {
      const ring = Array.from({ length: 49 }, (_, i) => { const angle = i / 48 * Math.PI * 2; return [fix.coordinates[0] + Math.cos(angle) * fix.accuracy / (111320 * Math.cos(fix.coordinates[1] * Math.PI / 180)), fix.coordinates[1] + Math.sin(angle) * fix.accuracy / 111320]; });
      (map.getSource('position') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: fix.coordinates } }, { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] });
      if (follow) map.easeTo({ center: fix.coordinates, zoom: 18, bearing: fix.heading !== null && (fix.speed || 0) > 0.7 ? fix.heading : map.getBearing(), duration: 750 });
    };
    if (ready.current) apply(); else map.once('load', apply);
  }, [fix, follow, data, dark]);
  return <div className="map-canvas" ref={container} aria-label="Interactive map of LASU Ojo campus" />;
}
