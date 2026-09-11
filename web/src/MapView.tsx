import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapInstance, GeoJSONSource, StyleSpecification } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { CampusData, GpsFix, Place, Route } from "./types";
import type { FeatureCollection } from "geojson";
const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
maplibregl.setWorkerUrl(mapWorkerUrl);
const colors: Record<string, string> = {
  academic: "#6863cf",
  library: "#406fc3",
  worship: "#ad789e",
  food: "#db8741",
  services: "#337f91",
  residence: "#8896a5",
  sports: "#639466",
  gate: "#d58b4d",
  other: "#778795",
};
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
  panelBesideMap?: boolean;
  onSelect: (place: Place) => void;
  onManualPan?: () => void;
  onReady?: (map: MapInstance) => void | (() => void);
}
export function MapView({
  data,
  selected,
  routes = [],
  activeRoute = 0,
  fix,
  dark = false,
  threeD = false,
  editor = false,
  buildingOpacity = 0.92,
  follow = false,
  panelBesideMap = false,
  onSelect,
  onManualPan,
  onReady,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null),
    mapRef = useRef<MapInstance | null>(null);
  const callbacks = useRef({ onSelect, onManualPan, onReady });
  callbacks.current = { onSelect, onManualPan, onReady };
  const ready = useRef(false);
  const latestData = useRef(data);
  latestData.current = data;
  const camera = useRef({ selected, routes, activeRoute, dark });
  camera.current = { selected, routes, activeRoute, dark };
  const [mapError, setMapError] = useState("");
  const style = (theme: boolean): StyleSpecification => ({
    version: 8,
    glyphs: "/glyphs/{fontstack}/{range}.pbf",
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": theme ? "#172126" : "#edf0eb" },
      },
    ],
  });
  useEffect(() => {
    if (!container.current) return;
    const dark = camera.current.dark;
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
        pitch: 0,
      });
      setMapError("");
    } catch {
      setMapError(
        "This browser could not open the interactive map. Enable hardware acceleration or try a current browser. Place search is still available.",
      );
      return;
    }
    mapRef.current = map;
    const frame = () => {
      const mobile = innerWidth < 768,
        padding = panelBesideMap ? { top: 60, right: 40, bottom: 60, left: 40 } : {
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
            [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1]))],
            [Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))],
          ],
          { padding, maxZoom: 18, duration: 0 },
        );
      } else if (current.selected)
        map.jumpTo({ center: current.selected.coordinates, zoom: 17, padding });
      else
        map.fitBounds(
          [
            [3.1966, 6.4599],
            [3.2073, 6.4702],
          ],
          { padding, duration: 0 },
        );
    };
    const resize = () => {
      requestAnimationFrame(() => {
        if (mapRef.current !== map) return;
        map.stop();
        map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
        map.resize();
        if (ready.current && !editor) frame();
      });
    };
    window.addEventListener("resize", resize);
    map.on("error", (event) => console.error("Campus map:", event.error));
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: ["© OpenStreetMap contributors", "LASU / MangroveandpartnersLimited"],
      }),
      "bottom-right",
    );
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), "bottom-left");
    map.on("load", () => {
      map.addSource("campus", { type: "geojson", data: data.map });
      map.addSource("boundary", { type: "geojson", data: data.boundary });
      map.addSource("places", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: data.places.map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: p.coordinates },
            properties: {
              id: p.id,
              name: p.name.replace(/[^\x20-\x7E]/g, " "),
              category: p.category,
              color: colors[p.category],
            },
          })),
        },
      });
      const closedIds = new Set(
        data.closures.filter((c) => !c.reopenedAt).flatMap((c) => c.edgeIds),
      );
      const nodeCoordinates = new Map(data.graph.nodes.map((n) => [n.id, n.coordinates]));
      map.addSource("closures", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: data.graph.edges
            .filter((e) => closedIds.has(e.id) || e.geometryBlocked)
            .map((e) => ({
              type: "Feature",
              properties: { conflict: !!e.geometryBlocked && !closedIds.has(e.id) },
              geometry: {
                type: "LineString",
                coordinates: [nodeCoordinates.get(e.from)!, nodeCoordinates.get(e.to)!],
              },
            })),
        },
      });
      map.addSource("routes", { type: "geojson", data: empty });
      map.addSource("position", { type: "geojson", data: empty });
      map.addLayer({
        id: "campus-fill",
        type: "fill",
        source: "boundary",
        paint: { "fill-color": dark ? "#243338" : "#f8faf5" },
      });
      map.addLayer({
        id: "land",
        type: "fill",
        source: "campus",
        filter: ["==", ["get", "kind"], "land"],
        paint: {
          "fill-color": [
            "match",
            ["get", "name"],
            ["Green Area", "Vegetation", "Forest"],
            dark ? "#263f36" : "#dbe8cf",
            ["Water Body", "Water"],
            "#bddce6",
            dark ? "#293a3a" : "#ecede1",
          ],
          "fill-opacity": 0.65,
        },
      });
      map.addLayer({
        id: "boundary-line",
        type: "line",
        source: "boundary",
        paint: {
          "line-color": "#809b78",
          "line-width": 1.5,
          "line-dasharray": [3, 4],
          "line-opacity": 0.7,
        },
      });
      map.addLayer({
        id: "roads-case",
        type: "line",
        source: "campus",
        filter: ["==", ["get", "kind"], "path"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": dark ? "#526068" : "#d6d6cf",
          "line-width": ["interpolate", ["linear"], ["zoom"], 14, 3, 18, 15],
        },
      });
      map.addLayer({
        id: "roads",
        type: "line",
        source: "campus",
        filter: ["==", ["get", "kind"], "path"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": dark ? "#77808a" : "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 14, 2, 18, 12],
        },
      });
      map.addLayer({
        id: "buildings",
        type: "fill",
        source: "campus",
        filter: ["==", ["get", "kind"], "building"],
        paint: {
          "fill-color": dark ? "#52616c" : "#dce0e3",
          "fill-outline-color": dark ? "#697985" : "#c2cbd0",
        },
      });
      map.addLayer({
        id: "buildings-3d",
        type: "fill-extrusion",
        source: "campus",
        filter: [
          "all",
          ["==", ["get", "kind"], "building"],
          [">", ["coalesce", ["get", "height"], 0], 0],
        ],
        layout: { visibility: "none" },
        paint: {
          "fill-extrusion-color": dark ? "#52616c" : "#d5dce5",
          "fill-extrusion-height": ["coalesce", ["get", "height"], 0],
          "fill-extrusion-opacity": 0.92,
        },
      });
      map.addLayer({
        id: "barriers",
        type: "line",
        source: "campus",
        filter: ["==", ["get", "kind"], "barrier"],
        paint: { "line-color": "#b7947e", "line-width": 1.5, "line-dasharray": [2, 1] },
      });
      map.addLayer({
        id: "closed-paths",
        type: "line",
        source: "closures",
        paint: {
          "line-color": ["case", ["get", "conflict"], "#c58937", "#d34b4b"],
          "line-width": 5,
          "line-dasharray": [2, 2],
        },
      });
      map.addLayer({
        id: "routes-case",
        type: "line",
        source: "routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 9 },
      });
      map.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["case", ["get", "active"], "#1764ed", "#a2b8e8"],
          "line-width": ["case", ["get", "active"], 6, 4],
        },
      });
      map.addLayer({
        id: "places-dot",
        type: "circle",
        source: "places",
        minzoom: 14.5,
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 3, 18, 5],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "places-label",
        type: "symbol",
        source: "places",
        minzoom: 14.8,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Semibold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 15, 11, 18, 13],
          "text-max-width": 11,
          "text-offset": [0, 1],
          "text-anchor": "top",
          "text-padding": 12,
        },
        paint: {
          "text-color": dark ? "#d7e3ee" : "#53616b",
          "text-halo-color": dark ? "#213039" : "#ffffff",
          "text-halo-width": 1.6,
        },
      });
      map.addLayer({
        id: "gps-accuracy",
        type: "fill",
        source: "position",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#1764ed", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "gps-dot",
        type: "circle",
        source: "position",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": "#1764ed",
          "circle-radius": 8,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 3,
        },
      });
      map.on("click", "places-dot", (event) => {
        const id = event.features?.[0]?.properties?.id;
        const p = latestData.current.places.find((p) => p.id === id);
        if (p) callbacks.current.onSelect(p);
      });
      map.on("click", "places-label", (event) => {
        const id = event.features?.[0]?.properties?.id;
        const p = latestData.current.places.find((p) => p.id === id);
        if (p) callbacks.current.onSelect(p);
      });
      map.on("mouseenter", "places-dot", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "places-dot", () => {
        map.getCanvas().style.cursor = "";
      });
      frame();
      ready.current = true;
      disposeExtension = callbacks.current.onReady?.(map);
    });
    map.on("dragstart", () => callbacks.current.onManualPan?.());
    return () => {
      window.removeEventListener("resize", resize);
      ready.current = false;
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
      const paint: [string, Parameters<MapInstance["setPaintProperty"]>[1], Parameters<MapInstance["setPaintProperty"]>[2]][] = [
        ["background", "background-color", dark ? "#172126" : "#edf0eb"],
        ["campus-fill", "fill-color", dark ? "#243338" : "#f8faf5"],
        ["land", "fill-color", ["match", ["get", "name"],
          ["Green Area", "Vegetation", "Forest"], dark ? "#263f36" : "#dbe8cf",
          ["Water Body", "Water"], "#bddce6", dark ? "#293a3a" : "#ecede1"]],
        ["roads-case", "line-color", dark ? "#526068" : "#d6d6cf"],
        ["roads", "line-color", dark ? "#77808a" : "#ffffff"],
        ["buildings", "fill-color", dark ? "#52616c" : "#dce0e3"],
        ["buildings", "fill-outline-color", dark ? "#697985" : "#c2cbd0"],
        ["buildings-3d", "fill-extrusion-color", dark ? "#52616c" : "#d5dce5"],
        ["places-label", "text-color", dark ? "#d7e3ee" : "#53616b"],
        ["places-label", "text-halo-color", dark ? "#213039" : "#ffffff"],
      ];
      for (const [layer, property, value] of paint)
        if (map.getLayer(layer)) map.setPaintProperty(layer, property, value);
    };
    if (ready.current) apply();
    else map.once("load", apply);
    return () => { map.off("load", apply); };
  }, [dark, panelBesideMap, editor]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer("buildings-3d")) return;
      map.setLayoutProperty("buildings-3d", "visibility", threeD ? "visible" : "none");
      map.easeTo({ pitch: threeD ? 50 : 0, duration: 700 });
    };
    if (ready.current) apply();
    else map.once("load", apply);
    return () => { map.off("load", apply); };
  }, [threeD, panelBesideMap, editor]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer("buildings-3d")) return;
      map.setFilter("buildings-3d", editor ? ["==", ["get", "kind"], "building"] : ["all", ["==", ["get", "kind"], "building"], [">", ["coalesce", ["get", "height"], 0], 0]]);
      map.setPaintProperty("buildings-3d", "fill-extrusion-height", editor ? ["case", [">", ["coalesce", ["get", "height"], 0], 0], ["get", "height"], 6] : ["coalesce", ["get", "height"], 0]);
      map.setPaintProperty("buildings-3d", "fill-extrusion-opacity", buildingOpacity);
      map.setPaintProperty("buildings-3d", "fill-extrusion-color", editor ? ["case", [">", ["coalesce", ["get", "height"], 0], 0], dark ? "#71889a" : "#b5c7d8", dark ? "#47555b" : "#d6ded8"] : dark ? "#52616c" : "#d5dce5");
    };
    if (ready.current) apply(); else map.once("load", apply);
    return () => { map.off("load", apply); };
  }, [editor, buildingOpacity, dark]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      (map.getSource("campus") as GeoJSONSource)?.setData(data.map);
      (map.getSource("boundary") as GeoJSONSource)?.setData(data.boundary);
      (map.getSource("places") as GeoJSONSource)?.setData({ type: "FeatureCollection", features: data.places.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: p.coordinates }, properties: { id: p.id, name: p.name.replace(/[^\x20-\x7E]/g, " "), category: p.category, color: colors[p.category] } })) });
      const closed = new Set(data.closures.filter((c) => !c.reopenedAt).flatMap((c) => c.edgeIds));
      const nodes = new Map(data.graph.nodes.map((n) => [n.id, n.coordinates]));
      (map.getSource("closures") as GeoJSONSource)?.setData({ type: "FeatureCollection", features: data.graph.edges.filter((e) => (closed.has(e.id) || e.geometryBlocked) && nodes.has(e.from) && nodes.has(e.to)).map((e) => ({ type: "Feature", properties: { conflict: !!e.geometryBlocked && !closed.has(e.id) }, geometry: { type: "LineString", coordinates: [nodes.get(e.from)!, nodes.get(e.to)!] } })) });
    };
    if (ready.current) apply(); else map.once("load", apply);
    return () => { map.off("load", apply); };
  }, [data]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    const marker = new maplibregl.Marker({ color: "#1764ed", scale: 0.85 })
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
  }, [selected, data, panelBesideMap]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      (map.getSource("routes") as GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features: [...routes.entries()]
          .sort(([i], [j]) => Number(i === activeRoute) - Number(j === activeRoute))
          .map(([i, r]) => ({
            type: "Feature",
            properties: { active: i === activeRoute },
            geometry: {
              type: "LineString",
              coordinates:
                r.coordinates.length > 1 ? r.coordinates : [...r.coordinates, ...r.coordinates],
            },
          })),
      });
    };
    if (ready.current) apply();
    else map.once("load", apply);
  }, [routes, activeRoute, data, panelBesideMap]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fix) return;
    const apply = () => {
      const ring = Array.from({ length: 49 }, (_, i) => {
        const angle = (i / 48) * Math.PI * 2;
        return [
          fix.coordinates[0] +
            (Math.cos(angle) * fix.accuracy) /
              (111320 * Math.cos((fix.coordinates[1] * Math.PI) / 180)),
          fix.coordinates[1] + (Math.sin(angle) * fix.accuracy) / 111320,
        ];
      });
      (map.getSource("position") as GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: fix.coordinates },
          },
          { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } },
        ],
      });
      if (follow)
        map.easeTo({
          center: fix.coordinates,
          zoom: 18,
          bearing: fix.heading !== null && (fix.speed || 0) > 0.7 ? fix.heading : map.getBearing(),
          duration: 750,
        });
    };
    if (ready.current) apply();
    else map.once("load", apply);
  }, [fix, follow, data, panelBesideMap]);
  return (
    <>
      <div className="map-canvas" ref={container} aria-label="Interactive map of LASU Ojo campus" />
      {mapError && (
        <div className="map-error" role="alert">
          {mapError}
        </div>
      )}
    </>
  );
}
