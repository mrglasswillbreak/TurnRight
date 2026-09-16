import { distance, projectSegment } from './geo.js';
import { BoundsIndex, boundsOf, nearbyBounds } from './spatial-index.js';
import { cachedGeometryBlocker } from './spatial.js';
import type { CampusData, GraphEdge, GraphNode, Position } from './types.js';

// Only absorb coordinate rounding (2 cm), never bridge a missing walking section.
const tolerance = 0.02;
export function canonicalNode(
  aliases: Map<string, string>,
  id: string,
): string {
  const next = aliases.get(id);
  if (!next) return id;
  const result = canonicalNode(aliases, next);
  aliases.set(id, result);
  return result;
}

function crossingLevel(properties: Record<string, unknown> = {}) {
  const tags = {
    ...(properties.sourceTags && typeof properties.sourceTags === 'object'
      ? (properties.sourceTags as Record<string, unknown>)
      : {}),
    ...Object.fromEntries(
      Object.entries(properties).filter(([, value]) => value !== undefined),
    ),
  };
  const enabled = (value: unknown) =>
    value !== undefined && !['no', 'false', '0', ''].includes(String(value));
  const override =
    properties.crossingLevel === 'source'
      ? undefined
      : properties.crossingLevel;
  const bridge = override ? override === 'bridge' : enabled(tags.bridge);
  const tunnel = override ? override === 'tunnel' : enabled(tags.tunnel);
  const layer = Number(
    override
      ? bridge
        ? 1
        : tunnel
          ? -1
          : 0
      : (tags.layer ?? (bridge ? 1 : tunnel ? -1 : 0)),
  );
  return `${layer}:${override ? '' : String(tags.level ?? '')}:${bridge ? 'bridge' : tunnel ? 'tunnel' : 'ground'}`;
}

/** Restore separate path identities before re-evaluating automatic connections. */
export function restoreCrossingPaths(data: CampusData) {
  const nodes = new Map(data.graph.nodes.map((node) => [node.id, node]));
  data.graph.edges = data.graph.edges.map((edge) => {
    if (!edge.crossingEndpoints) return edge;
    const {
      crossingEndpoints: { from, to },
      ...original
    } = edge;
    nodes.set(from.id, structuredClone(from));
    nodes.set(to.id, structuredClone(to));
    return {
      ...original,
      from: from.id,
      to: to.id,
      distance: distance(from.coordinates, to.coordinates),
    };
  });
  data.graph.nodes = [...nodes.values()];
  for (const destination of [...data.places, ...(data.entrances || [])]) {
    if (!destination.crossingGraphNode) continue;
    destination.graphNode = destination.crossingGraphNode;
    delete destination.crossingGraphNode;
  }
}

/** Path-local identities let editing or disabling crossings undo derived joins. */
export function pathNodes(data: CampusData, sourceId: string): GraphNode[] {
  const graphNodes = new Map(data.graph.nodes.map((n) => [n.id, n]));
  const nodes = new Map<string, GraphNode>();
  for (const edge of data.graph.edges.filter((e) => e.sourceId === sourceId))
    for (const end of ['from', 'to'] as const) {
      const node = edge.crossingEndpoints?.[end] || graphNodes.get(edge[end]);
      if (node) nodes.set(node.id, node);
    }
  return [...nodes.values()];
}

/** All proper crossings, touching endpoints and collinear overlap boundaries. */
function intersections(a: Position, b: Position, c: Position, d: Position) {
  const points: Position[] = [];
  for (const [point, start, end] of [
    [a, c, d],
    [b, c, d],
    [c, a, b],
    [d, a, b],
  ])
    if (projectSegment(point, start, end).distance <= tolerance)
      points.push(point);
  const x = b[0] - a[0],
    y = b[1] - a[1];
  const u = d[0] - c[0],
    v = d[1] - c[1];
  const denominator = x * v - y * u;
  if (Math.abs(denominator) > 1e-12 * Math.hypot(x, y) * Math.hypot(u, v)) {
    const t = ((c[0] - a[0]) * v - (c[1] - a[1]) * u) / denominator;
    const s = ((c[0] - a[0]) * y - (c[1] - a[1]) * x) / denominator;
    if (t >= 0 && t <= 1 && s >= 0 && s <= 1)
      points.push([a[0] + t * x, a[1] + t * y]);
  }
  return points;
}

interface Segment {
  key: string;
  from: GraphNode;
  to: GraphNode;
  level: string;
  cuts: Set<string>;
}

