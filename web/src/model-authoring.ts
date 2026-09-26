import type { Feature } from 'geojson';
import type { MapEdit } from './types.js';
import type {
  BuildingVisual,
  FacadeDescription,
  FacadeElement,
  ModelAuthoring,
} from './visual-types.js';
import { facadeWalls, facadeErrors } from './building-facades.js';
import {
  buildingTopology,
  polygonsOf,
  resolveBuildingVisual,
  standardRoofSupported,
  styleFor,
} from './building-surfaces.js';

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
export function wallLength(
  coordinates: number[][],
  latitude = (coordinates[0][1] + coordinates[1][1]) / 2,
) {
  const k = (Math.PI / 180) * 6371008.8;
  return Math.hypot(
    (coordinates[1][0] - coordinates[0][0]) *
      k *
      Math.cos((latitude * Math.PI) / 180),
    (coordinates[1][1] - coordinates[0][1]) * k,
  );
}
export function wallMetrics(
  feature: Feature,
  wallId: string,
  catalogue?: BuildingVisual,
) {
  const topology = buildingTopology(feature),
    polygons = polygonsOf(feature.geometry),
    walls = facadeWalls(feature);
  const wall = walls.find((w) => w.wallId === wallId);
  if (!wall) throw new Error('Select an existing wall.');
  const points = polygons.flat(2),
    latitude = points.reduce((s, p) => s + p[1], 0) / points.length;
  const index = topology.parts.findIndex((p) => p.id === wall.partId),
    polygon = polygons[index];
  const visual = resolveBuildingVisual(feature, catalogue),
    appearance = feature.properties?.appearance || {};
  const surfaceVisual = {
    ...visual,
    partDefaults:
      visual.partDefaults ||
      Object.fromEntries(
        topology.parts.map((p, i) => [
          p.id,
          visual.partHeights?.[i]?.kind === 'illustrative'
            ? { wallColour: '#d4d5c3', roofColour: '#a6b19f', windows: false }
            : {},
        ]),
      ),
  };
  const partStyle = styleFor(appearance, surfaceVisual, wall.partId),
    style = styleFor(appearance, surfaceVisual, wall.partId, wallId);
  const override = appearance.parts?.[wall.partId],
    part = visual.partHeights?.[index];
  const height =
    override?.heightMode === 'floors'
      ? Number(override.floors) * 3
      : override?.heightMode === 'unknown'
        ? 6
        : (override?.height ?? part?.height ?? visual.height);
  const custom = appearance.roofs?.[wall.partId];
  const width = Math.min(
    ...polygon[0]
      .slice(0, -1)
      .map((p, i) => wallLength([p, polygon[0][i + 1]], latitude)),
  );
  const pitched =
    !custom && partStyle.roofForm !== 'flat' && standardRoofSupported(polygon);
  const rise = pitched
    ? partStyle.roofPitch === undefined
      ? Math.min(height * 0.18, 1.8)
      : (width / 2) * Math.tan((partStyle.roofPitch * Math.PI) / 180)
    : 0;
  const eaves = custom ? custom.eaves : height - rise;
  const floors =
    override?.floors ||
    part?.floors ||
    visual.floors ||
    Math.max(1, Math.round(height / 3));
  const ringIndex = topology.parts[index].rings.findIndex((ring) =>
    ring.wallIds.includes(wallId),
  );
  const ring = polygon[ringIndex];
  const signedArea = ring.slice(0, -1).reduce((sum, a, i) => {
    const b = ring[i + 1];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  // Front elevation runs left-to-right as seen from outside, including courtyards.
  const reverse = signedArea > 0 !== (ringIndex === 0);
  const [a, b] = wall.coordinates;
  const angle =
    ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360;
  return {
    ...wall,
    reverse,
    length: wallLength(wall.coordinates, latitude),
    height,
    eaves,
    floors,
    style,
    direction: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][
      Math.round(angle / 45) % 8
    ],
  };
}
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
export function elementBounds(e: FacadeElement, length: number) {
  const half = ((e.count - 1) * e.spacing * length) / 2;
  return {
    left: e.x * length - half - e.width / 2,
    right: e.x * length + half + e.width / 2,
    bottom: e.bottom,
    top: e.bottom + e.height,
  };
}
export function placementErrors(
  elements: FacadeElement[],
  length: number,
  eaves: number,
  checkRecordLimit = true,
) {
  const errors: { id: string; message: string }[] = [];
  if (checkRecordLimit && elements.length > 100)
    errors.push({
      id: '',
      message: 'At most 100 detail records are supported per wall.',
    });
  for (const e of elements) {
    const b = elementBounds(e, length);
    if (
      ![e.x, e.bottom, e.width, e.height, e.depth, e.count, e.spacing].every(
        Number.isFinite,
      ) ||
      e.width <= 0 ||
      e.height <= 0 ||
      e.depth < 0 ||
      e.depth > 10 ||
      !Number.isInteger(e.count) ||
      e.count < 1 ||
      e.count > 40 ||
      e.spacing < 0 ||
      e.spacing > 1 ||
      b.left < -0.03 ||
      b.right > length + 0.03 ||
      b.bottom < 0 ||
      b.top > eaves + (e.kind === 'parapet' ? 3 : 0.03)
    )
      errors.push({
        id: e.id,
        message: `${e.kind}: review position, size and repetitions against this wall.`,
      });
  }
  return errors;
}
export function moveElements(
  elements: FacadeElement[],
  ids: string[],
  dx: number,
  dy: number,
  length: number,
) {
  return elements.map((e) =>
    ids.includes(e.id)
      ? { ...e, x: e.x + dx / length, bottom: metres(e.bottom + dy) }
      : e,
  );
}
export function copyElements(
  elements: FacadeElement[],
  fromLength: number,
  toLength: number,
  dx = 0,
  dy = 0,
) {
  return elements.map((e) => ({
    ...e,
    id: crypto.randomUUID(),
    x: (e.x * fromLength + dx) / toLength,
    bottom: metres(e.bottom + dy),
    spacing: (e.spacing * fromLength) / toLength,
  }));
}
export function layoutElements(
  elements: FacadeElement[],
  ids: string[],
  length: number,
  action:
    | 'left'
    | 'right'
    | 'centre'
    | 'bottom'
    | 'top'
    | 'distribute'
    | 'mirror',
) {
  const selected = elements.filter((e) => ids.includes(e.id));
  if (selected.length < 2 && action !== 'mirror') return elements;
  const bounds = selected.map((e) => elementBounds(e, length));
  const left = Math.min(...bounds.map((b) => b.left)),
    right = Math.max(...bounds.map((b) => b.right)),
    bottom = Math.min(...bounds.map((b) => b.bottom)),
    top = Math.max(...bounds.map((b) => b.top));
  const ordered = [...selected].sort((a, b) => a.x - b.x),
    widths = ordered.map((e) => {
      const b = elementBounds(e, length);
      return b.right - b.left;
    });
  const gap =
    ordered.length > 1
      ? (right - left - widths.reduce((s, n) => s + n, 0)) /
        (ordered.length - 1)
      : 0;
  let cursor = left;
  const positions = new Map(
    ordered.map((e, i) => {
      const x = cursor + widths[i] / 2;
      cursor += widths[i] + gap;
      return [e.id, x];
    }),
  );
  return elements.map((e) => {
    if (!ids.includes(e.id)) return e;
    const b = elementBounds(e, length),
      width = b.right - b.left;
    return {
      ...e,
      x:
        action === 'left'
          ? (left + width / 2) / length
          : action === 'right'
            ? (right - width / 2) / length
            : action === 'centre'
              ? (left + right) / 2 / length
              : action === 'mirror'
                ? (left + right - e.x * length) / length
                : action === 'distribute'
                  ? positions.get(e.id)! / length
                  : e.x,
      bottom:
        action === 'bottom'
          ? bottom
          : action === 'top'
            ? top - e.height
            : e.bottom,
    };
  });
}
export function patternElements(
  seed: FacadeElement[],
  rows: number,
  columns: number,
  stepX: number,
  stepY: number,
  length: number,
) {
  if (
    ![rows, columns].every((n) => Number.isInteger(n) && n > 0 && n <= 40) ||
    seed.length * rows * columns > 100 ||
    ![stepX, stepY].every((n) => Number.isFinite(n) && n >= 0)
  )
    throw new Error(
      'Pattern needs positive counts (up to 40) and at most 100 detail records.',
    );
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: columns }, (_, c) =>
      copyElements(seed, length, length, c * stepX, r * stepY),
    ),
  ).flat(2);
}
export function detachInstance(
  elements: FacadeElement[],
  id: string,
  instance: number,
) {
  const source = elements.find((e) => e.id === id);
  if (
    !source ||
    !Number.isInteger(instance) ||
    instance < 0 ||
    instance >= source.count
  )
    throw new Error('Select an existing repeated instance.');
  const detached = {
    ...source,
    id: crypto.randomUUID(),
    x: source.x + (instance - (source.count - 1) / 2) * source.spacing,
    count: 1,
    spacing: 0,
  };
  const pieces: FacadeElement[] = [detached];
  if (instance)
    pieces.push({
      ...source,
      count: instance,
      x: source.x - ((source.count - instance) * source.spacing) / 2,
    });
  if (instance < source.count - 1)
    pieces.push({
      ...source,
      id: instance ? crypto.randomUUID() : source.id,
      count: source.count - instance - 1,
      x: source.x + ((instance + 1) * source.spacing) / 2,
    });
  const next = elements.flatMap((e) => (e.id === id ? pieces : [e]));
  if (next.length > 100)
    throw new Error('Detaching would exceed 100 detail records.');
  return { elements: next, detachedId: detached.id };
}
export function patternSlots(p: ModelAuthoring['patterns'][number]) {
  return (
    p.slots ||
    p.members.map(
      (_, i) =>
        `${Math.floor(i / (p.columns * p.seed.length))}:${Math.floor(i / p.seed.length) % p.columns}:${i % p.seed.length}`,
    )
  );
}
export function regeneratePattern(
  p: ModelAuthoring['patterns'][number],
  length: number,
) {
  const values = patternElements(
    p.seed,
    p.rows,
    p.columns,
    p.stepX,
    p.stepY,
    length,
  );
  const slots = values.map(
    (_, i) =>
      `${Math.floor(i / (p.columns * p.seed.length))}:${Math.floor(i / p.seed.length) % p.columns}:${i % p.seed.length}`,
  );
  const excluded = new Set(p.excluded || []);
  return {
    elements: values.filter((_, i) => !excluded.has(slots[i])),
    slots: slots.filter((s) => !excluded.has(s)),
  };
}
/** Keep the seed and all linked instances in sync; detached slots never regenerate. */
export function reconcilePatternEdit(
  authoring: ModelAuthoring,
  wallId: string,
  before: FacadeElement[],
  after: FacadeElement[],
) {
  let elements = after;
  const keys = [
    'x',
    'bottom',
    'width',
    'height',
    'depth',
    'count',
    'spacing',
  ] as const;
  const patterns = authoring.patterns.map((p) => {
    if (p.wallId !== wallId) return p;
    const slots = patternSlots(p),
      excluded = new Set(p.excluded || []);
    const seed = structuredClone(p.seed);
    p.members.forEach((id, i) => {
      if (!after.some((e) => e.id === id)) excluded.add(slots[i]);
    });
    for (let index = 0; index < seed.length; index++) {
      const members = p.members.filter(
        (_, i) => Number(slots[i].split(':')[2]) === index,
      );
      const changes = members.flatMap((id) => {
        const a = before.find((e) => e.id === id),
          b = after.find((e) => e.id === id);
        return a && b && JSON.stringify(a) !== JSON.stringify(b)
          ? [{ a, b }]
          : [];
      });
      if (!changes.length) continue;
      const first = changes[0];
      const delta = Object.fromEntries(
        keys.map((k) => [k, first.b[k] - first.a[k]]),
      ) as Record<(typeof keys)[number], number>;
      if (
        changes.some(
          ({ a, b }) =>
            keys.some((k) => Math.abs(b[k] - a[k] - delta[k]) > 1e-7) ||
            b.colour !== first.b.colour ||
            b.kind !== first.b.kind,
        )
      )
        throw new Error(
          'This would distort a linked pattern. Move the pattern together or detach the affected details first.',
        );
      for (const k of keys) seed[index][k] += delta[k];
      seed[index].colour = first.b.colour;
      seed[index].kind = first.b.kind;
      seed[index].flat = first.b.flat;
      elements = elements.map((e) => {
        if (!members.includes(e.id) || changes.some((c) => c.b.id === e.id))
          return e;
        const next = {
          ...e,
          colour: first.b.colour,
          kind: first.b.kind,
          flat: first.b.flat,
        };
        for (const k of keys) next[k] += delta[k];
        return next;
      });
    }
    const keep = p.members
      .map((id, i) => ({ id, slot: slots[i] }))
      .filter((v) => elements.some((e) => e.id === v.id));
    return {
      ...p,
      seed,
      members: keep.map((v) => v.id),
      slots: keep.map((v) => v.slot),
      excluded: [...excluded],
    };
  });
  return { elements, authoring: { ...authoring, patterns } };
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
