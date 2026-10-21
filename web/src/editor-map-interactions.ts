import type { MapMouseEvent } from 'maplibre-gl';
import type { MapEdit, Position } from './types';
import { snapTarget, type SnapTarget } from './editor-features';
import { hasModelSelection } from './model-selection';
import {
  campusLayers,
  layerFeatures,
  layerMembership,
  layerKey,
  editableLayer,
  layerPresentation,
} from './campus-layers';
import { type Interaction, collection } from './editor-map-contract';
import type { EditorMap } from './editor-map-controller';
export function snapEditorMap(
  this: EditorMap,
  point: Position,
): SnapTarget | undefined {
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

export function mousemoveEditorMap(
  this: EditorMap,
  event: MapMouseEvent,
): void {
  if (this.compare || (!this.kind && this.interaction === 'select')) return;
  if (this.kind && this.draw.getMode() !== 'point') return;
  const target = this.snap([event.lngLat.lng, event.lngLat.lat]);
  this.showTarget(target);
}

export function showTargetEditorMap(
  this: EditorMap,
  target: SnapTarget | undefined,
): void {
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

export function clickEditorMap(this: EditorMap, event: MapMouseEvent): void {
  if (this.compare || this.kind || hasModelSelection(event.originalEvent))
    return;
  if (this.interaction !== 'select') {
    const target = this.snap([event.lngLat.lng, event.lngLat.lat]);
    if (target) this.callbacks.connect(target, this.interaction);
    else
      this.callbacks.hint('Zoom in and click a highlighted path or junction.');
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
      Number(membership.get(layerKey(b.kind, b.id)) === this.layerView.active) -
      Number(membership.get(layerKey(a.kind, a.id)) === this.layerView.active),
  );
  const anchor: Position = [event.lngLat.lng, event.lngLat.lat];
  if (candidates.length > 1 && this.callbacks.choose)
    this.callbacks.choose(candidates, anchor);
  else if (candidates[0])
    this.callbacks.select(candidates[0].kind, candidates[0].id, anchor);
}

export function doubleclickEditorMap(
  this: EditorMap,
  event: MapMouseEvent,
): void {
  if (this.kind) {
    event.preventDefault();
    this.finish();
  }
}

export function pickEditorMap(this: EditorMap, interaction: Interaction): void {
  this.interaction = interaction;
  this.draw.setMode(interaction === 'select' ? 'select' : 'render');
  this.targets(interaction !== 'select');
}

export function targetsEditorMap(this: EditorMap, show: boolean): void {
  this.map.setLayoutProperty(
    'editor-network',
    'visibility',
    show ? 'visible' : 'none',
  );
  this.setSource('editor-target', collection());
}
