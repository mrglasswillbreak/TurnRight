import {
  applyConnections,
  resolveConnection,
  remapClosures,
  edgeMatches,
  orderedPathNodes,
} from './editor-topology.js';
import { distance, projectSegment } from './geo.js';
import { cachedGeometryBlocker } from './spatial.js';
import type {
  CampusData,
  GraphNode,
  MapEdit,
  Place,
  Position,
  WalkingAccess,
  ConnectionTarget,
} from './types.js';
import type { Geometry } from 'geojson';
export interface SourceRecord {
  id: string;
  source: string;
  entity: 'meta' | 'feature' | 'place' | 'node' | 'edge';
  payload: any;
  hash: string;
}
const walkingAccessValues = ['yes', 'campus', 'private', 'no'];
export function pathWalkingAccess(data: CampusData, id: string): WalkingAccess {
  const declared = data.map.features.find((f) => f.properties?.id === id)
    ?.properties?.walkingAccess;
  if (walkingAccessValues.includes(declared)) return declared as WalkingAccess;
  const edges = data.graph.edges.filter((e) => e.sourceId === id);
  if (!edges.length || edges.some((e) => !e.accessible)) return 'private';
  return edges.some((e) => e.walkingAccess === 'campus') ? 'campus' : 'yes';
}
export function validateEdit(edit: MapEdit): string[] {
  const errors: string[] = [];
  if (
    !edit ||
    typeof edit.id !== 'string' ||
    edit.id.length > 200 ||
    !/^[\w: .-]+$/.test(edit.id)
  )
    return ['Invalid feature ID.'];
  if (
    !['place', 'path', 'building', 'entrance', 'barrier', 'closure'].includes(
      edit.kind,
    )
  )
    return ['Choose a supported feature type.'];
  if (
    !edit.geometry ||
    !['Point', 'LineString', 'Polygon'].includes(edit.geometry.type)
  )
    return ['Draw a point, path, or building outline.'];
  if (!edit.properties || typeof edit.properties !== 'object')
    return ['Feature properties are required.'];
  if (edit.kind === 'path' && edit.geometry.type !== 'LineString')
    errors.push('Walking paths must be lines.');
  if (
    edit.kind === 'path' &&
    edit.properties.access !== undefined &&
    !walkingAccessValues.includes(String(edit.properties.access))
  )
    errors.push('Choose a supported walking access setting.');
  if (
    ['place', 'entrance'].includes(edit.kind) &&
    edit.geometry.type !== 'Point'
  )
    errors.push('Places and entrances must be points.');
  if (edit.kind === 'building' && edit.geometry.type !== 'Polygon')
    errors.push('Buildings must be polygons.');
  if (!edit.deleted && typeof edit.properties.name !== 'string')
    errors.push('Give the feature a name or description.');
  const validId = (id: unknown) =>
    typeof id === 'string' && id.length > 0 && id.length <= 4000;
  const validPosition = (p: unknown) =>
    Array.isArray(p) &&
    p.length === 2 &&
    p.every((n) => typeof n === 'number' && Number.isFinite(n));
  const validTarget = (value: unknown) => {
    if (!value || typeof value !== 'object') return false;
    const t = value as ConnectionTarget;
    return (
      validPosition(t.coordinates) &&
      (t.type === 'node'
        ? validId(t.nodeId)
        : t.type === 'segment' &&
          validId(t.sourceId) &&
          validId(t.from) &&
          validId(t.to))
    );
  };
  const props = edit.properties;
  if (
    props.vertexIds !== undefined &&
    (!Array.isArray(props.vertexIds) ||
      !props.vertexIds.every(validId) ||
      new Set(props.vertexIds).size !== props.vertexIds.length ||
      edit.geometry.type !== 'LineString' ||
      props.vertexIds.length !== edit.geometry.coordinates.length)
  )
    errors.push('Path vertex identities must match its coordinates.');
  if (
    props.connections !== undefined &&
    (!Array.isArray(props.connections) ||
      props.connections.length > 2000 ||
      !props.connections.every(
        (c) =>
          c &&
          validId(c.vertexId) &&
          validTarget(c.target) &&
          props.vertexIds?.includes(c.vertexId),
      ))
  )
    errors.push('Invalid path connection reference.');
  if (props.connection !== undefined && !validTarget(props.connection))
    errors.push('Invalid entrance connection reference.');
  if (
    edit.kind === 'entrance' &&
    props.access !== undefined &&
    !walkingAccessValues.includes(String(props.access))
  )
    errors.push('Choose a supported walking access setting.');
  if (
    props.footDirection !== undefined &&
    !['both', 'forward', 'reverse'].includes(String(props.footDirection))
  )
    errors.push('Choose a supported walking direction.');
  if (
    props.heightMode === 'floors' &&
    (!Number.isInteger(Number(props.floors)) ||
      Number(props.floors) < 1 ||
      Number(props.floors) > 50)
  )
    errors.push('Documented floor count must be between 1 and 50.');
  const geometry = edit.geometry as Exclude<
    Geometry,
    { type: 'GeometryCollection' }
  >;
  const positions: number[][] = [];
  function walk(value: unknown) {
    if (!Array.isArray(value) || !value.length) {
      errors.push('Empty geometry.');
      return;
    }
    if (typeof value[0] === 'number') positions.push(value);
    else value.forEach(walk);
  }
  walk(geometry.coordinates);
  if (positions.length > 2000)
    errors.push('A single edit is limited to 2,000 vertices.');
  if (
    positions.some(
      (p) =>
        p.length !== 2 ||
        p.some((n) => typeof n !== 'number' || !Number.isFinite(n)) ||
        p[0] < 3.19 ||
        p[0] > 3.215 ||
        p[1] < 6.455 ||
        p[1] > 6.5,
    )
  )
    errors.push('All coordinates must be within the LASU Ojo mapping area.');
  if (geometry.type === 'LineString' && positions.length < 2)
    errors.push('A path needs at least two points.');
  if (
    geometry.type === 'Polygon' &&
    geometry.coordinates.some(
      (r) => r.length < 4 || JSON.stringify(r[0]) !== JSON.stringify(r.at(-1)),
    )
  )
    errors.push('Building outlines must be closed polygons.');
  if (
    edit.properties.height !== undefined &&
    (!Number.isFinite(Number(edit.properties.height)) ||
      Number(edit.properties.height) < 0 ||
      Number(edit.properties.height) > 150)
  )
    errors.push('Building height must be between 0 and 150 metres.');
  return [...new Set(errors)];
}
export function assembleSources(
  records: SourceRecord[],
  fallback: CampusData,
): CampusData {
  if (!records.length) return structuredClone(fallback);
  const meta = records.find((r) => r.entity === 'meta')?.payload;
  if (!meta)
    throw new Error(
      'Approved source metadata is missing. Bootstrap the sources before publishing.',
    );
  return {
    ...structuredClone(meta),
    map: {
      type: 'FeatureCollection',
      features: records
        .filter((r) => r.entity === 'feature')
        .map((r) => structuredClone(r.payload)),
    },
    places: records
      .filter((r) => r.entity === 'place')
      .map((r) => structuredClone(r.payload)),
    graph: {
      nodes: records
        .filter((r) => r.entity === 'node')
        .map((r) => structuredClone(r.payload)),
      edges: records
        .filter((r) => r.entity === 'edge')
        .map((r) => structuredClone(r.payload)),
    },
  };
}
export function applyEdits(
  base: CampusData,
  edits: MapEdit[],
): { data: CampusData; errors: string[]; warnings: string[] } {
  const data = structuredClone(base),
    errors: string[] = [],
    warnings: string[] = [];
  const nodes = new Map(data.graph.nodes.map((n) => [n.id, n]));
  data.entrances = [...(data.entrances || [])];
  let connectedPaths = false;
  let canonical = (id: string) => id;
  const connectPaths = () => {
    if (connectedPaths) return;
    canonical = applyConnections(
      data,
      nodes,
      edits.filter((e) => !validateEdit(e).length),
      errors,
    );
    connectedPaths = true;
  };
  const rank = {
    path: 0,
    place: 1,
    building: 2,
    entrance: 3,
    barrier: 4,
    closure: 4,
  };
  const ordered = [...edits].sort(
    (a, b) => rank[a.kind] - rank[b.kind] || a.id.localeCompare(b.id),
  );
  for (const edit of ordered) {
    if (edit.deleted && edit.properties?.revertToSource === true) continue;
    const invalid = validateEdit(edit);
    if (invalid.length) {
      errors.push(...invalid.map((e) => `${edit.id}: ${e}`));
      continue;
    }
    const props = edit.properties;
    if (['entrance', 'barrier', 'closure'].includes(edit.kind)) connectPaths();
    if (edit.kind === 'place') {
      const previous = data.places.find((p) => p.id === edit.id);
      data.places = data.places.filter((p) => p.id !== edit.id);
      if (!edit.deleted && edit.geometry.type === 'Point') {
        const moved =
          previous &&
          distance(
            previous.coordinates,
            edit.geometry.coordinates as Position,
          ) > 5;
        data.places.push({
          ...previous,
          id: edit.id,
          name: String(props.name),
          category: (props.category ||
            previous?.category ||
            'other') as Place['category'],
          coordinates: edit.geometry.coordinates as Position,
          aliases: String(props.aliases || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          department: String(props.department || ''),
          faculty: String(props.faculty || ''),
          source: 'campus-review',
          sourceId: edit.id,
          graphNode: moved ? undefined : previous?.graphNode,
          arrivalKind: moved ? 'unmapped' : previous?.arrivalKind || 'unmapped',
        });
        if (moved)
          warnings.push(
            `${props.name}: location moved; connect an entrance before routing to its new position.`,
          );
      }
    } else if (edit.kind === 'path') {
      const originalFeature = data.map.features.find(
        (f) => f.properties?.id === edit.id && f.properties?.kind === 'path',
      );
      const originalEdges = data.graph.edges.filter(
        (e) => e.sourceId === edit.id,
      );
      const orderedOriginal = orderedPathNodes(data, edit.id);
      const access = (props.access ??
        (originalFeature || data.graph.edges.some((e) => e.sourceId === edit.id)
          ? pathWalkingAccess(data, edit.id)
          : 'yes')) as WalkingAccess;
      const changedAccess =
        props.access !== undefined &&
        access !== pathWalkingAccess(data, edit.id);
      const pathProperties = {
        ...originalFeature?.properties,
        id: edit.id,
        kind: 'path',
        name: props.name,
        source: 'campus-review',
        ...(props.surveyProvenance ? {surveyProvenance:'Reviewed walking survey'} : {}),
        walkingAccess: access,
        accessReviewId:
          access === 'campus'
            ? originalFeature?.properties?.accessReviewId
            : undefined,
        footDirection:
          props.footDirection ||
          originalFeature?.properties?.footDirection ||
          'both',
      };
      // Metadata-only changes must preserve junction IDs, gaps at restricted gates,
      // and closure edge references. Rebuilding the full displayed line can reopen gaps.
      if (
        !edit.deleted &&
        originalFeature &&
        JSON.stringify(originalFeature.geometry) ===
          JSON.stringify(edit.geometry) &&
        pathProperties.footDirection ===
          (originalFeature.properties?.footDirection || 'both') &&
        !props.connections?.length &&
        !props.connectStart &&
        !props.connectEnd &&
        data.graph.edges.some((e) => e.sourceId === edit.id)
      ) {
        data.graph.edges = data.graph.edges.map((e) =>
          e.sourceId === edit.id
            ? {
                ...e,
                name: String(props.name),
                accessible:
                  (access === 'yes' || access === 'campus') &&
                  (changedAccess || e.accessible),
                walkingAccess: changedAccess
                  ? access
                  : e.walkingAccess || access,
                accessReviewId:
                  access === 'campus' ? e.accessReviewId : undefined,
                steps: props.steps === undefined ? e.steps : !!props.steps,
              }
            : e,
        );
        originalFeature.properties = pathProperties;
        continue;
      }
      const originalNodeIds = new Set(
        data.graph.edges
          .filter((e) => e.sourceId === edit.id)
          .flatMap((e) => [e.from, e.to]),
      );
      const originalNodes = [...originalNodeIds]
        .map((id) => nodes.get(id)!)
        .filter(Boolean);
      data.graph.edges = data.graph.edges.filter((e) => e.sourceId !== edit.id);
      data.map.features = data.map.features.filter(
        (f) => f.properties?.id !== edit.id,
      );
      if (edit.deleted || edit.geometry.type !== 'LineString') continue;
      const drawn = edit.geometry.coordinates as Position[];
      // Preserve only this path's established junctions that still lie on the edited geometry.
      // Geometrically crossing a different path never creates a new connection.
      const points: Position[] = [];
      for (let i = 0; i < drawn.length - 1; i++) {
        points.push(drawn[i]);
        points.push(
          ...originalNodes
            .map((node) => ({
              node,
              projection: projectSegment(
                node.coordinates,
                drawn[i],
                drawn[i + 1],
              ),
            }))
            .filter(
              ({ projection }) =>
                projection.distance < 0.2 &&
                projection.t > 0.001 &&
                projection.t < 0.999,
            )
            .sort((a, b) => a.projection.t - b.projection.t)
            .map(({ node }) => node.coordinates),
        );
      }
      points.push(drawn[drawn.length - 1]);
      const sequence: GraphNode[] = [];
      points.forEach((point) => {
        const drawnIndex = drawn.findIndex((p) => distance(p, point) < 0.05);
        const stableId =
          drawnIndex >= 0 ? props.vertexIds?.[drawnIndex] : undefined;
        const original =
          originalNodes.find((n) => n.id === stableId) ||
          originalNodes.find((n) => distance(n.coordinates, point) < 0.2);
        const node: GraphNode = {
          ...original,
          id: stableId || original?.id || `${edit.id}:vertex:${drawnIndex}`,
          coordinates: point,
        };
        nodes.set(node.id, node);
        sequence.push(node);
      });
      if (sequence.length !== points.length) continue;
      if (
        !props.connections?.length &&
        !props.connectStart &&
        !props.connectEnd &&
        !sequence.some((n) => originalNodeIds.has(n.id))
      )
        warnings.push(
          `${props.name}: isolated path; explicitly connect an endpoint before routing to the existing network.`,
        );
      const gaps: [number, number][] = [];
      let lostRestriction = false;
      for (let i = 1; i < orderedOriginal.length; i++) {
        const a = orderedOriginal[i - 1],
          b = orderedOriginal[i];
        if (
          originalEdges.some(
            (e) =>
              (e.from === a.id && e.to === b.id) ||
              (e.from === b.id && e.to === a.id),
          )
        )
          continue;
        const start = sequence.findIndex((n) => n.id === a.id),
          end = sequence.findIndex((n) => n.id === b.id);
        if (start < 0 || end < 0 || end < start) lostRestriction = true;
        else gaps.push([start, end]);
      }
      if (lostRestriction)
        errors.push(
          `${props.name}: retain the vertices on either side of a restricted gate gap.`,
        );
      for (let i = 1; i < sequence.length; i++) {
        if (lostRestriction || gaps.some(([a, b]) => i > a && i <= b)) continue;
        const a = sequence[i - 1],
          b = sequence[i],
          length = distance(a.coordinates, b.coordinates);
        if (length < 0.2) {
          errors.push(`${props.name}: duplicate adjacent path vertices.`);
          continue;
        }
        const positions = new Map(sequence.map((n, index) => [n.id, index]));
        const inherited = originalEdges.filter((e) => {
          const start = positions.get(e.from),
            end = positions.get(e.to);
          return (
            start !== undefined &&
            end !== undefined &&
            Math.min(start, end) < i &&
            Math.max(start, end) >= i
          );
        });
        // Deleting an ordinary intermediate vertex inherits restrictions/closures from that original span.
        if (!inherited.length && originalEdges.length) {
          const left = sequence
            .slice(0, i)
            .reverse()
            .find((n) => originalNodeIds.has(n.id));
          const right = sequence
            .slice(i)
            .find((n) => originalNodeIds.has(n.id));
          const lo = orderedOriginal.findIndex((n) => n.id === left?.id),
            hi = orderedOriginal.findIndex((n) => n.id === right?.id);
          if (lo >= 0 && hi >= lo)
            inherited.push(
              ...originalEdges.filter((e) => {
                const f = orderedOriginal.findIndex((n) => n.id === e.from),
                  t = orderedOriginal.findIndex((n) => n.id === e.to);
                return f >= lo && f <= hi && t >= lo && t <= hi;
              }),
            );
        }
        for (const [from, to] of (props.footDirection ||
          pathProperties.footDirection) === 'forward'
          ? [[a, b]]
          : props.footDirection === 'reverse'
            ? [[b, a]]
            : [
                [a, b],
                [b, a],
              ]) {
          // Replacing an unchanged-direction section retains each original directed span.
          const directionChanged = props.footDirection !== undefined && props.footDirection !== (originalFeature?.properties?.footDirection || 'both');
          if (!directionChanged && inherited.length) {
            const wanted = from.id === a.id ? 1 : -1;
            const permitted = inherited.some(e => {
              const f = orderedOriginal.findIndex(n=>n.id===e.from), t = orderedOriginal.findIndex(n=>n.id===e.to);
              return f >= 0 && t >= 0 && Math.sign(t-f) === wanted;
            });
            if (!permitted) continue;
          }
          data.graph.edges.push({
            ...inherited[0],
            parentEdgeIds: [
              ...new Set(
                inherited.flatMap((e) => [e.id, ...(e.parentEdgeIds || [])]),
              ),
            ],
            id: `${edit.id}:${from.id}>${to.id}`,
            from: from.id,
            to: to.id,
            distance: length,
            name: String(props.name),
            accessible:
              (access === 'yes' || access === 'campus') &&
              (changedAccess || inherited.every((e) => e.accessible)),
            walkingAccess:
              !changedAccess && inherited.some((e) => !e.accessible)
                ? inherited.find((e) => !e.accessible)?.walkingAccess ||
                  'private'
                : access,
            steps:
              props.steps === undefined
                ? inherited.some((e) => e.steps)
                : !!props.steps,
            sourceId: edit.id,
          });
        }
      }
      data.map.features.push({
        type: 'Feature',
        id: edit.id,
        properties: { ...pathProperties, vertexIds: sequence.map((n) => n.id) },
        geometry: {
          type: 'LineString',
          coordinates: sequence.map((n) => n.coordinates),
        },
      });
    } else if (edit.kind === 'building') {
      const original = data.map.features.find(
        (f) =>
          f.properties?.id === edit.id && f.properties?.kind === 'building',
      );
      data.map.features = data.map.features.filter(
        (f) => f.properties?.id !== edit.id,
      );
      if (!edit.deleted)
        data.map.features.push({
          type: 'Feature',
          id: edit.id,
          geometry: edit.geometry,
          properties: {
            id: edit.id,
            ...original?.properties,
            kind: 'building',
            name: props.name,
            height:
              props.heightMode === 'floors'
                ? Number(props.floors) * 3
                : Number(props.height) || 0,
            floors: props.floors,
            heightMode: props.heightMode,
            heightSource: props.heightSource,
            heightEstimated:
              props.heightMode === 'floors' || !!props.heightEstimated,
            source: 'campus-review',
          },
        });
    } else if (edit.kind === 'entrance' && edit.geometry.type === 'Point') {
      data.entrances = data.entrances.filter((e) => e.id !== edit.id);
      if (edit.deleted) continue;
      const coordinates = edit.geometry.coordinates as Position;
      const placeId = String(props.placeId || '');
      const target = props.connection;
      const linked = target
        ? resolveConnection(data, nodes, target)
        : nodes.get(canonical(String(props.connectTo || '')));
      const node = linked && nodes.get(canonical(linked.id));
      // Typed connections use the exact entrance position. Legacy corrections retain their documented 5 m tolerance.
      const valid =
        node && distance(node.coordinates, coordinates) <= (target ? 0.2 : 5);
      const entrance = {
        id: edit.id,
        name: String(props.name),
        placeId,
        coordinates,
        buildingId: props.buildingId ? String(props.buildingId) : undefined,
        walkingAccess: (props.access || 'yes') as WalkingAccess,
        source: 'campus-review',
        graphNode: valid ? node.id : undefined,
      };
      data.entrances.push(entrance);
      if (!data.places.some((p) => p.id === placeId))
        errors.push(`${edit.id}: choose the place served by this entrance.`);
      if (!valid)
        errors.push(
          `${edit.id}: entrance needs a connected path at its position (legacy connections must be within 5 m).`,
        );
    } else if (edit.kind === 'barrier' || edit.kind === 'closure') {
      const edgeIds = Array.isArray(props.edgeIds)
        ? props.edgeIds.filter((id): id is string => typeof id === 'string')
        : [];
      const missing = edgeIds.filter(
        (id) => !data.graph.edges.some((e) => edgeMatches(e, id)),
      );
      if (!edit.deleted && (!edgeIds.length || missing.length))
        errors.push(`${props.name}: select existing path segments to block.`);
      const bothDirections = new Set(
        data.graph.edges
          .filter((e) => edgeIds.some((id) => edgeMatches(e, id)))
          .map((e) => e.id),
      );
      for (const edge of data.graph.edges.filter((e) =>
        bothDirections.has(e.id),
      ))
        for (const reverse of data.graph.edges.filter(
          (e) => e.from === edge.to && e.to === edge.from,
        ))
          bothDirections.add(reverse.id);
      data.closures = data.closures.filter((c) => c.id !== edit.id);
      if (!edit.deleted)
        data.closures.push({
          id: edit.id,
          edgeIds: [...bothDirections],
          reason: String(props.name),
          expectedReopening: props.expectedReopening
            ? String(props.expectedReopening)
            : undefined,
          reopenedAt: props.reopenedAt ? String(props.reopenedAt) : undefined,
        });
    }
  }
  connectPaths();
  remapClosures(data, errors);
  const connected = new Set(data.graph.edges.flatMap((e) => [e.from, e.to]));
  data.graph.nodes = [...nodes.values()].filter((n) => connected.has(n.id));
  for (const place of data.places) {
    if (place.graphNode && !connected.has(place.graphNode)) {
      delete place.graphNode;
      place.arrivalKind = 'unmapped';
      warnings.push(`${place.name}: its old walking connection was removed.`);
    }
  }
  const ids = new Set<string>();
  const blockedGeometry = cachedGeometryBlocker(data.map);
  for (const edge of data.graph.edges) {
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    if (a && b) {
      edge.geometryBlocked = blockedGeometry(
        a.coordinates,
        b.coordinates,
      );
      if (edge.geometryBlocked)
        warnings.push(
          `${edge.sourceId}: segment excluded because it crosses a mapped ${edge.geometryBlocked.split(':')[0]}.`,
        );
    }
    if (ids.has(edge.id)) errors.push(`Duplicate edge ${edge.id}`);
    ids.add(edge.id);
    if (!nodes.has(edge.from) || !nodes.has(edge.to))
      errors.push(`Path ${edge.id} has a missing endpoint.`);
    if (!(edge.distance > 0) || !Number.isFinite(edge.distance))
      errors.push(`Path ${edge.id} has an invalid length.`);
  }
  const adjacency = new Map<string, string[]>();
  const blocked = new Set(
    data.closures.filter((c) => !c.reopenedAt).flatMap((c) => c.edgeIds),
  );
  for (const e of data.graph.edges.filter(
    (e) => e.accessible && !e.geometryBlocked && !blocked.has(e.id),
  )) {
    adjacency.set(e.from, [...(adjacency.get(e.from) || []), e.to]);
    adjacency.set(e.to, [...(adjacency.get(e.to) || []), e.from]);
  }
  for (const entrance of data.entrances) {
    if (!data.places.some((p) => p.id === entrance.placeId))
      errors.push(`${entrance.id}: its place was removed.`);
    if (entrance.graphNode) entrance.graphNode = canonical(entrance.graphNode);
    if (entrance.graphNode && !connected.has(entrance.graphNode)) {
      delete entrance.graphNode;
      errors.push(`${entrance.id}: its connecting path was removed.`);
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
  return {
    data,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}
