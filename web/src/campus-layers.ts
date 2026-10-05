import type { Feature } from 'geojson';
import type { CampusData, MapEdit } from './types.js';
import type {
  CampusLayer,
  CampusLayers,
  LayerBand,
  LayerRole,
  LayerStyle,
  LayerViewState,
} from './campus-layer-types.js';
export const layerRoles: LayerRole[] = [
  'building',
  'path',
  'place',
  'entrance',
  'barrier',
  'closure',
  'landcover',
  'road-surface',
  'overlay',
  'boundary',
  'group',
];
export const layerBands: LayerBand[] = [
  'landscape',
  'surfaces',
  'buildings',
  'annotations',
];
export const layerKey = (kind: string, id: string) => `${kind}:${id}`;
const coreRoles = new Set<LayerRole>([
  'boundary',
  'path',
  'building',
  'place',
  'entrance',
  'barrier',
  'closure',
]);
export const coreLayer = (layer: CampusLayer) => coreRoles.has(layer.role);
export function layerIdentity(value: string) {
  // Two independent 32-bit lanes, stable across runtimes; no filenames or display labels.
  let a = 2166136261,
    b = 5381;
  for (const c of value) {
    a = Math.imul(a ^ c.charCodeAt(0), 16777619);
    b = Math.imul(b, 33) ^ c.charCodeAt(0);
  }
  return `map-layer:${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
export function featureRole(p: Record<string, unknown>): LayerRole {
  if (p.kind === 'land')
    return ['road', 'sidewalk'].includes(String(p.landClass)) &&
      !/parcel/i.test(String(p.importLayer || ''))
      ? 'road-surface'
      : 'landcover';
  return layerRoles.includes(p.kind as LayerRole)
    ? (p.kind as LayerRole)
    : 'overlay';
}
export function roleBand(role: LayerRole): LayerBand {
  return role === 'landcover' || role === 'boundary'
    ? 'landscape'
    : role === 'road-surface' || role === 'path'
      ? 'surfaces'
      : role === 'building'
        ? 'buildings'
        : 'annotations';
}
export const roleName = (role: LayerRole) =>
  ({
    'road-surface': 'Road surfaces',
    landcover: 'Landscape',
    path: 'Routing paths',
    building: 'Buildings',
    place: 'Places',
    entrance: 'Entrances',
    barrier: 'Barriers',
    closure: 'Closures',
    boundary: 'Boundary',
    overlay: 'Overlays',
    group: 'Folder',
  })[role];
export function newLayer(
  name: string,
  role: LayerRole,
  id = `map-layer:${crypto.randomUUID()}`,
): CampusLayer {
  return {
    id,
    name,
    role,
    band: roleBand(role),
    order: 0,
    editorVisible: true,
    locked: false,
    included: true,
    publishedVisible: true,
    archived: false,
    style: {},
    rules: [],
    members: [],
  };
}
export interface LayerFeature {
  key: string;
  id: string;
  kind: MapEdit['kind'] | 'boundary';
  properties: Record<string, unknown>;
  geometry: Feature['geometry'];
}
export function layerFeatures(data: CampusData): LayerFeature[] {
  return [
    {
      key: 'boundary:campus-boundary',
      id: 'campus-boundary',
      kind: 'boundary',
      geometry: data.boundary.geometry,
      properties: {
        ...data.boundary.properties,
        id: 'campus-boundary',
        kind: 'boundary',
        name: 'Campus boundary',
        source: 'campus',
      },
    },
    ...data.map.features.map((f) => ({
      key: layerKey(String(f.properties?.kind), String(f.properties?.id)),
      id: String(f.properties?.id),
      kind: f.properties?.kind as MapEdit['kind'],
      properties: f.properties || {},
      geometry: f.geometry,
    })),
    ...data.places.map((p) => ({
      key: layerKey('place', p.id),
      id: p.id,
      kind: 'place' as const,
      properties: { ...p, kind: 'place' },
      geometry: { type: 'Point' as const, coordinates: p.coordinates },
    })),
    ...(data.entrances || []).map((p) => ({
      key: layerKey('entrance', p.id),
      id: p.id,
      kind: 'entrance' as const,
      properties: { ...p, kind: 'entrance' },
      geometry: { type: 'Point' as const, coordinates: p.coordinates },
    })),
  ];
}
function inferred(p: Record<string, unknown>) {
  const role = featureRole(p),
    source = String(p.source || 'campus');
  // Legacy ArcGIS IDs retain their original dataset even after an owner correction.
  const legacy = String(p.id || '').match(/^arcgis:(.+):[^:]+$/)?.[1];
  const importedLayer = String(p.importLayer || legacy || '');
  const acceptedLayer = String(p.id || '').match(/^import:[^:]+:([^:]+):/)?.[1];
  const sourceKey = String(p.mapLayerSource || source);
  const id = String(
    p.mapLayerId ||
      layerIdentity(
        JSON.stringify([sourceKey, acceptedLayer || importedLayer, role]),
      ),
  );
  const layer = newLayer(
    importedLayer ||
      (acceptedLayer ? `${roleName(role)} · ${acceptedLayer}` : '') ||
      `${roleName(role)} · ${sourceKey.replace(/^import:/, '').slice(0, 12)}`,
    role,
    id,
  );
  return { ...layer, sourceKey, sourceName: sourceKey, importedLayer };
}
export function campusLayers(data: CampusData): CampusLayers {
  const layers = new Map<string, CampusLayer>();
  for (const f of layerFeatures(data)) {
    const l = inferred(f.properties);
    if (!layers.has(l.id)) layers.set(l.id, l);
  }
  for (const layer of data.layers?.items || [])
    layers.set(layer.id, {
      ...newLayer(layer.name, layer.role, layer.id),
      ...layer,
      members: layer.members || [],
      rules: layer.rules || [],
    });
  return {
    version: 1,
    items: [...layers.values()].sort(
      (a, b) =>
        layerBands.indexOf(a.band) - layerBands.indexOf(b.band) ||
        a.order - b.order ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    ),
  };
}
export function layerMembership(
  data: CampusData,
  layers = campusLayers(data).items,
) {
  const result = new Map(
    layerFeatures(data).map((f) => [f.key, inferred(f.properties).id]),
  );
  for (const layer of layers)
    for (const key of layer.members || []) result.set(key, layer.id);
  return result;
}
export function bindCampusLayers(data: CampusData, base: CampusData) {
  const original = layerMembership(base),
    definitions = new Map(campusLayers(base).items.map((l) => [l.id, l]));
  for (const l of data.layers?.items || []) definitions.set(l.id, l);
  const sources = new Map(
    layerFeatures(base).map((f) => [
      f.key,
      f.properties.mapLayerSource || f.properties.source,
    ]),
  );
  for (const f of layerFeatures(data)) {
    const id =
      original.get(f.key) ||
      String(f.properties.mapLayerId || inferred(f.properties).id);
    if (!definitions.has(id)) definitions.set(id, inferred(f.properties));
    f.properties.mapLayerId = id;
    f.properties.mapLayerSource =
      f.properties.mapLayerSource || sources.get(f.key) || f.properties.source;
    if (f.kind === 'place')
      Object.assign(
        data.places.find((p) => p.id === f.id)!,
        { mapLayerId: id, mapLayerSource: f.properties.mapLayerSource },
      );
    if (f.kind === 'entrance')
      Object.assign(
        data.entrances!.find((p) => p.id === f.id)!,
        { mapLayerId: id, mapLayerSource: f.properties.mapLayerSource },
      );
  }
  data.layers = { version: 1, items: [...definitions.values()] };
  const membership = layerMembership(data, data.layers.items);
  for (const f of data.map.features)
    if (f.properties)
      f.properties.mapLayerId = membership.get(
        layerKey(String(f.properties.kind), String(f.properties.id)),
      );
  for (const p of data.places)
    Object.assign(p, { mapLayerId: membership.get(layerKey('place', p.id)) });
  for (const p of data.entrances || [])
    Object.assign(p, {
      mapLayerId: membership.get(layerKey('entrance', p.id)),
    });
  data.boundary = {
    ...data.boundary,
    properties: {
      ...data.boundary.properties,
      mapLayerId: membership.get('boundary:campus-boundary'),
    },
  };
}
export function layerEdit(layer: CampusLayer, previous?: MapEdit): MapEdit {
  return {
    id: layer.id,
    kind: 'layer',
    geometry: { type: 'GeometryCollection', geometries: [] },
    properties: { name: layer.name, layerDefinition: structuredClone(layer) },
    ...(previous?.updated_at ? { updated_at: previous.updated_at } : {}),
  };
}
export function layerErrors(value: unknown): string[] {
  if (!value || typeof value !== 'object')
    return ['Layer definition is required.'];
  const l = value as CampusLayer,
    errors: string[] = [];
  if (
    !/^map-layer:[\w.-]{1,100}$/.test(l.id) ||
    typeof l.name !== 'string' ||
    !l.name.trim() ||
    l.name.length > 200
  )
    errors.push('Give this layer a valid identity and name.');
  if (!layerRoles.includes(l.role) || !layerBands.includes(l.band))
    errors.push('Choose a supported layer role and drawing band.');
  if (!Number.isInteger(l.order) || Math.abs(l.order) > 10000)
    errors.push('Layer order is outside its supported range.');
  for (const key of [
    'editorVisible',
    'locked',
    'included',
    'publishedVisible',
    'archived',
  ] as const)
    if (typeof l[key] !== 'boolean') errors.push(`Invalid layer ${key}.`);
  if (coreRoles.has(l.role) && l.included === false)
    errors.push(
      'Core campus dependencies must stay included; use published visibility to hide their presentation.',
    );
  if (
    l.parentId !== undefined &&
    (!/^map-layer:[\w.-]{1,100}$/.test(l.parentId) || l.parentId === l.id)
  )
    errors.push('Choose a valid parent folder.');
  if (
    !Array.isArray(l.members) ||
    l.members.length > 100000 ||
    l.members.some((k) => typeof k !== 'string' || k.length > 500) ||
    new Set(l.members).size !== l.members.length
  )
    errors.push('Invalid layer membership.');
  const styleErrors = (s: LayerStyle) => {
    if (!s || typeof s !== 'object') {
      errors.push('Invalid layer style.');
      return;
    }
    for (const k of ['color', 'darkColor', 'outline'] as const)
      if (s[k] !== undefined && !/^#[0-9a-f]{6}$/i.test(s[k]!))
        errors.push(`Invalid layer ${k}.`);
    for (const [k, min, max] of [
      ['opacity', 0, 1],
      ['lineWidth', 0.1, 30],
      ['pointSize', 1, 40],
      ['minZoom', 0, 24],
      ['maxZoom', 0, 24],
    ] as const)
      if (
        s[k] !== undefined &&
        (!Number.isFinite(s[k]) || s[k]! < min || s[k]! > max)
      )
        errors.push(`Invalid layer ${k}.`);
    if ((s.minZoom ?? 0) > (s.maxZoom ?? 24))
      errors.push('Minimum zoom must not exceed maximum zoom.');
    if (
      s.labelField !== undefined &&
      !['name', 'label', 'sourceId', 'landClass', 'surface'].includes(
        s.labelField,
      )
    )
      errors.push('Choose a mapped label field.');
    if (
      s.symbol !== undefined &&
      !['circle', 'square', 'diamond'].includes(s.symbol)
    )
      errors.push('Choose a supported point symbol.');
    if (s.labels !== undefined && typeof s.labels !== 'boolean')
      errors.push('Invalid label visibility.');
  };
  styleErrors(l.style);
  if (!Array.isArray(l.rules) || l.rules.length > 50)
    errors.push('A layer supports up to 50 classification rules.');
  else
    for (const r of l.rules) {
      if (
        !['landClass', 'surface', 'highway', 'vegetation'].includes(r.field) ||
        typeof r.value !== 'string' ||
        r.value.length > 200
      )
        errors.push('Invalid classification rule.');
      styleErrors(r.style);
    }
  return errors;
}
export function catalogueErrors(items: CampusLayer[]) {
  const errors = items.flatMap(layerErrors),
    lookup = new Map(items.map((l) => [l.id, l]));
  if (items.length > 500 || lookup.size !== items.length)
    errors.push(
      'Layer catalogue is too large or contains duplicate identities.',
    );
  const assigned = new Set<string>();
  for (const l of items) {
    if (l.parentId && lookup.get(l.parentId)?.role !== 'group')
      errors.push(`${l.name}: parent must be an existing folder.`);
    const seen = new Set([l.id]);
    let p = l.parentId;
    while (p) {
      if (seen.has(p)) {
        errors.push(`${l.name}: folders cannot contain a cycle.`);
        break;
      }
      seen.add(p);
      p = lookup.get(p)?.parentId;
    }
    for (const key of l.members) {
      if (assigned.has(key))
        errors.push(`${key}: assigned to more than one layer.`);
      assigned.add(key);
    }
  }
  return errors;
}
export function resolveLayerStyle(
  layer: CampusLayer,
  p: Record<string, unknown>,
): LayerStyle {
  return {
    ...layer.style,
    ...layer.rules.find((r) => String(p[r.field] ?? '') === r.value)?.style,
    ...(typeof p.color === 'string' ? { color: p.color } : {}),
    ...(typeof p.opacity === 'number' ? { opacity: p.opacity } : {}),
    ...(p.layerStyle as LayerStyle),
  };
}
/** Filter/render a copy only. Source geometry, graph and permission records are untouched. */
export function layerPresentation(
  data: CampusData,
  editor = false,
  view: LayerViewState = {},
): CampusData {
  const items = campusLayers(data).items,
    lookup = new Map(items.map((l) => [l.id, l])),
    membership = layerMembership(data, items);
  function visible(layer: CampusLayer) {
    let l: CampusLayer | undefined = layer;
    const seen = new Set<string>();
    while (l && !seen.has(l.id)) {
      seen.add(l.id);
      if (
        l.archived ||
        (editor
          ? (!l.editorVisible && !view.shown?.includes(l.id)) ||
            view.hidden?.includes(l.id)
          : !l.included || !l.publishedVisible)
      )
        return false;
      l = l.parentId ? lookup.get(l.parentId) : undefined;
    }
    return !editor || !view.isolated || seen.has(view.isolated);
  }
  const presented = (kind: string, id: string, p: Record<string, unknown>) => {
    const layer = lookup.get(membership.get(layerKey(kind, id)) || '');
    if (!layer) return p;
    const style = resolveLayerStyle(layer, p);
    return {
      ...p,
      mapLayerId: layer.id,
      mapLayerSource: p.mapLayerSource || p.source,
      renderStyle: style,
      layerBand: layer.band,
      layerOrder: layer.order,
      visible: p.visible !== false && visible(layer),
      ...(style.labelField ? { label: String(p[style.labelField] || '') } : {}),
    };
  };
  return {
    ...data,
    layers: { version: 1, items },
    map: {
      ...data.map,
      features: data.map.features.map((f) => ({
        ...f,
        properties: presented(
          String(f.properties?.kind),
          String(f.properties?.id),
          f.properties || {},
        ),
      })),
    },
    boundary: {
      ...data.boundary,
      properties: presented(
        'boundary',
        'campus-boundary',
        data.boundary.properties || {},
      ),
    },
    places: data.places.map((p) => ({
      ...p,
      ...presented('place', p.id, p as unknown as Record<string, unknown>),
    })),
    entrances: (data.entrances || []).map((p) => ({
      ...p,
      ...presented('entrance', p.id, p as unknown as Record<string, unknown>),
    })),
  };
}
export function editableLayer(layer: CampusLayer, items: CampusLayer[]) {
  const byId = new Map(items.map((l) => [l.id, l])),
    seen = new Set<string>();
  let l: CampusLayer | undefined = layer;
  while (l && !seen.has(l.id)) {
    seen.add(l.id);
    if (l.locked || l.archived || !l.editorVisible) return false;
    l = l.parentId ? byId.get(l.parentId) : undefined;
  }
  return true;
}
