import {
  TerraDraw,
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
  TerraDrawRenderMode,
  type GeoJSONStoreFeatures,
  type TerraDrawMouseEvent,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type {
  Map as MapInstance,
  GeoJSONSource,
  MapMouseEvent,
} from 'maplibre-gl';
import type { FeatureCollection, Geometry, Feature } from 'geojson';
import type { CampusData, MapEdit, Position } from './types';
import type { UnfinishedDrawing } from './editor-workspace';
import { snapTarget, type SnapTarget } from './editor-features';
import { distance } from './geo';
import { drawingProgress } from './drawing-state';
import { visualEdges } from './map-display';
import { hasModelSelection } from './model-selection';
import {
  campusLayers,
  layerFeatures,
  layerMembership,
  layerKey,
  editableLayer,
  layerPresentation,
} from './campus-layers';
import type { LayerViewState } from './campus-layer-types';
import { vertexCount, geometryWindow, replaceWindow } from './geometry-window';

type Interaction =
  | 'select'
  | 'start'
  | 'end'
  | 'join'
  | 'entrance-link'
  | 'block';
interface Callbacks {
  choose?: (
    features: { kind: MapEdit['kind']; id: string }[],
    anchor: Position,
  ) => void;
  select: (kind: MapEdit['kind'], id: string, anchor?: Position) => void;
  create: (edit: MapEdit) => void;
  geometry: (geometry: Geometry) => void;
  remove: () => void;
  draft: (drawing: UnfinishedDrawing | null) => void;
  connect: (target: SnapTarget, interaction: Interaction) => void;
  hint: (message: string) => void;
}
const collection = (features: Feature[] = []): FeatureCollection => ({
  type: 'FeatureCollection',
  features,
});
const modeFor = (g: Geometry) =>
  g.type === 'Point'
    ? 'point'
    : g.type === 'Polygon'
      ? 'polygon'
      : 'linestring';

export class EditorMap {
  readonly draw: TerraDraw;
  private line: TerraDrawLineStringMode;
  private polygon: TerraDrawPolygonMode;
  private selected: MapEdit | null = null;
  private selectedParts: string[] = [];
  private kind: MapEdit['kind'] | null = null;
  private properties: MapEdit['properties'] = {};
  private creationId = '';
  private setting = false;
  private compare = false;
  private outline = true;
  private interaction: Interaction = 'select';
  private draftTimer: ReturnType<typeof setTimeout> | undefined;
  private finishTimer: ReturnType<typeof setTimeout> | undefined;
  private source: CampusData;
  private layerView: LayerViewState = {};
  private window: ReturnType<typeof geometryWindow> | null = null;
  private hint = '';
  private disposed = false;
  private previousSources = new Map<string, string>();
  private lastDraft: UnfinishedDrawing | null = null;
  constructor(
    readonly map: MapInstance,
    data: CampusData,
    private callbacks: Callbacks,
  ) {
    this.source = data;
    const snapping = {
      toCustom: (event: TerraDrawMouseEvent) => {
        if (event.heldKeys.includes('Alt')) return undefined;
        const target = this.snap([event.lng, event.lat]);
        this.showTarget(target);
        return target?.coordinates;
      },
    };
    this.line = new TerraDrawLineStringMode({
      snapping,
      pointerDistance: 8,
      showCoordinatePoints: true,
      keyEvents: { finish: 'Enter', cancel: null },
    });
    this.polygon = new TerraDrawPolygonMode({
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
            return snap?.target &&
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
  private snap(point: Position) {
    const building =
      this.kind === 'entrance'
        ? String(this.properties.buildingId || '')
        : undefined;
    return snapTarget(
      this.source,
      point,
      (p) => this.map.project(p),
      this.kind
        ? undefined
        : this.selected?.kind === 'path'
          ? this.selected.id
          : undefined,
      building || undefined,
    );
  }
  private mousemove = (event: MapMouseEvent) => {
    if (this.compare || (!this.kind && this.interaction === 'select')) return;
    const target = this.snap([event.lngLat.lng, event.lngLat.lat]);
    this.showTarget(target);
  };
  private showTarget(target: SnapTarget | undefined) {
    this.setSource(
      'editor-target',
      collection(
        target
          ? [
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Point', coordinates: target.coordinates },
              },
            ]
          : [],
      ),
    );
    const hint = target?.label || '';
    if (hint !== this.hint) {
      this.hint = hint;
      this.callbacks.hint(hint);
    }
  }
  private click = (event: MapMouseEvent) => {
    const gisLayers = this.map
      .getStyle()
      .layers.filter(
        (l) =>
          l.id.startsWith('workspace-dataset-') ||
          l.id.startsWith('workspace-gis-page'),
      )
      .map((l) => l.id);
    if (
      gisLayers.length &&
      this.map.queryRenderedFeatures(event.point, { layers: gisLayers }).length
    )
      return;
    if (this.compare || this.kind || hasModelSelection(event.originalEvent))
      return;
    if (this.interaction !== 'select') {
      const target = this.snap([event.lngLat.lng, event.lngLat.lat]);
      if (target) this.callbacks.connect(target, this.interaction);
      else
        this.callbacks.hint(
          'Zoom in and click a highlighted path or junction.',
        );
      return;
    }
    const layers = [
      'editor-entrances',
      'editor-draft-point',
      'editor-draft-line',
      'places-dot',
      'places-label-selected',
      'places-label',
      'places-label-detail',
      'editor-draft-fill',
      'buildings-3d',
      'buildings',
      'roads',
      'editor-path-hits',
      'overlay-points',
      'overlay-lines',
      'overlay-fill',
      'land',
      ...this.map
        .getStyle()
        .layers.filter((l) => l.id.startsWith('overlay-'))
        .map((l) => l.id),
    ];
    const features = this.map.queryRenderedFeatures(event.point, {
      layers: layers.filter((id) => this.map.getLayer(id)),
    });
    const candidates: { kind: MapEdit['kind']; id: string }[] = [];
    const definitions = campusLayers(this.source).items,
      membership = layerMembership(this.source, definitions);
    const shown = layerPresentation(this.source, true, this.layerView);
    const hidden = new Set(
      layerFeatures(shown)
        .filter((f) => f.properties.visible === false)
        .map((f) => f.key),
    );
    for (const layer of layers)
      for (const f of features.filter((f) => f.layer.id === layer)) {
        if (!f?.properties?.id) continue;
        const kind =
          layer === 'land'
            ? 'land'
            : layer.startsWith('overlay-')
              ? 'overlay'
              : layer.startsWith('editor-draft')
                ? f.properties.kind
                : layer === 'editor-entrances'
                  ? 'entrance'
                  : layer.startsWith('places')
                    ? 'place'
                    : layer === 'roads' || layer === 'editor-path-hits'
                      ? 'path'
                      : 'building';
        const id = String(f.properties.id),
          key = layerKey(kind, id),
          definition = definitions.find((l) => l.id === membership.get(key));
        if (
          hidden.has(key) ||
          (definition && !editableLayer(definition, definitions)) ||
          candidates.some((c) => c.id === id && c.kind === kind)
        )
          continue;
        candidates.push({ kind, id });
      }
    candidates.sort(
      (a, b) =>
        Number(
          membership.get(layerKey(b.kind, b.id)) === this.layerView.active,
        ) -
        Number(
          membership.get(layerKey(a.kind, a.id)) === this.layerView.active,
        ),
    );
    const anchor: Position = [event.lngLat.lng, event.lngLat.lat];
    if (candidates.length > 1 && this.callbacks.choose)
      this.callbacks.choose(candidates, anchor);
    else if (candidates[0])
      this.callbacks.select(candidates[0].kind, candidates[0].id, anchor);
  };
  private doubleclick = (event: MapMouseEvent) => {
    if (this.kind) {
      event.preventDefault();
      this.finish();
    }
  };
  private setSource(id: string, data: FeatureCollection) {
    const signature = JSON.stringify(data);
    if (this.previousSources.get(id) === signature) return;
    this.previousSources.set(id, signature);
    (this.map.getSource(id) as GeoJSONSource)?.setData(data);
  }
  select(edit: MapEdit | null, outline = this.outline) {
    const previousWindow = this.selected?.id === edit?.id ? this.window : null;
    this.outline = outline;
    this.setting = true;
    this.kind = null;
    this.selected = edit;
    this.interaction = 'select';
    this.draw.clear();
    this.selectedParts = [];
    this.window = null;
    if (
      edit &&
      !edit.deleted &&
      ['land', 'overlay'].includes(edit.kind) &&
      vertexCount(edit.geometry) > 2000 &&
      [
        'Polygon',
        'MultiPolygon',
        'LineString',
        'MultiLineString',
        'MultiPoint',
      ].includes(edit.geometry.type)
    ) {
      this.setting = false;
      this.selectWindow(
        previousWindow?.part || 0,
        previousWindow?.ring || 0,
        previousWindow?.start || 0,
      );
      return;
    }
    if (edit && !edit.deleted) {
      const geometries =
        edit.geometry.type === 'MultiPolygon'
          ? edit.geometry.coordinates.map((coordinates) => ({
              type: 'Polygon' as const,
              coordinates,
            }))
          : edit.geometry.type === 'MultiLineString'
            ? edit.geometry.coordinates.map((coordinates) => ({
                type: 'LineString' as const,
                coordinates,
              }))
            : edit.geometry.type === 'MultiPoint'
              ? edit.geometry.coordinates.map((coordinates) => ({
                  type: 'Point' as const,
                  coordinates,
                }))
              : [edit.geometry];
      if (edit.geometry.type.startsWith('Multi'))
        this.selectedParts = geometries.map(
          (_, index) => `${edit.id}:part:${index}`,
        );
      const result = this.draw.addFeatures(
        geometries.map(
          (geometry, index) =>
            ({
              type: 'Feature',
              id: this.selectedParts[index] || edit.id,
              geometry,
              properties: {
                mode:
                  edit.kind === 'building' && !this.outline
                    ? 'render'
                    : modeFor(geometry),
              },
            }) as GeoJSONStoreFeatures,
        ),
      );
      this.draw.setMode(
        this.compare || (edit?.kind === 'building' && !this.outline)
          ? 'render'
          : 'select',
      );
      if (
        !this.compare &&
        (edit.kind !== 'building' || this.outline) &&
        result[0]?.valid
      )
        this.draw.selectFeature(this.selectedParts[0] || edit.id);
    } else
      this.draw.setMode(
        this.compare || (edit?.kind === 'building' && !this.outline)
          ? 'render'
          : 'select',
      );
    this.setting = false;
    this.targets(false);
  }
  private partGeometry(): Geometry | undefined {
    if (!this.selectedParts.length) return;
    const parts = this.selectedParts
      .map((id) => this.draw.getSnapshotFeature(id)?.geometry)
      .filter((g) => !!g);
    if (this.selected?.geometry.type === 'MultiLineString')
      return {
        type: 'MultiLineString',
        coordinates: parts
          .filter((g) => g.type === 'LineString')
          .map((g) => g.coordinates),
      };
    if (this.selected?.geometry.type === 'MultiPoint')
      return {
        type: 'MultiPoint',
        coordinates: parts
          .filter((g) => g.type === 'Point')
          .map((g) => g.coordinates),
      };
    const polygons = this.selectedParts
      .map((id) => this.draw.getSnapshotFeature(id)?.geometry)
      .filter((g) => g?.type === 'Polygon');
    return {
      type: 'MultiPolygon',
      coordinates: polygons.map((g) => g.coordinates),
    };
  }
  selectWindow(part: number, ring: number, start: number) {
    if (!this.selected || !['land', 'overlay'].includes(this.selected.kind))
      return;
    this.setting = true;
    this.draw.clear();
    this.selectedParts = [];
    this.window = geometryWindow(this.selected.geometry, part, ring, start);
    const handles = this.window.points
      ? this.window.geometry.coordinates.map((coordinates, i) => ({
          type: 'Feature' as const,
          id: `${this.selected!.id}:window:${i}`,
          geometry: { type: 'Point' as const, coordinates },
          properties: { mode: 'point' },
        }))
      : [
          {
            type: 'Feature' as const,
            id: `${this.selected.id}:window`,
            geometry: this.window.geometry,
            properties: { mode: 'linestring' },
          },
        ];
    if (this.window.points) this.selectedParts = handles.map((f) => f.id);
    const result = this.draw.addFeatures([
      {
        type: 'Feature',
        id: `${this.selected.id}:outline`,
        geometry: structuredClone(this.selected.geometry),
        properties: { mode: 'render' },
      } as GeoJSONStoreFeatures,
      ...handles,
    ]);
    this.draw.setMode(this.compare ? 'render' : 'select');
    if (!this.compare && result[1]?.valid)
      this.draw.selectFeature(handles[0].id);
    this.setting = false;
    this.callbacks.hint(
      `Editing vertices ${this.window.start + 1}–${this.window.start + this.window.length} of part ${part + 1}${this.window.closed ? ', ' + (ring ? 'hole ' + ring : 'exterior') : ''}. Other vertices and holes are preserved.`,
    );
  }
  private windowPoints() {
    return this.selectedParts.flatMap((id) => {
      const g = this.draw.getSnapshotFeature(id)?.geometry;
      return g?.type === 'Point' ? [g.coordinates] : [];
    });
  }
  begin(
    kind: MapEdit['kind'],
    properties: MapEdit['properties'],
    seed?: Position[],
    id: string = crypto.randomUUID(),
  ) {
    if (this.kind) return;
    this.setting = true;
    this.draw.clear();
    this.selected = null;
    this.selectedParts = [];
    this.kind = kind;
    this.creationId = id;
    this.properties = properties;
    this.interaction = 'select';
    this.draw.setMode(
      kind === 'path' ||
        kind === 'barrier' ||
        properties.drawingGeometry === 'LineString'
        ? 'linestring'
        : kind === 'building' ||
            kind === 'land' ||
            properties.drawingGeometry === 'Polygon'
          ? 'polygon'
          : 'point',
    );
    // Terra's mode interface is also used to seed/recover an unfinished drawing.
    if (seed)
      for (const point of seed) {
        const p = this.map.project(point);
        const event: TerraDrawMouseEvent = {
          lng: point[0],
          lat: point[1],
          containerX: p.x,
          containerY: p.y,
          button: 'left',
          heldKeys: [],
          isContextMenu: false,
        };
        const mode =
          this.draw.getMode() === 'polygon' ? this.polygon : this.line;
        mode.onMouseMove(event);
        mode.onClick(event);
      }
    this.setting = false;
    this.targets(kind === 'path');
    this.lastDraft = {
      id,
      kind,
      properties,
      geometry:
        this.draw.getMode() === 'polygon'
          ? { type: 'Polygon', coordinates: [[]] }
          : this.draw.getMode() === 'linestring'
            ? { type: 'LineString', coordinates: [] }
            : { type: 'Point', coordinates: [] },
    };
    this.callbacks.draft(this.lastDraft);
    this.captureDraft();
  }
  private captureDraft() {
    if (!this.kind) return;
    const feature = this.draw
      .getSnapshot()
      .find(
        (f) =>
          f.properties.mode === this.draw.getMode() &&
          ['LineString', 'Polygon'].includes(f.geometry.type),
      );
    if (!feature) return;
    const geometry = structuredClone(feature.geometry);
    if (geometry.type === 'LineString')
      geometry.coordinates = geometry.coordinates.slice(0, -1);
    if (geometry.type === 'Polygon')
      geometry.coordinates = [geometry.coordinates[0].slice(0, -2)];
    this.lastDraft = {
      id: this.creationId,
      kind: this.kind,
      geometry,
      properties: this.properties,
    };
    this.callbacks.draft(this.lastDraft);
  }
  finish() {
    this.captureDraft();
    if (!drawingProgress(this.lastDraft).canFinish) {
      this.callbacks.hint(drawingProgress(this.lastDraft).message);
      return;
    }
    const event = { key: 'Enter', heldKeys: [], preventDefault: () => {} };
    if (this.draw.getMode() === 'polygon') this.polygon.onKeyUp(event);
    else if (this.kind) this.line.onKeyUp(event);
  }
  cancel() {
    this.lastDraft = null;
    clearTimeout(this.draftTimer);
    this.select(null);
    this.callbacks.draft(null);
  }
  pick(interaction: Interaction) {
    this.interaction = interaction;
    this.draw.setMode(interaction === 'select' ? 'select' : 'render');
    this.targets(interaction !== 'select');
  }
  private targets(show: boolean) {
    this.map.setLayoutProperty(
      'editor-network',
      'visibility',
      show ? 'visible' : 'none',
    );
    this.setSource('editor-target', collection());
  }
  update(
    data: CampusData,
    edits: MapEdit[],
    base: CampusData,
    invalid: Set<string>,
    compare: boolean,
    layerView: LayerViewState = {},
  ) {
    this.source = data;
    this.layerView = layerView;
    const presentation = layerPresentation(data, true, layerView);
    const definitions = campusLayers(data).items,
      membership = layerMembership(data, definitions);
    const hidden = new Set([
      ...presentation.map.features
        .filter((f) => f.properties?.visible === false)
        .map((f) =>
          layerKey(String(f.properties?.kind), String(f.properties?.id)),
        ),
      ...presentation.places
        .filter(
          (p) => (p as unknown as Record<string, unknown>).visible === false,
        )
        .map((p) => layerKey('place', p.id)),
      ...(presentation.entrances || [])
        .filter(
          (p) => (p as unknown as Record<string, unknown>).visible === false,
        )
        .map((p) => layerKey('entrance', p.id)),
    ]);
    const allowed = (kind: string, id: string) => {
      const l = definitions.find(
        (l) => l.id === membership.get(layerKey(kind, id)),
      );
      return (
        !hidden.has(layerKey(kind, id)) && (!l || editableLayer(l, definitions))
      );
    };
    if (this.selected && !allowed(this.selected.kind, this.selected.id))
      this.select(null);
    const selectedKeys = new Set(layerView.selected || []);
    this.setSource(
      'editor-multi-selection',
      collection(
        compare
          ? []
          : layerFeatures(presentation)
              .filter((f) => selectedKeys.has(f.key) && allowed(f.kind, f.id))
              .map((f) => ({
                type: 'Feature',
                properties: f.properties,
                geometry: f.geometry,
              })),
      ),
    );
    this.setSource(
      'editor-path-hits',
      collection(
        compare
          ? []
          : presentation.map.features.filter(
              (f) =>
                f.properties?.kind === 'path' &&
                f.properties.visible !== false &&
                allowed('path', String(f.properties.id)),
            ),
      ),
    );
    if (compare !== this.compare) {
      this.compare = compare;
      this.draw.setMode(
        compare
          ? 'render'
          : this.kind
            ? this.kind === 'building'
              ? 'polygon'
              : this.kind === 'path' || this.kind === 'barrier'
                ? 'linestring'
                : 'point'
            : this.selected?.kind === 'building' && !this.outline
              ? 'render'
              : 'select',
      );
    }
    const nodes = new Map(data.graph.nodes.map((n) => [n.id, n.coordinates]));
    this.setSource(
      'editor-network',
      collection(
        visualEdges(data.graph.edges)
          .filter((e) => nodes.has(e.from) && nodes.has(e.to))
          .map((e) => ({
            type: 'Feature',
            properties: { id: e.id },
            geometry: {
              type: 'LineString',
              coordinates: [nodes.get(e.from)!, nodes.get(e.to)!],
            },
          })),
      ),
    );
    this.setSource(
      'editor-entrances',
      collection(
        compare
          ? []
          : (data.entrances || [])
              .filter((e) => allowed('entrance', e.id))
              .map((e) => ({
                type: 'Feature',
                properties: {
                  id: e.id,
                  name: e.name,
                  connected: !!e.graphNode,
                },
                geometry: { type: 'Point', coordinates: e.coordinates },
              })),
      ),
    );
    this.setSource(
      'editor-drafts',
      collection(
        compare
          ? []
          : edits
              .filter(
                (e) =>
                  e.kind !== 'layer' &&
                  allowed(e.kind, e.id) &&
                  !(e.deleted && e.properties.revertToSource),
              )
              .map((e) => ({
                type: 'Feature',
                properties: {
                  id: e.id,
                  kind: e.kind,
                  color: e.deleted
                    ? '#d55454'
                    : invalid.has(e.id)
                      ? '#d99124'
                      : base.map.features.some(
                            (f) => f.properties?.id === e.id,
                          ) || base.places.some((p) => p.id === e.id)
                        ? '#8b5cc7'
                        : '#13946b',
                },
                geometry: e.geometry,
              })),
      ),
    );
  }
  review(features: Feature[]) {
    this.setSource('editor-review', collection(features));
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.finishTimer);
    clearTimeout(this.draftTimer);
    this.map.off('mousemove', this.mousemove);
    this.map.off('click', this.click);
    this.map.off('dblclick', this.doubleclick);
    this.draw.stop();
  }
}
