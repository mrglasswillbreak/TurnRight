import type { MapEdit } from './types';

const keyOf = (edit: MapEdit) => `${edit.kind}:${edit.id}`;
const topologyFields = new Set([
  'vertexIds',
  'buildingTopology',
  'connections',
  'connection',
  'connectTo',
  'connectStart',
  'connectEnd',
  'placeId',
  'buildingId',
  'entranceId',
  'edgeIds',
  'mergedInto',
  'duplicateKeepSeparate',
  'revertToSource',
]);
export function canonical(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const content = (edit?: MapEdit) =>
  edit && {
    geometry: edit.geometry,
    properties: edit.properties,
    deleted: !!edit.deleted,
  };
export interface FieldConflict {
  key: string;
  featureId: string;
  featureKind: MapEdit['kind'];
  name: string;
  field: string;
  base: unknown;
  local: unknown;
  server: unknown;
}
export type ConflictChoices = Record<string, 'local' | 'server'>;
export function mergeWorkspace(
  base: MapEdit[],
  local: MapEdit[],
  server: MapEdit[],
  choices: ConflictChoices = {},
) {
  const before = new Map(base.map((e) => [keyOf(e), e]));
  const mine = new Map(local.map((e) => [keyOf(e), e]));
  const remote = new Map(server.map((e) => [keyOf(e), e]));
  const conflicts: FieldConflict[] = [];
  const edits: MapEdit[] = [];
  for (const key of new Set([
    ...before.keys(),
    ...mine.keys(),
    ...remote.keys(),
  ])) {
    const b = before.get(key),
      l = mine.get(key),
      r = remote.get(key);
    const feature = l || r || b!;
    const choose = (field: string, bv: unknown, lv: unknown, rv: unknown) => {
      if (equal(lv, bv)) return rv;
      if (equal(rv, bv) || equal(lv, rv)) return lv;
      const conflictKey = `${key}:${field}`;
      conflicts.push({
        key: conflictKey,
        featureId: feature.id,
        featureKind: feature.kind,
        name: String(feature.properties.name || feature.id),
        field,
        base: bv,
        local: lv,
        server: rv,
      });
      return choices[conflictKey] === 'server' ? rv : lv;
    };
    if (equal(content(l), content(b))) {
      if (r) edits.push(structuredClone(r));
      continue;
    }
    if (equal(content(r), content(b)) || equal(content(l), content(r))) {
      if (l) edits.push({ ...structuredClone(l), updated_at: r?.updated_at });
      continue;
    }
    // Creation/deletion conflicts require a whole-feature choice. A deleted
    // feature must never be pieced together with remote live connections.
    if (
      !b ||
      !l ||
      !r ||
      !!b.deleted !== !!l.deleted ||
      !!b.deleted !== !!r.deleted
    ) {
      const chosen = choose(
        'Feature existence',
        content(b),
        content(l),
        content(r),
      );
      if (chosen)
        edits.push({
          ...feature,
          ...structuredClone(chosen as ReturnType<typeof content>),
          updated_at: r?.updated_at,
        } as MapEdit);
      continue;
    }
    const surfaceGeometryChanged =
      feature.kind === 'building' &&
      (!equal(b.geometry, l.geometry) ||
        !equal(b.geometry, r.geometry) ||
        !equal(b.properties.buildingTopology, l.properties.buildingTopology) ||
        !equal(b.properties.buildingTopology, r.properties.buildingTopology));
    const geometryGroup = (e: MapEdit) => ({
      geometry: e.geometry,
      properties: Object.fromEntries(
        Object.entries(e.properties).filter(
          ([k]) =>
            topologyFields.has(k) ||
            (surfaceGeometryChanged && k === 'appearance'),
        ),
      ),
    });
    const topology = choose(
      'Geometry and connections',
      geometryGroup(b),
      geometryGroup(l),
      geometryGroup(r),
    ) as ReturnType<typeof geometryGroup>;
    const properties: MapEdit['properties'] = {
      ...structuredClone(topology.properties),
    };
    for (const field of new Set([
      ...Object.keys(b.properties),
      ...Object.keys(l.properties),
      ...Object.keys(r.properties),
    ])) {
      if (
        topologyFields.has(field) ||
        (surfaceGeometryChanged && field === 'appearance')
      )
        continue;
      const mergeObject = (
        path: string,
        base: unknown,
        local: unknown,
        remote: unknown,
      ): unknown => {
        if (
          [base, local, remote].every(
            (v) =>
              v === undefined ||
              (v !== null && typeof v === 'object' && !Array.isArray(v)),
          )
        ) {
          const bv = (base || {}) as Record<string, unknown>,
            lv = (local || {}) as Record<string, unknown>,
            rv = (remote || {}) as Record<string, unknown>;
          return Object.fromEntries(
            [
              ...new Set([
                ...Object.keys(bv),
                ...Object.keys(lv),
                ...Object.keys(rv),
              ]),
            ].flatMap((k) => {
              const value = mergeObject(`${path}.${k}`, bv[k], lv[k], rv[k]);
              return value === undefined ? [] : [[k, value]];
            }),
          );
        }
        return choose(path, base, local, remote);
      };
      const topologyChanged =
        !equal(geometryGroup(b), geometryGroup(l)) ||
        !equal(geometryGroup(b), geometryGroup(r));
      const value =
        field === 'appearance' && !topologyChanged
          ? mergeObject(
              field,
              b.properties[field],
              l.properties[field],
              r.properties[field],
            )
          : choose(
              field,
              b.properties[field],
              l.properties[field],
              r.properties[field],
            );
      if (value !== undefined) properties[field] = structuredClone(value);
    }
    edits.push({
      ...r,
      geometry: structuredClone(topology.geometry),
      properties,
    });
  }
  return {
    edits,
    conflicts,
    unresolved: conflicts.filter((c) => !choices[c.key]),
  };
}
