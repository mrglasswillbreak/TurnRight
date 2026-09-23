import { distance } from './geo';
import { findRoutes, makeRoute, RoutingError } from './routing';
import { cachedGeometryBlocker } from './spatial';
import type {
  CampusData,
  GraphEdge,
  Route,
  RouteEndpoint,
  RouteOrigin,
} from './types';

export { reviewed, vehiclePermitted } from './driving-data';
import { vehiclePermitted } from './driving-data';
export function edgeSeconds(edge: GraphEdge): number {
  const speed = edge.vehicle?.speedKph;
  return (
    edge.distance /
    ((speed && speed > 0 && speed <= 130
      ? speed
      : edge.vehicle?.parkingAisle
        ? 10
        : 20) /
      3.6)
  );
}
export function remainingSeconds(route: Route, progress: number): number {
  let remaining = route.seconds;
  for (let i = 1; i < route.coordinates.length && progress > 0; i++) {
    const length = distance(route.coordinates[i - 1], route.coordinates[i]);
    const seconds = route.segmentSeconds?.[i - 1] ?? length / 1.25;
    remaining -= seconds * Math.min(1, progress / Math.max(length, 0.001));
    progress -= length;
  }
  return Math.max(0, remaining);
}

/** Dijkstra state includes the incoming directed edge, so prohibited turns cannot
 * be bypassed by keeping a cheaper but incompatible arrival at a junction. */
function vehiclePath(
  data: CampusData,
  edges: GraphEdge[],
  start: string,
  end: string,
  penalty: Map<string, number>,
): GraphEdge[] | null {
  const outgoing = new Map<string, GraphEdge[]>();
  for (const edge of edges)
    outgoing.set(edge.from, [...(outgoing.get(edge.from) || []), edge]);
  const states = new Map<
    string,
    { node: string; incoming?: GraphEdge; cost: number; parent?: string }
  >();
  states.set('@start', { node: start, cost: 0 });
  const open = new Set(['@start']);
  while (open.size) {
    const key = [...open].reduce((a, b) =>
      states.get(a)!.cost <= states.get(b)!.cost ? a : b,
    );
    open.delete(key);
    const current = states.get(key)!;
    if (current.node === end) {
      const result: GraphEdge[] = [];
      let state = current;
      while (state.incoming) {
        result.unshift(state.incoming);
        state = states.get(state.parent!)!;
      }
      return result;
    }
    for (const edge of outgoing.get(current.node) || []) {
      const restrictions = data.driving!.restrictions.filter(
        (r) =>
          r.viaNodeId === current.node &&
          r.fromSourceId === current.incoming?.sourceId &&
          (!r.uTurn || edge.to === current.incoming?.from),
      );
      if (
        restrictions.some(
          (r) => r.kind === 'no' && r.toSourceId === edge.sourceId,
        ) ||
        (restrictions.some((r) => r.kind === 'only') &&
          !restrictions.some(
            (r) => r.kind === 'only' && r.toSourceId === edge.sourceId,
          ))
      )
        continue;
      const cost =
        current.cost + edgeSeconds(edge) * (penalty.get(edge.id) || 1);
      if (cost >= (states.get(edge.id)?.cost ?? Infinity)) continue;
      states.set(edge.id, { node: edge.to, incoming: edge, cost, parent: key });
      open.add(edge.id);
    }
  }
  return null;
}

