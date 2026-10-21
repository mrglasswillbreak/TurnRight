import {
  campusLayers,
  catalogueErrors,
  bindCampusLayers,
} from './campus-layers.js';
import type { CampusLayer } from './campus-layer-types.js';
import { publicPhoto, canonicalBuildingId, arrivalIssues } from './arrival.js';
import { applyDrivingEdits, drivingIssues } from './driving-data.js';
import { applyConnections, remapClosures } from './editor-topology.js';
import { cachedGeometryBlocker } from './spatial.js';
import {
  connectCrossingPaths,
  restoreCrossingPaths,
} from './path-crossings.js';
import { resolvePlaceId } from './map-display.js';
import {
  structuralIssues,
  firstPosition,
  type ValidationPhase,
  type ValidationIssue,
} from './validation.js';
import type { CampusData, MapEdit, CampusPhoto } from './types.js';
import { validateEdit } from './editor-edit-validation.js';
import {
  applyPlaceEdit,
  applyBuildingEdit,
  applyLayerFeatureEdit,
  applyEntranceEdit,
  applyClosureEdit,
} from './editor-apply-feature.js';
import { applyPathEdit } from './editor-apply-path.js';
export function applyEdits(
  base: CampusData,
  edits: MapEdit[],
  phase?: (phase: ValidationPhase) => void,
): {
  data: CampusData;
  errors: string[];
  warnings: string[];
  issues: ValidationIssue[];
} {
  phase?.('sources');
  const structural = structuralIssues(base);
  if (structural.length)
    return {
      data: base,
      errors: structural.map((issue) => issue.message),
      warnings: [],
      issues: structural,
    };
  phase?.('edits');
  const data = structuredClone(base),
    errors: string[] = [],
    warnings: string[] = [];
  const issues: ValidationIssue[] = [];
  const issue = (
    message: string,
    featureId: string,
    featureKind: MapEdit['kind'],
    extra: Partial<ValidationIssue> = {},
  ) => {
    const edit = edits.find(
      (e) => e.id === featureId && e.kind === featureKind,
    );
    issues.push({
      code: 'edit-validation',
      phase: 'edits',
      featureId,
      featureKind,
      message,
      coordinates:
        edit && 'coordinates' in edit.geometry
          ? firstPosition(edit.geometry.coordinates)
          : undefined,
      ...extra,
    });
    (extra.severity === 'warning' ? warnings : errors).push(message);
  };
  const validMerges = edits.filter(
    (e) =>
      e.deleted &&
      !e.properties.revertToSource &&
      e.properties.mergedInto &&
      !validateEdit(e, base).length,
  );
  data.placeIdAliases = Object.fromEntries([
    ...Object.entries(data.placeIdAliases || {}),
    ...validMerges
      .filter((e) => e.kind === 'place')
      .map((e) => [e.id, e.properties.mergedInto!] as const),
  ]);
  const buildingAliases = Object.fromEntries([
    ...Object.entries(data.buildingIdAliases || {}),
    ...validMerges
      .filter((e) => e.kind === 'building')
      .map((e) => [e.id, e.properties.mergedInto!] as const),
  ]);
  data.buildingIdAliases = buildingAliases;
  const buildingId = (id: string) =>
    resolvePlaceId({ placeIdAliases: buildingAliases }, id);
  restoreCrossingPaths(data);
  const nodes = new Map(data.graph.nodes.map((n) => [n.id, n]));
  data.entrances = [...(data.entrances || [])];
  let connectedPaths = false;
  let canonical = (id: string) => id;
  const connectPaths = () => {
    if (connectedPaths) return;
    phase?.('topology');
    const aliases = new Map<string, string>();
    connectCrossingPaths(data, nodes, aliases);
    applyConnections(
      data,
      nodes,
      edits.filter((e) => !validateEdit(e, base).length),
      errors,
      issues,
      aliases,
    );
    canonical = connectCrossingPaths(data, nodes, aliases);
    connectedPaths = true;
    phase?.('edits');
  };
  const rank = {
    layer: -1,
    path: 0,
    place: 1,
    building: 2,
    entrance: 3,
    barrier: 4,
    closure: 4,
    land: 2,
    overlay: 2,
  };
  const ordered = [...edits].sort(
    (a, b) => rank[a.kind] - rank[b.kind] || a.id.localeCompare(b.id),
  );
  for (const edit of ordered) {
    if (edit.deleted && edit.properties?.revertToSource === true) continue;
    const invalid = validateEdit(edit, base);
    if (invalid.length) {
      invalid.forEach((message) =>
        issue(`${edit.id}: ${message}`, edit.id, edit.kind),
      );
      continue;
    }
    const props = edit.properties;
    if (edit.kind === 'layer') {
      const definition = props.layerDefinition as CampusLayer;
      const items = campusLayers(data).items.filter((l) => l.id !== edit.id);
      data.layers = {
        version: 1,
        items: [...items, structuredClone(definition)],
      };
      continue;
    }
    // A keep-separate decision must not freeze source geometry or metadata.
    if (props.duplicateReviewOnly && !edit.deleted) continue;
    if (
      props.photos !== undefined &&
      ['building', 'entrance'].includes(edit.kind)
    ) {
      if (edit.kind === 'building')
        data.photoOverrides = [
          ...new Set([...(data.photoOverrides || []), buildingId(edit.id)]),
        ];
      const belongs = (p: CampusPhoto) =>
        edit.kind === 'entrance'
          ? p.entranceId === edit.id
          : !p.entranceId &&
            canonicalBuildingId(data, p.buildingId) === buildingId(edit.id);
      const photos = props.photos as CampusPhoto[];
      if (photos.some((p) => !belongs(p)))
        issue(
          `${edit.id}: photograph belongs to a different building or entrance.`,
          edit.id,
          edit.kind,
        );
      else
        data.photos = [
          ...(data.photos || []).filter((p) => !belongs(p)),
          ...photos.map(publicPhoto),
        ];
    }
    if (['entrance', 'barrier', 'closure'].includes(edit.kind)) connectPaths();
    if (edit.kind === 'place')
      applyPlaceEdit({ data, warnings, buildingId }, edit);
    else if (edit.kind === 'path') applyPathEdit({ data, nodes, issue }, edit);
    else if (edit.kind === 'building') applyBuildingEdit({ data }, edit);
    else if (edit.kind === 'land' || edit.kind === 'overlay')
      applyLayerFeatureEdit({ data }, edit);
    else if (edit.kind === 'entrance' && edit.geometry.type === 'Point')
      applyEntranceEdit(
        { data, nodes, warnings, issue, buildingId, canonical },
        edit,
      );
    else if (edit.kind === 'barrier' || edit.kind === 'closure')
      applyClosureEdit({ data, issue }, edit);
  }
  for (const [kind, aliases] of [
    ['place', data.placeIdAliases],
    ['building', buildingAliases],
  ] as const) {
    for (const from of Object.keys(aliases)) {
      const to = resolvePlaceId({ placeIdAliases: aliases }, from);
      const exists =
        kind === 'place'
          ? data.places.some((p) => p.id === to)
          : data.map.features.some(
              (f) =>
                f.properties?.kind === 'building' && f.properties.id === to,
            );
      if (to === from || !exists)
        issue(
          `${from}: duplicate merge has a missing or cyclic target.`,
          from,
          kind,
        );
      else aliases[from] = to;
    }
  }
  for (const entrance of data.entrances) {
    entrance.placeId = resolvePlaceId(data, entrance.placeId);
    if (entrance.buildingId)
      entrance.buildingId = buildingId(entrance.buildingId);
  }
  for (const place of data.places) {
    if (place.buildingId) place.buildingId = buildingId(place.buildingId);
    else if (Object.hasOwn(buildingAliases, place.id))
      place.buildingId = buildingId(place.id);
  }
  for (const feature of data.map.features)
    if (feature.properties?.kind === 'building') {
      delete feature.properties.modelAuthoring;
      const linked =
        feature.properties.placeId ||
        (Object.hasOwn(data.placeIdAliases, feature.properties.id)
          ? feature.properties.id
          : undefined);
      if (linked)
        feature.properties.placeId = resolvePlaceId(data, String(linked));
    }
  connectPaths();
  remapClosures(data, errors, issues);
  const connected = new Set(data.graph.edges.flatMap((e) => [e.from, e.to]));
  data.graph.nodes = [...nodes.values()].filter((n) => connected.has(n.id));
  for (const place of data.places) {
    if (place.graphNode) place.graphNode = canonical(place.graphNode);
    if (place.graphNode && !connected.has(place.graphNode)) {
      delete place.graphNode;
      place.arrivalKind = 'unmapped';
      warnings.push(`${place.name}: its old walking connection was removed.`);
    }
  }
  applyDrivingEdits(
    data,
    edits.filter((e) => !validateEdit(e, base).length),
  );
  if (data.driving) {
    for (const p of data.driving.parking) {
      p.vehicleNodeId = canonical(p.vehicleNodeId);
      p.walkingNodeId = canonical(p.walkingNodeId);
    }
    for (const r of data.driving.restrictions)
      r.viaNodeId = canonical(r.viaNodeId);
  }
  for (const message of drivingIssues(data)) issue(message, '', 'path');
  const ids = new Set<string>();
  phase?.('geometry');
  const blockedGeometry = cachedGeometryBlocker(data.map);
  for (const edge of data.graph.edges) {
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    if (a && b) {
      edge.geometryBlocked = blockedGeometry(a.coordinates, b.coordinates);
      if (edge.geometryBlocked)
        issue(
          `${edge.sourceId}: segment excluded because it crosses a mapped ${edge.geometryBlocked.split(':')[0]}.`,
          edge.sourceId,
          'path',
          {
            code: 'blocked-segment',
            phase: 'geometry',
            severity: 'warning',
            field: 'geometry',
            repair: 'review-segment',
            coordinates: a.coordinates,
            referenceIds: [edge.id, edge.geometryBlocked],
          },
        );
    }
    if (ids.has(edge.id))
      issue(`Duplicate edge ${edge.id}`, edge.sourceId, 'path');
    ids.add(edge.id);
    if (!nodes.has(edge.from) || !nodes.has(edge.to))
      issue(`Path ${edge.id} has a missing endpoint.`, edge.sourceId, 'path', {
        referenceIds: [edge.from, edge.to],
      });
    if (!(edge.distance > 0) || !Number.isFinite(edge.distance))
      issue(`Path ${edge.id} has an invalid length.`, edge.sourceId, 'path');
  }
  const adjacency = new Map<string, string[]>();
  const blocked = new Set(
    data.closures
      .filter((c) => !c.reopenedAt && (!c.modes || c.modes.includes('walking')))
      .flatMap((c) => c.edgeIds),
  );
  for (const e of data.graph.edges.filter(
    (e) => e.accessible && !e.geometryBlocked && !blocked.has(e.id),
  )) {
    adjacency.set(e.from, [...(adjacency.get(e.from) || []), e.to]);
    adjacency.set(e.to, [...(adjacency.get(e.to) || []), e.from]);
  }
  for (const entrance of data.entrances) {
    if (!data.places.some((p) => p.id === entrance.placeId))
      issue(`${entrance.id}: its place was removed.`, entrance.id, 'entrance', {
        code: 'entrance-place',
        field: 'placeId',
        repair: 'choose-place',
        coordinates: entrance.coordinates,
      });
    if (entrance.graphNode) entrance.graphNode = canonical(entrance.graphNode);
    if (entrance.graphNode && !connected.has(entrance.graphNode)) {
      delete entrance.graphNode;
      issue(
        `${entrance.id}: its connecting path was removed.`,
        entrance.id,
        'entrance',
        {
          code: 'entrance-path',
          field: 'connection',
          repair: 'connect-path',
          coordinates: entrance.coordinates,
        },
      );
    }
  }
  for (const place of data.places) {
    const entrances = data.entrances.filter((e) => e.placeId === place.id);
    if (!entrances.length) continue;
    const usable = entrances
      .filter(
        (e) =>
          ['yes', 'campus'].includes(e.walkingAccess) &&
          e.graphNode &&
          adjacency.has(e.graphNode),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    place.graphNode = usable[0]?.graphNode;
    place.arrivalKind = usable.length ? 'entrance' : 'unmapped';
    place.approachDistance = usable.length ? 0 : undefined;
  }
  const seen = new Set<string>();
  for (const place of data.places) {
    if (place.graphNode && !adjacency.has(place.graphNode)) {
      delete place.graphNode;
      place.arrivalKind = 'unmapped';
      warnings.push(`${place.name}: its path connection is currently blocked.`);
    }
  }
  let components = 0;
  for (const id of adjacency.keys()) {
    if (seen.has(id)) continue;
    components++;
    const queue = [id];
    while (queue.length) {
      const next = queue.pop()!;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(...(adjacency.get(next) || []).filter((n) => !seen.has(n)));
    }
  }
  data.coverage = {
    ...data.coverage,
    components,
    placeCount: data.places.length,
    routableCount: data.places.filter(
      (p) => p.arrivalKind === 'entrance' && p.graphNode,
    ).length,
    approachCount: data.places.filter(
      (p) => p.arrivalKind === 'mapped-approach' && p.graphNode,
    ).length,
    disconnected: data.places.filter((p) => !p.graphNode).map((p) => p.id),
    fieldVerified: false,
  };
  for (const message of arrivalIssues(data))
    issue(message, 'campus', 'building', { code: 'arrival-media' });
  bindCampusLayers(data, base);
  if (data.layers)
    for (const message of catalogueErrors(data.layers.items))
      issue(message, 'campus', 'layer', { code: 'layer-catalogue' });
  return {
    data,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    issues: [
      ...new Map(
        issues.map((i) => [
          `${i.featureKind}:${i.featureId}:${i.code}:${i.message}`,
          i,
        ]),
      ).values(),
    ],
  };
}
export { type SourceRecord, assembleSources } from './editor-source-records.js';
export { pathWalkingAccess } from './editor-path-access.js';
export { validateEdit } from './editor-edit-validation.js';
