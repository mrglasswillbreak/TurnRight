import type { Feature } from 'geojson';
import type { MapEdit } from './types.js';
import type {
  BuildingVisual,
  FacadeDescription,
  FacadeElement,
  ModelAuthoring,
} from './visual-types.js';
import { facadeErrors } from './building-facades.js';
import { wallMetrics } from './model-wall-metrics.js';
export const modelFeature = (edit: MapEdit): Feature => ({
  type: 'Feature',
  geometry: edit.geometry,
  properties: { ...edit.properties, id: edit.id, kind: edit.kind },
});

export const emptyAuthoring = (): ModelAuthoring => ({
  version: 1,
  names: {},
  groups: [],
  patterns: [],
  presets: [],
});

export const metres = (n: number) => Math.round(n * 10000) / 10000;

export function generatedElements(
  m: ReturnType<typeof wallMetrics>,
): FacadeElement[] {
  if (!m.style.windows) return [];
  const result: FacadeElement[] = [],
    bays = Math.max(1, Math.floor(m.length / (m.style.windowSpacing || 4)));
  const add = (value: Omit<FacadeElement, 'id'>) =>
    result.push({ ...value, id: `${m.wallId}:generated:${result.length}` });
  for (let floor = 0; floor < m.floors; floor++) {
    const low = ((floor + 0.3) * m.eaves) / m.floors,
      high = Math.min(
        m.eaves,
        low + ((m.style.windowHeightRatio ?? 0.48) * m.eaves) / m.floors,
      );
    add({
      kind: 'window',
      x: 0.5,
      bottom: low,
      width: Math.min(
        m.style.windowWidthRatio === undefined ? 2.1 : m.length / bays,
        (m.length / bays) * (m.style.windowWidthRatio ?? 0.6),
      ),
      height: high - low,
      depth: m.style.windowFrameDepth ?? 0,
      count: bays,
      spacing: 1 / bays,
      colour: m.style.windowColour!,
      flat: !m.style.windowFrameDepth,
    });
    if (floor > 0)
      add({
        kind: 'trim',
        x: 0.5,
        bottom: (floor * m.eaves) / m.floors,
        width: m.length,
        height: 0.11,
        depth: 0,
        count: 1,
        spacing: 0,
        colour: m.style.trimColour!,
        flat: true,
      });
  }
  add({
    kind: 'trim',
    x: 0.5,
    bottom: m.eaves - 0.16,
    width: m.length,
    height: 0.16,
    depth: 0,
    count: 1,
    spacing: 0,
    colour: m.style.trimColour!,
    flat: true,
  });
  if (result.length > 100 || result.some((e) => e.count > 40))
    throw new Error(
      'Generated layout exceeds editable limits (100 records, 40 repetitions). Review the spacing or floor count first.',
    );
  return result;
}

export function editableFacade(
  feature: Feature,
  wallId: string,
  visual?: BuildingVisual,
): FacadeDescription {
  const existing = feature.properties?.appearance?.facades?.[wallId];
  if (existing) return structuredClone(existing);
  const m = wallMetrics(feature, wallId, visual);
  return {
    wallId,
    partId: m.partId,
    wallCoordinates: m.coordinates,
    photoIds: [],
    notes: 'Illustrative layout; dimensions are estimates.',
    confidence: 'inferred',
    elements: generatedElements(m),
  };
}

export function authoringErrors(value: unknown): string[] {
  if (value === undefined) return [];
  const a = value as ModelAuthoring;
  if (
    !a ||
    a.version !== 1 ||
    !a.names ||
    typeof a.names !== 'object' ||
    Array.isArray(a.names) ||
    Object.keys(a.names).length > 2000 ||
    Object.values(a.names).some(
      (n) => typeof n !== 'string' || n.length > 120,
    ) ||
    ![a.groups, a.patterns, a.presets].every(
      (v) => Array.isArray(v) && v.length <= 100,
    ) ||
    JSON.stringify(a).length > 200000
  )
    return ['Unsupported or oversized private model authoring data.'];
  for (const item of [...a.groups, ...a.patterns, ...a.presets])
    if (
      !item ||
      typeof item.id !== 'string' ||
      item.id.length > 240 ||
      typeof item.name !== 'string' ||
      item.name.length > 120
    )
      return ['Model items need bounded identities and names.'];
  for (const item of [...a.groups, ...a.patterns])
    if (
      typeof item.wallId !== 'string' ||
      !Array.isArray(item.members) ||
      item.members.length > 100 ||
      item.members.some((id) => typeof id !== 'string' || id.length > 240)
    )
      return ['Invalid model group membership.'];
  for (const p of a.presets)
    if (
      !Number.isFinite(p.wallLength) ||
      p.wallLength <= 0 ||
      !Array.isArray(p.elements) ||
      p.elements.length > 100
    )
      return ['Invalid model preset.'];
  for (const p of a.patterns)
    if (
      (p.slots !== undefined &&
        (!Array.isArray(p.slots) ||
          p.slots.length !== p.members.length ||
          p.slots.some(
            (s) =>
              typeof s !== 'string' || !/^\d{1,2}:\d{1,2}:\d{1,2}$/.test(s),
          ))) ||
      (p.excluded !== undefined &&
        (!Array.isArray(p.excluded) ||
          p.excluded.length > 100 ||
          p.excluded.some(
            (s) =>
              typeof s !== 'string' || !/^\d{1,2}:\d{1,2}:\d{1,2}$/.test(s),
          ))) ||
      !Array.isArray(p.seed) ||
      p.seed.length > 100 ||
      ![p.rows, p.columns].every(
        (n) => Number.isInteger(n) && n > 0 && n <= 40,
      ) ||
      ![p.stepX, p.stepY].every((n) => Number.isFinite(n) && n >= 0)
    )
      return ['Invalid model pattern.'];
  const identities = [...a.groups, ...a.patterns, ...a.presets].map(
    (i) => i.id,
  );
  if (new Set(identities).size !== identities.length)
    return ['Private model item identities must be unique.'];
  for (const elements of [
    ...a.presets.map((p) => p.elements),
    ...a.patterns.map((p) => p.seed),
  ]) {
    const errors = facadeErrors({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: {
        appearance: {
          facades: {
            preset: {
              wallId: 'preset',
              partId: 'preset',
              wallCoordinates: [],
              photoIds: [],
              confidence: 'inferred',
              notes: 'Private design preset',
              elements,
            },
          },
        },
      },
    });
    if (errors.length)
      return [
        'Private model presets and patterns must contain valid detail records.',
      ];
  }
  return [];
}
export { wallLength, wallMetrics } from './model-wall-metrics.js';
export {
  elementBounds,
  placementErrors,
  moveElements,
  copyElements,
  layoutElements,
} from './model-element-layout.js';
export {
  patternElements,
  detachInstance,
  patternSlots,
  regeneratePattern,
  reconcilePatternEdit,
} from './model-pattern-authoring.js';