export function findDrivingJourneys(
  data: CampusData,
  origin: RouteOrigin,
  destination: RouteEndpoint,
  parkingId?: string,
): Route[] {
  if (!data.driving)
    throw new RoutingError(
      'This map supports walking only. Download an updated campus map for driving.',
    );
  const nodes = new Map(data.graph.nodes.map((n) => [n.id, n]));
  const blocked = new Set(
    data.closures
      .filter((c) => !c.reopenedAt && (!c.modes || c.modes.includes('driving')))
      .flatMap((c) => c.edgeIds),
  );
  const geometryBlocked = cachedGeometryBlocker(data.map);
  const edges = data.graph.edges.filter((e) => {
    const a = nodes.get(e.from),
      b = nodes.get(e.to);
    return (
      a &&
      b &&
      e.vehicleAllowed === true &&
      vehiclePermitted(e.vehicle) &&
      !e.steps &&
      !e.geometryBlocked &&
      !blocked.has(e.id) &&
      !geometryBlocked(a.coordinates, b.coordinates)
    );
  });
  const connected = new Set(edges.flatMap((e) => [e.from, e.to]));
  let start: string | undefined,
    offset = 0;
  if (Array.isArray(origin)) {
    const near = data.graph.nodes
      .filter((n) => connected.has(n.id))
      .map((n) => ({ id: n.id, distance: distance(origin, n.coordinates) }))
      .filter((n) => n.distance <= 45)
      .sort((a, b) => a.distance - b.distance)[0];
    start = near?.id;
    offset = near?.distance || 0;
  } else if (typeof origin === 'string') start = origin;
  else {
    const place = data.places.find((p) => p.id === origin.placeId);
    const parking = data.driving.parking.find((p) => p.id === origin.placeId);
    start = parking?.vehicleNodeId || place?.graphNode;
  }
  if (!start || !connected.has(start))
    throw new RoutingError(
      'No permitted driving connection at your start. Choose a mapped road or parking point; private roads need owner driving review.',
    );
  const candidates: Route[] = [];
  for (const parking of data.driving.parking.filter(
    (p) =>
      (!parkingId || p.id === parkingId) &&
      vehiclePermitted({
        access: p.access,
        review: p.review,
        direction: 'both',
      }),
  )) {
    // Transfer points must coincide: any connecting footpath belongs in the graph.
    const vehicleNode = nodes.get(parking.vehicleNodeId),
      walkingNode = nodes.get(parking.walkingNodeId);
    if (
      !vehicleNode ||
      !walkingNode ||
      distance(vehicleNode.coordinates, walkingNode.coordinates) > 1
    )
      continue;
    let walk: Route;
    try {
      walk = findRoutes(data, parking.walkingNodeId, destination)[0];
    } catch {
      continue;
    }
    const penalty = new Map<string, number>();
    for (let attempt = 0; attempt < 5; attempt++) {
      const path = vehiclePath(
        data,
        edges,
        start,
        parking.vehicleNodeId,
        penalty,
      );
      if (!path) break;
      const drive = makeRoute(data.graph, path, start, offset);
      drive.mode = 'driving';
      drive.id = `driving:${drive.id}`;
      drive.segmentSeconds = path.map(edgeSeconds);
      drive.seconds = drive.segmentSeconds.reduce((a, b) => a + b, 0);
      drive.estimatedSpeed = path.some((e) => !e.vehicle?.speedKph);
      drive.parkingId = parking.id;
      drive.parkingName = parking.name;
      drive.maneuvers[0].instruction = `Start driving${path[0]?.name ? ` along ${path[0].name}` : ''}`;
      drive.maneuvers.at(-1)!.instruction =
        `Arrive at ${parking.name}. Park before starting the walking leg.`;
      let at = 0;
      for (let i = 0; i < path.length; i++) {
        if (path[i].vehicle?.roundabout && !path[i - 1]?.vehicle?.roundabout) {
          let end = i,
            endAt = at,
            exit = 0;
          while (end < path.length && path[end].vehicle?.roundabout) {
            endAt += path[end].distance;
            const outgoing = edges.filter(
              (e) => e.from === path[end].to && !e.vehicle?.roundabout,
            );
            if (outgoing.length) exit++;
            end++;
          }
          drive.maneuvers = drive.maneuvers.filter(
            (m) =>
              m.kind === 'depart' ||
              m.kind === 'arrive' ||
              m.at < at - 5 ||
              m.at > endAt + 5,
          );
          drive.maneuvers.push({
            kind: 'straight',
            roundaboutExit: Math.max(1, exit),
            at,
            coordinates: nodes.get(path[i].from)!.coordinates,
            street: path[end]?.name || '',
            instruction: `At the roundabout, take exit ${Math.max(1, exit)}${path[end]?.name ? ` onto ${path[end].name}` : ' along the highlighted route'}`,
          });
        }
        at += path[i].distance;
      }
      drive.maneuvers.sort((a, b) => a.at - b.at);
      const journey: Route = {
        ...drive,
        id: `${drive.id}:park:${parking.id}:${walk.id}`,
        legs: [drive, walk],
        destinationEntranceId: walk.destinationEntranceId,
        arrivalKind: walk.arrivalKind,
        approachDistance: walk.approachDistance,
        coordinates: [...drive.coordinates, ...walk.coordinates.slice(1)],
        distance: drive.distance + walk.distance,
        seconds: drive.seconds + walk.seconds,
      };
      if (!candidates.some((r) => r.id === journey.id))
        candidates.push(journey);
      path.forEach((e) => penalty.set(e.id, (penalty.get(e.id) || 1) + 1));
      if (!path.length) break;
    }
  }
  candidates.sort((a, b) => a.seconds - b.seconds || a.id.localeCompare(b.id));
  if (!candidates.length)
    throw new RoutingError(
      typeof destination !== 'string' && destination.entranceId
        ? 'No complete journey to the selected entrance is available. Review its connection or choose another entrance.'
        : 'No complete drive-and-walk journey is mapped. Roads, gates, parking and walking connections need separate owner review.',
    );
  const result: Route[] = [];
  for (const candidate of candidates) {
    const drive = candidate.legs![0];
    if (new Set(drive.nodeIds).size !== drive.nodeIds.length) continue;
    if (result.length && candidate.seconds > result[0].seconds * 1.6) continue;
    if (
      result.every(
        (r) =>
          r.parkingId !== candidate.parkingId ||
          drive.edgeIds.filter((id) => r.edgeIds.includes(id)).length /
            Math.max(1, drive.edgeIds.length) <
            0.8,
      )
    )
      result.push(candidate);
    if (result.length === 3) break;
  }
  return result.length ? result : [candidates[0]];
}
