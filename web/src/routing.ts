import { bearing, distance } from "./geo";
import { geometryBlocker } from './spatial';
import type {
  CampusData,
  GraphEdge,
  Maneuver,
  ManeuverKind,
  Position,
  Route,
  RoutingGraph,
} from "./types";

export class RoutingError extends Error {}
export function nearestNode(graph: RoutingGraph, coordinates: Position, limit = 90) {
  let nearest: { id: string; distance: number } | undefined;
  const connected=new Set(graph.edges.filter(e=>e.accessible&&!e.geometryBlocked).flatMap(e=>[e.from,e.to]));
  for (const node of graph.nodes) {
    if(!connected.has(node.id))continue;
    const d = distance(coordinates, node.coordinates);
    if (d <= limit && (!nearest || d < nearest.distance)) nearest = { id: node.id, distance: d };
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
    let current = "",
      score = Infinity;
    for (const candidate of open) {
      const f =
        costs.get(candidate)! +
        distance(nodes.get(candidate)!.coordinates, nodes.get(end)!.coordinates);
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
      const score = costs.get(current)! + edge.distance * (penalty.get(edge.id) || 1);
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
  if (Math.abs(d) > 150) return "uturn";
  if (Math.abs(d) < 28) return "straight";
  if (Math.abs(d) < 55) return d > 0 ? "slight-right" : "slight-left";
  return d > 0 ? "right" : "left";
}
const instructions: Record<ManeuverKind, string> = {
  depart: "Start walking",
  left: "Turn left",
  right: "Turn right",
  "slight-left": "Bear left",
  "slight-right": "Bear right",
  uturn: "Turn around",
  straight: "Continue straight",
  arrive: "You have reached the mapped destination",
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
      kind: "depart",
      instruction: `${instructions.depart}${edges[0] ? " along " + edges[0].name : ""}`,
      at: 0,
      coordinates: coordinates[0],
      street: edges[0]?.name || "",
    },
  ];
  let along = 0;
  for (let i = 1; i < coordinates.length - 1; i++) {
    along += edges[i - 1].distance;
    // Bearings use a roughly 12m lookahead/lookbehind to suppress tiny geometry bends.
    let before = i - 1,
      after = i + 1;
    while (before > 0 && distance(coordinates[before], coordinates[i]) < 10) before--;
    while (after < coordinates.length - 1 && distance(coordinates[after], coordinates[i]) < 10)
      after++;
    const kind = turnKind(
      bearing(coordinates[i], coordinates[after]) - bearing(coordinates[before], coordinates[i]),
    );
    if (kind !== "straight" && along - maneuvers[maneuvers.length - 1].at >= 10)
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
    kind: "arrive",
    instruction: instructions.arrive,
    at: total,
    coordinates: coordinates.at(-1)!,
    street: "",
  });
  return {
    id: edges.map((e) => e.id).join("|") || start,
    nodeIds,
    edgeIds: edges.map((e) => e.id),
    coordinates,
    distance: total,
    seconds: total / 1.25,
    maneuvers,
    startOffset,
  };
}
export function findRoutes(
  data: CampusData,
  origin: Position | string,
  destination: string,
): Route[] {
  const nodeMap=new Map(data.graph.nodes.map(n=>[n.id,n.coordinates]));
  const blocked = new Set(data.closures.filter((c) => !c.reopenedAt).flatMap((c) => c.edgeIds));
  for(const edge of data.graph.edges){if(edge.geometryBlocked||geometryBlocker(nodeMap.get(edge.from)!,nodeMap.get(edge.to)!,data.map))blocked.add(edge.id);}
  const usableGraph={...data.graph,edges:data.graph.edges.filter(e=>!blocked.has(e.id))};
  const start =
    typeof origin === "string" ? { id: origin, distance: 0 } : nearestNode(usableGraph, origin, 45);
  if (!start)
    throw new RoutingError(
      "Your start is too far from a mapped campus path. Choose a mapped starting place.",
    );
  if (!data.graph.nodes.some((n) => n.id === destination))
    throw new RoutingError("This destination has no mapped walking connection yet.");
  const base = aStar(data.graph, start.id, destination, blocked);
  if (!base)
    throw new RoutingError(
      "No connected walking route is available. A path may be closed or missing from the map.",
    );
  const routes = [makeRoute(data.graph, base, start.id, start.distance)];
  const penalties = new Map<string, number>();
  // Bounded attempts avoid expensive all-path enumeration. Accept only substantial,
  // loop-free alternatives with at most 60% extra walking distance.
  for (let attempt = 0; attempt < 4 && routes.length < 3 && base.length; attempt++) {
    const previous = routes.at(-1)!;
    previous.edgeIds.forEach((id) => penalties.set(id, (penalties.get(id) || 1) + 1));
    const candidate = aStar(data.graph, start.id, destination, blocked, penalties);
    if (!candidate) break;
    const route = makeRoute(data.graph, candidate, start.id, start.distance);
    const substantial = routes.every((existing) => {
      const ids = new Set(existing.edgeIds);
      return (
        candidate.filter((e) => ids.has(e.id)).reduce((sum, e) => sum + e.distance, 0) /
          (route.distance || 1) <
        0.8
      );
    });
    if (
      substantial &&
      route.distance <= routes[0].distance * 1.6 &&
      new Set(route.nodeIds).size === route.nodeIds.length
    )
      routes.push(route);
  }
  return routes.sort((a, b) => a.distance - b.distance);
}