/** Normalize existing graph geometry; absent gate spans are never reconstructed. */
export function connectCrossingPaths(
  data: CampusData,
  nodes: Map<string, GraphNode>,
  aliases = new Map<string, string>(),
) {
  const canonical = (id: string) => canonicalNode(aliases, id);
  const properties = new Map(
    data.map.features
      .filter((f) => f.properties?.kind === 'path')
      .map((f) => [String(f.properties!.id), f.properties!]),
  );
  const blocked = cachedGeometryBlocker(data.map);
  const segments = new Map<string, Segment>();
  const edgeSegments = new Map<string, Segment>();
  for (const edge of [...data.graph.edges].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const from = nodes.get(canonical(edge.from)),
      to = nodes.get(canonical(edge.to));
    if (
      !from ||
      !to ||
      from.id === to.id ||
      properties.get(edge.sourceId)?.autoConnectCrossings === false ||
      edge.geometryBlocked ||
      blocked(from.coordinates, to.coordinates)
    )
      continue;
    const level = crossingLevel(properties.get(edge.sourceId));
    const ids = [from.id, to.id].sort();
    const key = JSON.stringify([level, ...ids]);
    let segment = segments.get(key);
    if (!segment) {
      segment = {
        key,
        from: nodes.get(ids[0])!,
        to: nodes.get(ids[1])!,
        level,
        cuts: new Set(ids),
      };
      segments.set(key, segment);
    }
    edgeSegments.set(edge.id, segment);
  }
  const index = new BoundsIndex<Segment>();
  const junctions = new BoundsIndex<{ id: string; level: string }>();
  const prefer = (a: string, b: string) => {
    // Keep source node metadata (e.g. a reviewed gate) on the surviving junction.
    const rank = (id: string) =>
      nodes.get(id)?.sourceTags
        ? 0
        : id.startsWith('crossing-path:')
          ? 3
          : id.startsWith('crossing:')
            ? 2
            : 1;
    return rank(a) - rank(b) || a.localeCompare(b);
  };
  const merge = (a: string, b: string) => {
    const ids = [canonical(a), canonical(b)].sort(prefer);
    if (ids[0] !== ids[1]) aliases.set(ids[1], ids[0]);
    return ids[0];
  };
  for (const segment of segments.values()) {
    const bounds = boundsOf([segment.from.coordinates, segment.to.coordinates]);
    const margin = nearbyBounds(segment.from.coordinates, tolerance);
    const dx = margin[2] - segment.from.coordinates[0],
      dy = margin[3] - segment.from.coordinates[1];
    const padded: [number, number, number, number] = [
      bounds[0] - dx,
      bounds[1] - dy,
      bounds[2] + dx,
      bounds[3] + dy,
    ];
    for (const other of index.query(padded)) {
      if (segment.level !== other.level) continue;
      for (const point of intersections(
        segment.from.coordinates,
        segment.to.coordinates,
        other.from.coordinates,
        other.to.coordinates,
      )) {
        const endpoints = [segment.from, segment.to, other.from, other.to]
          .filter((node) => distance(node.coordinates, point) <= tolerance)
          .map((node) => canonical(node.id));
        const nearby = junctions
          .query(nearbyBounds(point, tolerance))
          .filter(
            (j) =>
              j.level === segment.level &&
              distance(nodes.get(canonical(j.id))!.coordinates, point) <=
                tolerance,
          )
          .map((j) => canonical(j.id));
        const candidates = [...new Set([...endpoints, ...nearby])].sort(prefer);
        let id = candidates.find(
          (candidate) => !candidate.startsWith('crossing-path:'),
        );
        if (!id) {
          id = `crossing:${segment.level}:${point.map((n) => n.toFixed(10)).join(':')}`;
          nodes.set(id, { id, coordinates: point });
        }
        for (const candidate of candidates) id = merge(id, candidate);
        segment.cuts.add(id);
        other.cuts.add(id);
        junctions.add(boundsOf([point]), { id, level: segment.level });
      }
    }
    index.add(padded, segment);
  }
  const edges: GraphEdge[] = [];
  const localEndpoint = (edge: GraphEdge, id: string): GraphNode => {
    if (id === canonical(edge.from))
      return edge.crossingEndpoints?.from || nodes.get(edge.from)!;
    if (id === canonical(edge.to))
      return edge.crossingEndpoints?.to || nodes.get(edge.to)!;
    const node = nodes.get(id)!;
    return {
      id: `crossing-path:${edge.sourceId}:${node.coordinates.map((n) => n.toFixed(10)).join(':')}`,
      coordinates: node.coordinates,
    };
  };
  for (const edge of data.graph.edges) {
    const segment = edgeSegments.get(edge.id);
    const from = canonical(edge.from),
      to = canonical(edge.to);
    const cuts = segment
      ? [...new Set([...segment.cuts].map(canonical))].sort(
          (a, b) =>
            projectSegment(
              nodes.get(a)!.coordinates,
              nodes.get(from)!.coordinates,
              nodes.get(to)!.coordinates,
            ).t -
            projectSegment(
              nodes.get(b)!.coordinates,
              nodes.get(from)!.coordinates,
              nodes.get(to)!.coordinates,
            ).t,
        )
      : [from, to];
    if (cuts.length === 2 && from === edge.from && to === edge.to) {
      edges.push(edge);
      continue;
    }
    for (let i = 1; i < cuts.length; i++) {
      const start = cuts[i - 1],
        end = cuts[i];
      if (start === end) continue;
      edges.push({
        ...edge,
        id: cuts.length > 2 ? `${edge.id}:cross:${i}` : edge.id,
        from: start,
        to: end,
        distance: distance(
          nodes.get(start)!.coordinates,
          nodes.get(end)!.coordinates,
        ),
        parentEdgeIds:
          cuts.length > 2
            ? [...new Set([edge.id, ...(edge.parentEdgeIds || [])])]
            : edge.parentEdgeIds,
        crossingEndpoints: {
          from: localEndpoint(edge, start),
          to: localEndpoint(edge, end),
        },
      });
    }
  }
  data.graph.edges = edges;
  for (const [id] of aliases) {
    const node = nodes.get(canonical(id));
    if (node) nodes.set(id, { ...node, id });
  }
  for (const destination of [...data.places, ...(data.entrances || [])]) {
    if (
      !destination.graphNode ||
      canonical(destination.graphNode) === destination.graphNode
    )
      continue;
    destination.crossingGraphNode ??= destination.graphNode;
    destination.graphNode = canonical(destination.graphNode);
  }
  return canonical;
}
