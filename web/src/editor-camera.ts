import type { Geometry } from 'geojson';
import type { Map as MapInstance, PaddingOptions } from 'maplibre-gl';
import type { Position } from './types';
import { projectSegment } from './geo';

export function selectionBounds(
  geometry: Geometry,
): [Position, Position] | null {
  const points: Position[] = [];
  const collect = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      if (Number.isFinite(value[0]) && Number.isFinite(value[1]))
        points.push([value[0], value[1]]);
    } else value.forEach(collect);
  };
  const visit = (item: Geometry) => {
    if (item.type === 'GeometryCollection') item.geometries.forEach(visit);
    else collect(item.coordinates);
  };
  visit(geometry);
  if (!points.length) return null;
  return points.reduce<[Position, Position]>(
    ([min, max], point) => [
      [Math.min(min[0], point[0]), Math.min(min[1], point[1])],
      [Math.max(max[0], point[0]), Math.max(max[1], point[1])],
    ],
    [[...points[0]], [...points[0]]],
  );
}

// Measure after the inspector renders so the selection stays in the exposed map.
export function selectionPadding(
  container: HTMLElement,
): Required<PaddingOptions> {
  const map = container.getBoundingClientRect();
  const workspace = container.closest('.editor-map-workspace');
  const rect = (selector: string) => {
    const box = workspace?.querySelector(selector)?.getBoundingClientRect();
    return box && box.width && box.height ? box : undefined;
  };
  const tools = rect('.editor-tools');
  const explorer = rect('.editor-explorer');
  const inspector = rect('.editor-inspector');
  const controls = rect('.editor-view-controls');
  const mobile = window.matchMedia('(max-width: 767px)').matches;
  const padding = {
    top: controls ? controls.bottom - map.top + 20 : 40,
    bottom: mobile && inspector ? map.bottom - inspector.top + 24 : 90,
    left: Math.max(
      24,
      (tools?.right ?? map.left) - map.left + 16,
      !mobile && explorer ? explorer.right - map.left + 20 : 0,
    ),
    right: !mobile && inspector ? map.right - inspector.left + 24 : 24,
  };
  // Very small viewports must still leave a usable camera rectangle.
  for (const [start, end, size] of [
    ['left', 'right', map.width],
    ['top', 'bottom', map.height],
  ] as const) {
    const scale = Math.min(
      1,
      Math.max(0, size - 120) / (padding[start] + padding[end]),
    );
    padding[start] *= scale;
    padding[end] *= scale;
  }
  return padding;
}

export function focusEditorSelection(
  map: MapInstance,
  geometry: Geometry,
  anchor?: Position,
) {
  const bounds = selectionBounds(geometry);
  if (!bounds) return;
  const padding = selectionPadding(map.getContainer());
  const camera = map.cameraForBounds(bounds, {
    padding,
    maxZoom: geometry.type === 'Point' ? 19 : 20,
    bearing: map.getBearing(),
  });
  if (!camera) return;
  let center: Position = [
    (bounds[0][0] + bounds[1][0]) / 2,
    (bounds[0][1] + bounds[1][1]) / 2,
  ];
  let zoom = camera.zoom ?? map.getZoom();
  const mobilePath =
    window.matchMedia('(max-width: 767px)').matches &&
    (geometry.type === 'LineString' || geometry.type === 'MultiLineString');
  // A long path should not pull a phone out of the area being inspected.
  // Keep the tapped stretch (or the stretch nearest the current view) in sight.
  if (mobilePath && zoom < map.getZoom() - 0.75) {
    zoom = map.getZoom() - 0.75;
    const reference: Position = anchor ?? [
      map.getCenter().lng,
      map.getCenter().lat,
    ];
    const lines =
      geometry.type === 'LineString'
        ? [geometry.coordinates]
        : geometry.coordinates;
    let nearest = Infinity;
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const a: Position = [line[i - 1][0], line[i - 1][1]];
        const b: Position = [line[i][0], line[i][1]];
        if (![...a, ...b].every(Number.isFinite)) continue;
        const projected = projectSegment(reference, a, b);
        if (projected.distance < nearest) {
          nearest = projected.distance;
          center = projected.point;
        }
      }
    }
  }
  // fitBounds calculates its padded center on a flat map. An explicit screen
  // offset also keeps the geometry above the phone inspector when tilted.
  map.easeTo({
    center,
    zoom,
    bearing: map.getBearing(),
    pitch: map.getPitch(),
    offset: [
      (padding.left - padding.right) / 2,
      (padding.top - padding.bottom) / 2,
    ],
    duration: 550,
  });
}

export function editorCamera(map: MapInstance) {
  return {
    center: map.getCenter(),
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
    padding: map.getPadding(),
  };
}
