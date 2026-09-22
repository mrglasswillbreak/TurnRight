import { bearing, distance } from './geo';
import { cachedGeometryBlocker } from './spatial';
import { resolvePlaceId } from './map-display';
import type {
  CampusData,
  GraphEdge,
  Maneuver,
  ManeuverKind,
  Position,
  Route,
  RoutingGraph,
  RouteEndpoint,
  RouteOrigin,
  Place,
} from './types';

export class RoutingError extends Error {}
export function nearestNode(
  graph: RoutingGraph,
  coordinates: Position,
  limit = 90,
) {
  let nearest: { id: string; distance: number } | undefined;
  const connected = new Set(
    graph.edges
      .filter((e) => e.accessible && !e.geometryBlocked)
      .flatMap((e) => [e.from, e.to]),
  );
  for (const node of graph.nodes) {
    if (!connected.has(node.id)) continue;
    const d = distance(coordinates, node.coordinates);
    if (d <= limit && (!nearest || d < nearest.distance))
      nearest = { id: node.id, distance: d };
  }
  return nearest;
}
function aStar(
  graph: RoutingGraph,
  start: string,
  end: string,
  blocked: Set<string>,
  penalty = new Map<string, number>(),
) {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) {
    if (edge.accessible && !edge.geometryBlocked && !blocked.has(edge.id))
      adjacency.set(edge.from, [...(adjacency.get(edge.from) || []), edge]);
  }
  if (!nodes.has(start) || !nodes.has(end)) return null;
  const open = new Set([start]),
    costs = new Map([[start, 0]]),
    parents = new Map<string, GraphEdge>();
  while (open.size) {
    let current = '',
      score = Infinity;
    for (const candidate of open) {
      const f =
        costs.get(candidate)! +
        distance(
          nodes.get(candidate)!.coordinates,
          nodes.get(end)!.coordinates,
        );
      if (f < score) {
        score = f;
        current = candidate;
      }
    }
    if (current === end) {
      const edges: GraphEdge[] = [];
      while (current !== start) {
        const edge = parents.get(current)!;
        edges.unshift(edge);
        current = edge.from;
      }
      return edges;
    }
    open.delete(current);
    for (const edge of adjacency.get(current) || []) {
      const score =
        costs.get(current)! + edge.distance * (penalty.get(edge.id) || 1);
      if (score < (costs.get(edge.to) ?? Infinity)) {
        costs.set(edge.to, score);
        parents.set(edge.to, edge);
        open.add(edge.to);
      }
    }
  }
  return null;
}
export function turnKind(delta: number): ManeuverKind {
  const d = ((delta + 540) % 360) - 180;
  if (Math.abs(d) > 150) return 'uturn';
  if (Math.abs(d) < 28) return 'straight';
  if (Math.abs(d) < 55) return d > 0 ? 'slight-right' : 'slight-left';
  return d > 0 ? 'right' : 'left';
}
const instructions: Record<ManeuverKind, string> = {
  depart: 'Start walking',
  left: 'Turn left',
  right: 'Turn right',
  'slight-left': 'Bear left',
  'slight-right': 'Bear right',
  uturn: 'Turn around',
  straight: 'Continue straight',
  arrive: 'You have reached the mapped destination',
};
export function makeRoute(
  graph: RoutingGraph,
  edges: GraphEdge[],
  start: string,
  startOffset = 0,
): Route {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const nodeIds = [start, ...edges.map((e) => e.to)];
  const coordinates = nodeIds.map((id) => nodes.get(id)!.coordinates);
  const maneuvers: Maneuver[] = [
    {
      kind: 'depart',
      instruction: `${instructions.depart}${edges[0] ? ' along ' + edges[0].name : ''}`,
      at: 0,
      coordinates: coordinates[0],
      street: edges[0]?.name || '',
    },
  ];
  let along = 0;
  for (let i = 1; i < coordinates.length - 1; i++) {
    along += edges[i - 1].distance;
    // Bearings use a roughly 12m lookahead/lookbehind to suppress tiny geometry bends.
    let before = i - 1,
      after = i + 1;
    while (before > 0 && distance(coordinates[before], coordinates[i]) < 10)
      before--;
    while (
      after < coordinates.length - 1 &&
      distance(coordinates[after], coordinates[i]) < 10
    )
      after++;
    const kind = turnKind(
      bearing(coordinates[i], coordinates[after]) -
        bearing(coordinates[before], coordinates[i]),
    );
    if (kind !== 'straight' && along - maneuvers[maneuvers.length - 1].at >= 10)
      maneuvers.push({
        kind,
        instruction: `${instructions[kind]} onto ${edges[i].name}`,
        at: along,
        coordinates: coordinates[i],
        street: edges[i].name,
      });
  }
  const total = edges.reduce((sum, edge) => sum + edge.distance, 0);
  maneuvers.push({
    kind: 'arrive',
    instruction: instructions.arrive,
    at: total,
    coordinates: coordinates.at(-1)!,
    street: '',
  });
  return {
    id: edges.map((e) => e.id).join('|') || start,
    nodeIds,
    edgeIds: edges.map((e) => e.id),
    coordinates,
    mode: 'walking',
    distance: total,
    seconds: total / 1.25,
    maneuvers,
    startOffset,
  };
}
export function placeHasConnection(data: CampusData, place: Place): boolean {
  const entrances = data.entrances?.filter((e) => e.placeId === place.id) || [];
  return entrances.length
    ? entrances.some(
        (e) => e.graphNode && ['yes', 'campus'].includes(e.walkingAccess),
      )
    : !!place.graphNode;
}
interface EndpointNode {
  id: string;
  distance: number;
  entranceId?: string;
  arrivalKind?: Place['arrivalKind'];
  approachDistance?: number;
}
function endpointNodes(
  data: CampusData,
  endpoint: RouteEndpoint,
): EndpointNode[] {
  if (typeof endpoint === 'string') return [{ id: endpoint, distance: 0 }];
  const place = data.places.find(
    (p) => p.id === resolvePlaceId(data, endpoint.placeId),
  );
  if (!place) return [];
  const entrances = data.entrances?.filter((e) => e.placeId === place.id) || [];
  if (entrances.length)
    return entrances
      .filter((e) => e.graphNode && ['yes', 'campus'].includes(e.walkingAccess))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((e) => ({
        id: e.graphNode!,
        distance: 0,
        entranceId: e.id,
        arrivalKind: 'entrance',
      }));
  return place.graphNode
    ? [
        {
          id: place.graphNode,
          distance: 0,
          arrivalKind: place.arrivalKind,
          approachDistance: place.approachDistance,
        },
      ]
    : [];
}
export function findRoutes(
  data: CampusData,
  origin: RouteOrigin,
  destination: RouteEndpoint,
): Route[] {
  const nodeMap = new Map(data.graph.nodes.map((n) => [n.id, n.coordinates]));
  const blocked = new Set(
    data.closures
      .filter((c) => !c.reopenedAt && (!c.modes || c.modes.includes('walking')))
      .flatMap((c) => c.edgeIds),
  );
  const geometryBlocked = cachedGeometryBlocker(data.map);
  for (const edge of data.graph.edges) {
    const a = nodeMap.get(edge.from),
      b = nodeMap.get(edge.to);
    if (!a || !b || edge.geometryBlocked || geometryBlocked(a, b))
      blocked.add(edge.id);
  }
  const usableGraph = {
    ...data.graph,
    edges: data.graph.edges.filter((e) => !blocked.has(e.id)),
  };
  const nearest = Array.isArray(origin)
    ? nearestNode(usableGraph, origin, 45)
    : undefined;
  const starts: EndpointNode[] = Array.isArray(origin)
    ? nearest
      ? [nearest]
      : []
    : endpointNodes(data, origin);
  const ends = endpointNodes(data, destination).filter((e) =>
    nodeMap.has(e.id),
  );
  if (!starts.length)
    throw new RoutingError(
      'Your start is too far from a mapped campus path or has no available entrance. Choose a mapped starting place.',
    );
  if (!ends.length)
    throw new RoutingError(
      'This destination has no available mapped walking connection yet.',
    );
  const candidates: Route[] = [];
  for (const start of starts)
    for (const end of ends) {
      const penalties = new Map<string, number>();
      for (let attempt = 0; attempt < 5; attempt++) {
        const edges = aStar(usableGraph, start.id, end.id, blocked, penalties);
        if (!edges) break;
        const route = makeRoute(data.graph, edges, start.id, start.distance);
        route.originEntranceId = start.entranceId;
        route.destinationEntranceId = end.entranceId;
        route.arrivalKind = end.arrivalKind;
        route.approachDistance = end.approachDistance;
        if (!candidates.some((r) => r.id === route.id)) candidates.push(route);
        if (!edges.length) break;
        edges.forEach((e) =>
          penalties.set(e.id, (penalties.get(e.id) || 1) + 1),
        );
      }
    }
  candidates.sort(
    (a, b) => a.distance - b.distance || a.id.localeCompare(b.id),
  );
  if (!candidates.length)
    throw new RoutingError(
      'No connected walking route is available. A path may be closed or missing from the map.',
    );
  const routes = [candidates[0]];
  const edgeLengths = new Map(data.graph.edges.map((e) => [e.id, e.distance]));
  for (const candidate of candidates.slice(1)) {
    if (routes.length === 3) break;
    if (
      candidate.distance > routes[0].distance * 1.6 ||
      new Set(candidate.nodeIds).size !== candidate.nodeIds.length
    )
      continue;
    if (
      routes.every((r) => {
        const ids = new Set(r.edgeIds);
        return (
          candidate.edgeIds
            .filter((id) => ids.has(id))
            .reduce((sum, id) => sum + (edgeLengths.get(id) || 0), 0) /
            (candidate.distance || 1) <
          0.8
        );
      })
    )
      routes.push(candidate);
  }
  return routes;
}
