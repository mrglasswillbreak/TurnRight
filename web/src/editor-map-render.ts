import type { Feature } from 'geojson';
import type { CampusData, MapEdit } from './types';
import { visualEdges } from './map-display';
import {
  campusLayers,
  layerFeatures,
  layerMembership,
  layerKey,
  editableLayer,
  layerPresentation,
} from './campus-layers';
import type { LayerViewState } from './campus-layer-types';
import { ReferenceSnapIndex } from './editor-precision';
import { collection } from './editor-map-contract';
import type { EditorMap } from './editor-map-controller';
export function updateEditorMap(
  this: EditorMap,
  data: CampusData,
  edits: MapEdit[],
  base: CampusData,
  invalid: Set<string>,
  compare: boolean,
  layerView: LayerViewState = {},
): void {
  this.source = data;
  this.layerView = layerView;
  const presentation = layerPresentation(data, true, layerView);
  const referenceRevision = JSON.stringify([
    data.layers,
    layerView.hidden,
    layerView.isolated,
  ]);
  if (
    this.referenceMap !== data.map ||
    this.referenceRevision !== referenceRevision
  ) {
    this.references = new ReferenceSnapIndex(presentation.map.features);
    this.referenceMap = data.map;
    this.referenceRevision = referenceRevision;
  }
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

export function reviewEditorMap(this: EditorMap, features: Feature[]): void {
  this.setSource('editor-review', collection(features));
}

export function disposeEditorMap(this: EditorMap): void {
  this.disposed = true;
  clearTimeout(this.finishTimer);
  clearTimeout(this.draftTimer);
  this.map.off('mousemove', this.mousemove);
  this.map.off('click', this.click);
  this.map.off('dblclick', this.doubleclick);
  this.draw.stop();
}
