import { distance, projectSegment } from './geo.js';
import type {
  CampusData,
  ConnectionTarget,
  GraphNode,
  MapEdit,
  Position,
} from './types.js';

export const edgeMatches = (
  edge: CampusData['graph']['edges'][number],
  id: string,
) => edge.id === id || !!edge.parentEdgeIds?.includes(id);

/** Splits only an existing graph segment, never the decorative line across a gate gap. */
export function resolveConnection(
  data: CampusData,
  nodes: Map<string, GraphNode>,
  target: ConnectionTarget,
): GraphNode | undefined {
  if (target.type === 'node') {
    const node = nodes.get(target.nodeId);
    return node && distance(node.coordinates, target.coordinates) < 0.2
      ? node
      : undefined;
  }
  const a = nodes.get(target.from),
    b = nodes.get(target.to);
  if (
    !a ||
    !b ||
    projectSegment(target.coordinates, a.coordinates, b.coordinates).distance >
      0.2
  )
    return;
  const edge = data.graph.edges.find((e) => {
    if (e.sourceId !== target.sourceId) return false;
    const from = nodes.get(e.from),
      to = nodes.get(e.to);
    if (!from || !to) return false;
    return (
      projectSegment(from.coordinates, a.coordinates, b.coordinates).distance <
        0.2 &&
      projectSegment(to.coordinates, a.coordinates, b.coordinates).distance <
        0.2 &&
      projectSegment(target.coordinates, from.coordinates, to.coordinates)
        .distance < 0.2
    );
  });
  if (!edge) return;
  const from = nodes.get(edge.from)!,
    to = nodes.get(edge.to)!;
  if (distance(from.coordinates, target.coordinates) < 0.2) return from;
  if (distance(to.coordinates, target.coordinates) < 0.2) return to;
  const node: GraphNode = {
    id: `${target.sourceId}:join:${[target.from, target.to].sort().join('~')}:${target.coordinates.map((n) => n.toFixed(7)).join(':')}`,
    coordinates: target.coordinates,
  };
  nodes.set(node.id, node);
  data.graph.edges = data.graph.edges.flatMap((e) => {
    if (
      e.sourceId !== target.sourceId ||
      !(
        (e.from === edge.from && e.to === edge.to) ||
        (e.from === edge.to && e.to === edge.from)
      )
    )
      return [e];
    return [
      [e.from, node.id],
      [node.id, e.to],
    ].map(([start, end]) => ({
      ...e,
      id: `${e.id}:split:${start}>${end}`,
      from: start,
      to: end,
      parentEdgeIds: [...new Set([e.id, ...(e.parentEdgeIds || [])])],
      distance: distance(
        nodes.get(start)!.coordinates,
        nodes.get(end)!.coordinates,
      ),
    }));
  });
  return node;
}

export function applyConnections(
  data: CampusData,
  nodes: Map<string, GraphNode>,
  edits: MapEdit[],
  errors: string[],
) {
  const aliases = new Map<string, string>();
  const canonical = (id: string): string =>
    aliases.has(id) ? canonical(aliases.get(id)!) : id;
  const pending = edits
    .filter((e) => e.kind === 'path' && !e.deleted)
    .flatMap((edit) => {
      const feature = data.map.features.find(
        (f) => f.properties?.id === edit.id && f.properties?.kind === 'path',
      );
      const ids: string[] = feature?.properties?.vertexIds || [];
      const connections = [...(edit.properties.connections || [])];
      for (const [index, key] of [
        [0, 'connectStart'],
        [ids.length - 1, 'connectEnd'],
      ] as const) {
        const id = edit.properties[key];
        const node = typeof id === 'string' && nodes.get(id);
        if (node)
          connections.push({
            vertexId: ids[index],
            target: {
              type: 'node',
              nodeId: node.id,
              coordinates: node.coordinates,
            },
          });
        else if (id)
          errors.push(
            `${edit.id}: the chosen connection must be within 5 m of an existing path node.`,
          );
      }
      return connections.map((connection) => ({ edit, ...connection }));
    })
    .sort((a, b) =>
      `${a.edit.id}:${a.vertexId}`.localeCompare(`${b.edit.id}:${b.vertexId}`),
    );
  // Resolve references to newly created junctions in subsequent passes.
  while (pending.length) {
    let progressed = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const { vertexId, target } = pending[i];
      const from = nodes.get(canonical(vertexId));
      const resolved = resolveConnection(data, nodes, target);
      const to = resolved && nodes.get(canonical(resolved.id));
      if (!from || !to || distance(from.coordinates, to.coordinates) > 5)
        continue;
      if (from.id !== to.id) {
        aliases.set(from.id, to.id);
        // Keep aliases during assembly so references to new path vertices remain valid.
        nodes.set(from.id, { ...to, id: from.id });
        data.graph.edges = data.graph.edges.map((e) => ({
          ...e,
          from: canonical(e.from),
          to: canonical(e.to),
          distance: distance(
            nodes.get(canonical(e.from))!.coordinates,
            nodes.get(canonical(e.to))!.coordinates,
          ),
        }));
      }
      pending.splice(i, 1);
      progressed = true;
    }
    if (!progressed) break;
  }
  for (const { edit } of pending)
    errors.push(
      `${edit.id}: connection target changed or is not within 5 m. Reconnect the highlighted endpoint.`,
    );
  for (const feature of data.map.features) {
    const ids = feature.properties?.vertexIds as string[] | undefined;
    if (
      feature.geometry.type === 'LineString' &&
      ids?.length === feature.geometry.coordinates.length
    ) {
      feature.geometry.coordinates = ids.map(
        (id, i) =>
          nodes.get(canonical(id))?.coordinates ||
          (feature.geometry.type === 'LineString' &&
            feature.geometry.coordinates[i]) || [0, 0],
      );
      feature.properties!.vertexIds = ids.map(canonical);
    }
  }
  return canonical;
}

export function remapClosures(data: CampusData, errors: string[]) {
  for (const closure of data.closures) {
    const expanded = closure.edgeIds.flatMap((id) => {
      const descendants = data.graph.edges.filter((edge) =>
        edgeMatches(edge, id),
      );
      if (!descendants.length && !closure.reopenedAt)
        errors.push(
          `${closure.reason}: a closed segment was removed. Review this closure.`,
        );
      return descendants.map((e) => e.id);
    });
    closure.edgeIds = [...new Set(expanded)];
  }
}

/** Original graph order, including absent segments at access barriers. */
export function orderedPathNodes(data: CampusData, id: string): GraphNode[] {
  const feature = data.map.features.find(
    (f) => f.properties?.id === id && f.geometry.type === 'LineString',
  );
  const edges = data.graph.edges.filter((e) => e.sourceId === id);
  const used = new Set(edges.flatMap((e) => [e.from, e.to]));
  const nodes = data.graph.nodes.filter((n) => used.has(n.id));
  if (!feature || feature.geometry.type !== 'LineString') return nodes;
  const points = feature.geometry.coordinates as Position[];
  const along = (node: GraphNode) => {
    let best = Infinity,
      result = 0;
    for (let i = 1; i < points.length; i++) {
      const p = projectSegment(node.coordinates, points[i - 1], points[i]);
      if (p.distance < best) {
        best = p.distance;
        result = i - 1 + p.t;
      }
    }
    return result;
  };
  return nodes.sort((a, b) => along(a) - along(b));
}
