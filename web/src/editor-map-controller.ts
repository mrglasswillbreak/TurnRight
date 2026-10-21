import {
  TerraDraw,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
} from 'terra-draw';
import type { Map as MapInstance } from 'maplibre-gl';
import type { FeatureCollection, Feature } from 'geojson';
import type { CampusData, MapEdit, Position } from './types';
import type { UnfinishedDrawing } from './editor-workspace';
import { type SnapTarget } from './editor-features';
import type { LayerViewState } from './campus-layer-types';
import { geometryWindow } from './geometry-window';
import {
  DEFAULT_PRECISION,
  ReferenceSnapIndex,
  type PrecisionSettings,
} from './editor-precision';
import { type Interaction, type Callbacks } from './editor-map-contract';
import { initializeEditorMap } from './editor-map-initialize';
import {
  snapEditorMap,
  mousemoveEditorMap,
  showTargetEditorMap,
  clickEditorMap,
  doubleclickEditorMap,
  pickEditorMap,
  targetsEditorMap,
} from './editor-map-interactions';
import {
  setSourceEditorMap,
  selectEditorMap,
  partGeometryEditorMap,
  selectWindowEditorMap,
  windowPointsEditorMap,
} from './editor-map-selection';
import {
  beginEditorMap,
  captureDraftEditorMap,
  setPrecisionEditorMap,
  getPrecisionEditorMap,
  constructionPointsEditorMap,
  appendReferenceEditorMap,
  addSegmentEditorMap,
  rectangleEditorMap,
  finishEditorMap,
  cancelEditorMap,
} from './editor-map-drawing';
import {
  updateEditorMap,
  reviewEditorMap,
  disposeEditorMap,
} from './editor-map-render';
/** Internal implementation. The public module exposes only the supported controller API. */
export class EditorMap {
  draw!: TerraDraw;
  line!: TerraDrawLineStringMode;
  polygon!: TerraDrawPolygonMode;
  selected: MapEdit | null = null;
  selectedParts: string[] = [];
  kind: MapEdit['kind'] | null = null;
  properties: MapEdit['properties'] = {};
  creationId = '';
  setting = false;
  compare = false;
  outline = true;
  interaction: Interaction = 'select';
  draftTimer!: ReturnType<typeof setTimeout> | undefined;
  finishTimer!: ReturnType<typeof setTimeout> | undefined;
  source!: CampusData;
  layerView: LayerViewState = {};
  window: ReturnType<typeof geometryWindow> | null = null;
  hint = '';
  precision: PrecisionSettings = { ...DEFAULT_PRECISION };
  references = new ReferenceSnapIndex([]);
  referenceRevision = '';
  referenceMap!: CampusData['map'] | undefined;
  referenceOnlyPoints = new Set<string>();
  disposed = false;
  previousSources = new Map<string, string>();
  lastDraft: UnfinishedDrawing | null = null;
  constructor(
    readonly map: MapInstance,
    data: CampusData,
    public callbacks: Callbacks,
  ) {
    initializeEditorMap.call(this, map, data, callbacks);
  }
  snap(point: Position): ReturnType<typeof snapEditorMap> {
    return snapEditorMap.call(this, point);
  }
  mousemove = mousemoveEditorMap.bind(this);
  showTarget(
    target: SnapTarget | undefined,
  ): ReturnType<typeof showTargetEditorMap> {
    return showTargetEditorMap.call(this, target);
  }
  click = clickEditorMap.bind(this);
  doubleclick = doubleclickEditorMap.bind(this);
  setSource(
    id: string,
    data: FeatureCollection,
  ): ReturnType<typeof setSourceEditorMap> {
    return setSourceEditorMap.call(this, id, data);
  }
  select(
    edit: MapEdit | null,
    outline = this.outline,
  ): ReturnType<typeof selectEditorMap> {
    return selectEditorMap.call(this, edit, outline);
  }
  partGeometry(): ReturnType<typeof partGeometryEditorMap> {
    return partGeometryEditorMap.call(this);
  }
  selectWindow(
    part: number,
    ring: number,
    start: number,
  ): ReturnType<typeof selectWindowEditorMap> {
    return selectWindowEditorMap.call(this, part, ring, start);
  }
  windowPoints(): ReturnType<typeof windowPointsEditorMap> {
    return windowPointsEditorMap.call(this);
  }
  begin(
    kind: MapEdit['kind'],
    properties: MapEdit['properties'],
    seed?: Position[],
    id: string = crypto.randomUUID(),
  ): ReturnType<typeof beginEditorMap> {
    return beginEditorMap.call(this, kind, properties, seed, id);
  }
  captureDraft(): ReturnType<typeof captureDraftEditorMap> {
    return captureDraftEditorMap.call(this);
  }
  setPrecision(
    settings: PrecisionSettings,
  ): ReturnType<typeof setPrecisionEditorMap> {
    return setPrecisionEditorMap.call(this, settings);
  }
  getPrecision(): ReturnType<typeof getPrecisionEditorMap> {
    return getPrecisionEditorMap.call(this);
  }
  constructionPoints(): ReturnType<typeof constructionPointsEditorMap> {
    return constructionPointsEditorMap.call(this);
  }
  appendReference(
    points: Position[],
  ): ReturnType<typeof appendReferenceEditorMap> {
    return appendReferenceEditorMap.call(this, points);
  }
  addSegment(
    length: number,
    bearing: number,
  ): ReturnType<typeof addSegmentEditorMap> {
    return addSegmentEditorMap.call(this, length, bearing);
  }
  rectangle(
    width: number,
    depth: number,
    bearing: number,
  ): ReturnType<typeof rectangleEditorMap> {
    return rectangleEditorMap.call(this, width, depth, bearing);
  }
  finish(): ReturnType<typeof finishEditorMap> {
    return finishEditorMap.call(this);
  }
  cancel(): ReturnType<typeof cancelEditorMap> {
    return cancelEditorMap.call(this);
  }
  pick(interaction: Interaction): ReturnType<typeof pickEditorMap> {
    return pickEditorMap.call(this, interaction);
  }
  targets(show: boolean): ReturnType<typeof targetsEditorMap> {
    return targetsEditorMap.call(this, show);
  }
  update(
    data: CampusData,
    edits: MapEdit[],
    base: CampusData,
    invalid: Set<string>,
    compare: boolean,
    layerView: LayerViewState = {},
  ): ReturnType<typeof updateEditorMap> {
    return updateEditorMap.call(
      this,
      data,
      edits,
      base,
      invalid,
      compare,
      layerView,
    );
  }
  review(features: Feature[]): ReturnType<typeof reviewEditorMap> {
    return reviewEditorMap.call(this, features);
  }
  dispose(): ReturnType<typeof disposeEditorMap> {
    return disposeEditorMap.call(this);
  }
}
