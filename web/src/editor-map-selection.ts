import { type GeoJSONStoreFeatures } from 'terra-draw';
import type { GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection, Geometry, Position } from 'geojson';
import type { MapEdit } from './types';
import { vertexCount, geometryWindow } from './geometry-window';
import { modeFor } from './editor-map-contract';
import type { EditorMap } from './editor-map-controller';
export function setSourceEditorMap(
  this: EditorMap,
  id: string,
  data: FeatureCollection,
): void {
  const signature = JSON.stringify(data);
  if (this.previousSources.get(id) === signature) return;
  this.previousSources.set(id, signature);
  (this.map.getSource(id) as GeoJSONSource)?.setData(data);
}

export function selectEditorMap(
  this: EditorMap,
  edit: MapEdit | null,
  outline = this.outline,
): void {
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

export function partGeometryEditorMap(this: EditorMap): Geometry | undefined {
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

export function selectWindowEditorMap(
  this: EditorMap,
  part: number,
  ring: number,
  start: number,
): void {
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
  if (!this.compare && result[1]?.valid) this.draw.selectFeature(handles[0].id);
  this.setting = false;
  this.callbacks.hint(
    `Editing vertices ${this.window.start + 1}–${this.window.start + this.window.length} of part ${part + 1}${this.window.closed ? ', ' + (ring ? 'hole ' + ring : 'exterior') : ''}. Other vertices and holes are preserved.`,
  );
}

export function windowPointsEditorMap(this: EditorMap): Position[] {
  return this.selectedParts.flatMap((id) => {
    const g = this.draw.getSnapshotFeature(id)?.geometry;
    return g?.type === 'Point' ? [g.coordinates] : [];
  });
}
