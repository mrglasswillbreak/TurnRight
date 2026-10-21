import { type TerraDrawMouseEvent } from 'terra-draw';
import type { MapEdit, Position } from './types';
import { distance } from './geo';
import { drawingProgress } from './drawing-state';
import {
  DEFAULT_PRECISION,
  constructPoint,
  type PrecisionSettings,
} from './editor-precision';
import type { EditorMap } from './editor-map-controller';
import type { SnapKind, Constraint } from './editor-precision';
export function beginEditorMap(
  this: EditorMap,
  kind: MapEdit['kind'],
  properties: MapEdit['properties'],
  seed?: Position[],
  id: string = crypto.randomUUID(),
): void {
  if (this.kind) return;
  this.setting = true;
  this.draw.clear();
  this.selected = null;
  this.selectedParts = [];
  this.kind = kind;
  this.creationId = id;
  this.properties = properties;
  this.referenceOnlyPoints = new Set(
    (properties.drawingReferencePoints as string[] | undefined) || [],
  );
  if (properties.drawingPrecision)
    this.precision = {
      ...DEFAULT_PRECISION,
      ...(properties.drawingPrecision as PrecisionSettings),
    };
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
      const mode = this.draw.getMode() === 'polygon' ? this.polygon : this.line;
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

export function captureDraftEditorMap(this: EditorMap): void {
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
  const committed = Number(feature.properties.committedCoordinateCount);
  if (geometry.type === 'LineString')
    geometry.coordinates = geometry.coordinates.slice(
      0,
      Number.isInteger(committed) ? committed : -1,
    );
  if (geometry.type === 'Polygon')
    geometry.coordinates = [
      geometry.coordinates[0].slice(
        0,
        Number.isInteger(committed) ? committed : -2,
      ),
    ];
  this.lastDraft = {
    id: this.creationId,
    kind: this.kind,
    geometry,
    properties: {
      ...this.properties,
      drawingPrecision: this.precision,
      drawingReferencePoints: [...this.referenceOnlyPoints],
    },
  };
  this.callbacks.draft(this.lastDraft);
}

export function setPrecisionEditorMap(
  this: EditorMap,
  settings: PrecisionSettings,
): void {
  this.precision = {
    ...settings,
    tolerance: Math.max(4, Math.min(30, settings.tolerance)),
  };
  if (this.kind) this.captureDraft();
}

export function getPrecisionEditorMap(this: EditorMap): {
  enabled: boolean;
  tolerance: number;
  kinds: SnapKind[];
  constraint: Constraint;
  referenceBearing: number;
} {
  return { ...this.precision };
}

export function constructionPointsEditorMap(this: EditorMap): Position[] {
  const feature = this.draw
    .getSnapshot()
    .find((f) => f.properties.mode === this.draw.getMode());
  const committed = Number(feature?.properties.committedCoordinateCount);
  if (feature?.geometry.type === 'LineString')
    return feature.geometry.coordinates.slice(
      0,
      Number.isInteger(committed) ? committed : -1,
    ) as Position[];
  if (feature?.geometry.type === 'Polygon')
    return feature.geometry.coordinates[0].slice(
      0,
      Number.isInteger(committed) ? committed : -2,
    ) as Position[];
  return [];
}

export function appendReferenceEditorMap(
  this: EditorMap,
  points: Position[],
): void {
  if (!this.kind || !['polygon', 'linestring'].includes(this.draw.getMode()))
    throw new Error('Start a line or polygon drawing first.');
  if (points.length + this.constructionPoints().length > 2000)
    throw new Error('Use at most 2,000 vertices per construction.');
  const mode = this.draw.getMode() === 'polygon' ? this.polygon : this.line;
  // Replaying exact construction must not re-snap or constrain its vertices.
  this.setting = true;
  try {
    const existing = this.constructionPoints();
    const first = existing[0] || points[0];
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (
        i === points.length - 1 &&
        this.draw.getMode() === 'polygon' &&
        first &&
        distance(first, point) < 0.01 &&
        points.length > 2
      )
        continue;
      const last = this.constructionPoints().at(-1);
      if (last && distance(last, point) < 0.01) continue;
      this.referenceOnlyPoints.add(point.join(','));
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
      mode.onMouseMove(event);
      mode.onClick(event);
    }
  } finally {
    this.setting = false;
  }
  this.captureDraft();
}

export function addSegmentEditorMap(
  this: EditorMap,
  length: number,
  bearing: number,
): void {
  const point = this.constructionPoints().at(-1);
  if (!point) throw new Error('Place the first point on the map.');
  this.appendReference([constructPoint(point, length, bearing)]);
}

export function rectangleEditorMap(
  this: EditorMap,
  width: number,
  depth: number,
  bearing: number,
): void {
  const points = this.constructionPoints();
  if (this.draw.getMode() !== 'polygon' || points.length !== 1)
    throw new Error('Start a polygon and place exactly one corner first.');
  const a = points[0],
    b = constructPoint(a, width, bearing),
    d = constructPoint(a, depth, bearing + 90);
  const c = constructPoint(b, depth, bearing + 90);
  this.appendReference([b, c, d]);
}

export function finishEditorMap(this: EditorMap): void {
  this.captureDraft();
  if (!drawingProgress(this.lastDraft).canFinish) {
    this.callbacks.hint(drawingProgress(this.lastDraft).message);
    return;
  }
  const event = { key: 'Enter', heldKeys: [], preventDefault: () => {} };
  if (this.draw.getMode() === 'polygon') this.polygon.onKeyUp(event);
  else if (this.kind) this.line.onKeyUp(event);
}

export function cancelEditorMap(this: EditorMap): void {
  this.lastDraft = null;
  clearTimeout(this.draftTimer);
  this.select(null);
  this.callbacks.draft(null);
}
