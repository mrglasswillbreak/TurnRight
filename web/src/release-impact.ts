import type { CampusData, MapEdit } from './types';
import { canonical } from './editor-conflicts';
import { findRoutes, placeHasConnection } from './routing';
import { resolvePlaceId } from './map-display';

export const releaseWalks = [
  {
    name: 'Clinic–Senate',
    origin: 'arcgis:Infrastructure:17',
    destination: 'arcgis:University_Property:120',
  },
  {
    name: 'Clinic–Law',
    origin: 'arcgis:Infrastructure:17',
    destination: 'arcgis:University_Property:6',
  },
  {
    name: 'Clinic–Library',
    origin: 'arcgis:Infrastructure:17',
    destination: 'arcgis:University_Property:3',
  },
];
function records(data: CampusData) {
  const records = new Map<
    string,
    { kind: MapEdit['kind']; id: string; name: string; value: unknown }
  >();
  const add = (
    kind: MapEdit['kind'],
    id: string,
    name: string,
    value: unknown,
  ) => records.set(`${kind}:${id}`, { kind, id, name, value });
  data.map.features.forEach((f) => {
    const kind = f.properties?.kind;
    if (['path', 'building', 'barrier'].includes(kind))
      add(
        kind,
        String(f.properties!.id),
        String(f.properties!.name || f.properties!.id),
        { geometry: f.geometry, properties: f.properties },
      );
  });
  data.places.forEach((p) => add('place', p.id, p.name, p));
  data.entrances?.forEach((e) => add('entrance', e.id, e.name, e));
  data.closures.forEach((c) => add('closure', c.id, c.reason, c));
  return records;
}
function clinicReachable(data: CampusData): Set<string> {
  const origin = data.places.find(
    (p) => p.id === resolvePlaceId(data, releaseWalks[0].origin),
  );
  if (!origin) return new Set();
  const blocked = new Set(
    data.closures.filter((c) => !c.reopenedAt).flatMap((c) => c.edgeIds),
  );
  const adjacency = new Map<string, string[]>();
  data.graph.edges
    .filter((e) => e.accessible && !e.geometryBlocked && !blocked.has(e.id))
    .forEach((e) => {
      adjacency.set(e.from, [...(adjacency.get(e.from) || []), e.to]);
    });
  const entrances = (data.entrances || []).filter(
    (e) =>
      e.placeId === origin.id &&
      e.graphNode &&
      ['yes', 'campus'].includes(e.walkingAccess),
  );
  const queue = entrances.length
    ? entrances.map((e) => e.graphNode!)
    : origin.graphNode
      ? [origin.graphNode]
      : [];
  const visited = new Set<string>();
  while (queue.length) {
    const node = queue.pop()!;
    if (visited.has(node)) continue;
    visited.add(node);
    queue.push(...(adjacency.get(node) || []));
  }
  return new Set(
    data.places
      .filter((p) => {
        const endpoints = (data.entrances || []).filter(
          (e) => e.placeId === p.id,
        );
        return endpoints.length
          ? endpoints.some(
              (e) =>
                e.graphNode &&
                visited.has(e.graphNode) &&
                ['yes', 'campus'].includes(e.walkingAccess),
            )
          : !!p.graphNode && visited.has(p.graphNode);
      })
      .map((p) => p.id),
  );
}
function walk(data: CampusData, origin: string, destination: string) {
  try {
    if (
      ![origin, destination].every((id) =>
        data.places.some((p) => p.id === resolvePlaceId(data, id)),
      )
    )
      return { status: 'Place unavailable' };
    const route = findRoutes(
      data,
      { placeId: origin },
      { placeId: destination },
    )[0];
    return { status: 'Connected', distance: Math.round(route.distance) };
  } catch (e) {
    return { status: (e as Error).message };
  }
}
export function releaseImpact(published: CampusData, draft: CampusData) {
  const before = records(published),
    after = records(draft);
  const changes: {
    kind: MapEdit['kind'];
    id: string;
    name: string;
    change: 'added' | 'changed' | 'deleted';
  }[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(key),
      a = after.get(key),
      record = a || b!;
    if (canonical(b?.value) !== canonical(a?.value))
      changes.push({
        kind: record.kind,
        id: record.id,
        name: record.name,
        change: !b ? 'added' : !a ? 'deleted' : 'changed',
      });
  }
  const oldReachable = clinicReachable(published),
    newReachable = clinicReachable(draft);
  const newlyDisconnected = published.places
    .filter((p) => {
      const next = draft.places.find(
        (n) => n.id === resolvePlaceId(draft, p.id),
      );
      return (
        (placeHasConnection(published, p) &&
          (!next || !placeHasConnection(draft, next))) ||
        (oldReachable.has(p.id) && (!next || !newReachable.has(next.id)))
      );
    })
    .map((p) => ({ id: p.id, name: p.name }));
  return {
    changes,
    newlyDisconnected,
    walks: releaseWalks.map((r) => ({
      name: r.name,
      before: walk(published, r.origin, r.destination),
      after: walk(draft, r.origin, r.destination),
    })),
  };
}
export type ReleaseImpact = ReturnType<typeof releaseImpact>;
