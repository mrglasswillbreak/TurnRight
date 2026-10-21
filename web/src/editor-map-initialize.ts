import {
  TerraDraw,
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
  TerraDrawRenderMode,
  type TerraDrawMouseEvent,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { Map as MapInstance } from 'maplibre-gl';
import type { CampusData, MapEdit, Position } from './types';
import { snapTarget } from './editor-features';
import { distance } from './geo';
import { replaceWindow } from './geometry-window';
import { constrainPoint } from './editor-precision';
import { type Callbacks, collection } from './editor-map-contract';
import type { EditorMap } from './editor-map-controller';
export function initializeEditorMap(
  this: EditorMap,
  map: MapInstance,
  data: CampusData,
  _callbacks: Callbacks,
): void {
  this.source = data;
  const snapping = {
    toCustom: (event: TerraDrawMouseEvent) => {
      if (this.setting || event.heldKeys.includes('Alt')) {
        this.showTarget(undefined);
        return undefined;
      }
      const original: Position = [event.lng, event.lat];
      const point = constrainPoint(
        original,
        this.constructionPoints(),
        this.precision,
      );
      const route =
        this.kind === 'path' || this.kind === 'entrance'
          ? this.snap(point)
          : undefined;
      const reference = this.references.snap(
        point,
        (p) => this.map.project(p),
        this.precision,
        this.selected?.id,
        this.map.getZoom(),
      );
      let target = route || reference;
      if (
        target &&
        this.precision.constraint !== 'free' &&
        distance(
          target.coordinates,
          constrainPoint(
            target.coordinates,
            this.constructionPoints(),
            this.precision,
          ),
        ) > 0.02
      )
        target = undefined;
      if (target === reference && reference)
        this.referenceOnlyPoints.add(reference.coordinates.join(','));
      else if (target)
        this.referenceOnlyPoints.delete(target.coordinates.join(','));
      this.showTarget(target);
      return (
        target?.coordinates ||
        (this.precision.constraint !== 'free' ? point : undefined)
      );
    },
  };
  this.line = new TerraDrawLineStringMode({
    snapping,
    pointerDistance: 8,
    showCoordinatePoints: true,
    keyEvents: { finish: 'Enter', cancel: null },
  });
  this.polygon = new TerraDrawPolygonMode({
    snapping,
    pointerDistance: 8,
    keyEvents: { finish: 'Enter', cancel: null },
  });
  const flags = {
    feature: {
      draggable: true,
      coordinates: { draggable: true, midpoints: true, deletable: true },
    },
  };
  this.draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map, coordinatePrecision: 18 }),
    idStrategy: {
      getId: () => crypto.randomUUID(),
      isValidId: (id) => typeof id === 'string',
    },
    modes: [
      new TerraDrawPointMode(),
      this.line,
      this.polygon,
      new TerraDrawSelectMode({
        flags: { point: flags, linestring: flags, polygon: flags },
        pointerDistance: 8,
      }),
      new TerraDrawRenderMode({
        modeName: 'render',
        styles: {
          polygonFillOpacity: 0,
          polygonOutlineColor: '#1764ed',
          polygonOutlineWidth: 2,
        },
      }),
    ],
  });
  for (const id of [
    'editor-drafts',
    'editor-entrances',
    'editor-network',
    'editor-target',
    'editor-review',
    'editor-path-hits',
    'editor-multi-selection',
  ])
    map.addSource(id, { type: 'geojson', data: collection() });
  map.addLayer({
    id: 'editor-multi-selection-fill',
    source: 'editor-multi-selection',
    type: 'fill',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#1764ed', 'fill-opacity': 0.15 },
  });
  map.addLayer({
    id: 'editor-multi-selection-line',
    source: 'editor-multi-selection',
    type: 'line',
    filter: ['!=', ['geometry-type'], 'Point'],
    paint: { 'line-color': '#1764ed', 'line-width': 3 },
  });
  map.addLayer({
    id: 'editor-multi-selection-point',
    source: 'editor-multi-selection',
    type: 'circle',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-color': '#1764ed',
      'circle-radius': 9,
      'circle-opacity': 0.5,
    },
  });
  map.addLayer({
    id: 'editor-path-hits',
    type: 'line',
    source: 'editor-path-hits',
    paint: {
      'line-width': 14,
      'line-opacity': 0.001,
      'line-color': '#1764ed',
    },
  });
  map.addLayer({
    id: 'editor-network',
    type: 'line',
    source: 'editor-network',
    layout: { visibility: 'none' },
    paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-opacity': 0.5 },
  });
  map.addLayer({
    id: 'editor-draft-fill',
    type: 'fill',
    source: 'editor-drafts',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.16 },
  });
  map.addLayer({
    id: 'editor-draft-line',
    type: 'line',
    source: 'editor-drafts',
    filter: ['!=', ['geometry-type'], 'Point'],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 3,
      'line-dasharray': [3, 1],
    },
  });
  map.addLayer({
    id: 'editor-draft-point',
    type: 'circle',
    source: 'editor-drafts',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': 7,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: 'editor-entrances',
    type: 'circle',
    source: 'editor-entrances',
    paint: {
      'circle-color': ['case', ['get', 'connected'], '#13946b', '#e09228'],
      'circle-radius': 7,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: 'editor-entrance-label',
    type: 'symbol',
    source: 'editor-entrances',
    minzoom: 17,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Semibold'],
      'text-size': 11,
      'text-offset': [0, 1.4],
    },
    paint: {
      'text-color': '#175647',
      'text-halo-color': '#ffffff',
      'text-halo-width': 2,
    },
  });
  map.addLayer({
    id: 'editor-target',
    type: 'circle',
    source: 'editor-target',
    paint: {
      'circle-color': '#ffffff',
      'circle-radius': 9,
      'circle-stroke-color': '#1764ed',
      'circle-stroke-width': 3,
    },
  });
  map.addLayer({
    id: 'editor-review',
    type: 'line',
    source: 'editor-review',
    filter: ['!=', ['geometry-type'], 'Point'],
    paint: { 'line-color': ['get', 'color'], 'line-width': 5 },
  });
  map.addLayer({
    id: 'editor-review-points',
    type: 'circle',
    source: 'editor-review',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-color': ['get', 'color'], 'circle-radius': 10 },
  });
  this.draw.start();
  this.draw.setMode('select');
  this.draw.on('finish', (id, context) => {
    if (this.setting || this.compare) return;
    const feature = this.draw.getSnapshotFeature(id);
    if (!feature) return;
    if (context.action !== 'draw') {
      if (
        this.selected &&
        this.window &&
        (feature.geometry.type === 'LineString' || this.window.points)
      ) {
        this.callbacks.geometry(
          replaceWindow(
            this.selected.geometry,
            this.window,
            this.window.points
              ? this.windowPoints()
              : (feature.geometry as GeoJSON.LineString).coordinates,
          ),
        );
      } else if (this.selected)
        this.callbacks.geometry(this.partGeometry() || feature.geometry);
      return;
    }
    if (!this.kind) return;
    clearTimeout(this.draftTimer);
    const edit: MapEdit = {
      id: this.creationId,
      kind: this.kind,
      geometry: structuredClone(feature.geometry),
      properties: { ...this.properties },
    };
    delete edit.properties.drawingPrecision;
    delete edit.properties.drawingReferencePoints;
    if (edit.kind === 'entrance' && edit.geometry.type === 'Point') {
      const point = edit.geometry.coordinates as Position;
      const snap = snapTarget(
        this.source,
        point,
        (p) => this.map.project(p),
        undefined,
        String(edit.properties.buildingId || '') || undefined,
      );
      if (snap) edit.geometry.coordinates = snap.coordinates;
    }
    if (edit.kind === 'path' && edit.geometry.type === 'LineString') {
      edit.properties.vertexIds = edit.geometry.coordinates.map(
        () => `${edit.id}:vertex:${crypto.randomUUID()}`,
      );
      edit.properties.connections = edit.geometry.coordinates.flatMap(
        (p, i) => {
          const snap = snapTarget(this.source, p as Position, (p) =>
            this.map.project(p),
          );
          return !this.referenceOnlyPoints.has(p.join(',')) &&
            snap?.target &&
            distance(p as Position, snap.coordinates) < 0.15
            ? [
                {
                  vertexId: edit.properties.vertexIds![i],
                  target: snap.target,
                },
              ]
            : [];
        },
      );
    }
    // Terra finishes a point during the pointer gesture. Keep drawing active
    // through its trailing map click so it cannot select the building beneath
    // the new entrance before that entrance's layer has rendered.
    clearTimeout(this.finishTimer);
    this.finishTimer = setTimeout(() => {
      if (
        this.disposed ||
        this.creationId !== edit.id ||
        this.kind !== edit.kind
      )
        return;
      this.kind = null;
      this.callbacks.draft(null);
      this.callbacks.create(edit);
      if (!edit.properties.temporaryGeometry) this.select(edit);
    }, 0);
  });
  this.draw.on('change', (_ids, type) => {
    if (this.setting || this.compare) return;
    if (!this.kind) {
      if (type === 'delete' && this.window && this.selected) {
        const remaining = this.draw.getSnapshotFeature(
          `${this.selected.id}:window`,
        );
        if (remaining?.geometry.type === 'LineString' || this.window.points)
          this.callbacks.geometry(
            replaceWindow(
              this.selected.geometry,
              this.window,
              this.window.points
                ? this.windowPoints()
                : (remaining!.geometry as GeoJSON.LineString).coordinates,
            ),
          );
        return;
      }
      if (type === 'delete' && this.selectedParts.length) {
        const geometry = this.partGeometry();
        if (
          geometry &&
          'coordinates' in geometry &&
          geometry.coordinates.length
        )
          this.callbacks.geometry(geometry);
        else {
          this.selected = null;
          this.selectedParts = [];
          this.callbacks.remove();
        }
        return;
      }
      if (
        type === 'delete' &&
        this.selected &&
        !this.draw.hasFeature(this.selected.id)
      ) {
        this.selected = null;
        this.callbacks.remove();
      }
      return;
    }
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => this.captureDraft(), 120);
  });
  map.on('mousemove', this.mousemove);
  map.on('click', this.click);
  map.on('dblclick', this.doubleclick);
}
