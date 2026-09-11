import type { Geometry } from 'geojson';
import { distance, projectSegment } from './geo';
import { pathWalkingAccess } from './editor-model';
import type { CampusData, ConnectionTarget, MapEdit, Position } from './types';

export interface SnapTarget {
  coordinates: Position;
  label: string;
  target?: ConnectionTarget;
}
export function snapTarget(
  data: CampusData,
  point: Position,
  project: (p: Position) => { x: number; y: number },
  excludePath?: string,
  buildingId?: string,
): SnapTarget | undefined {
  const pointer = project(point);
  let best: SnapTarget | undefined,
    bestPixels = 12;
  const consider = (candidate: SnapTarget) => {
    if (distance(point, candidate.coordinates) > 5) return;
    const p = project(candidate.coordinates),
      pixels = Math.hypot(p.x - pointer.x, p.y - pointer.y);
    if (pixels <= bestPixels) {
      best = candidate;
      bestPixels = pixels;
    }
  };
  if (buildingId) {
    const building = data.map.features.find(
      (f) => f.properties?.id === buildingId && f.geometry.type === 'Polygon',
    );
    if (building?.geometry.type === 'Polygon')
      for (const ring of building.geometry.coordinates)
        for (let i = 1; i < ring.length; i++) {
          const p = projectSegment(
            point,
            ring[i - 1] as Position,
            ring[i] as Position,
          );
          consider({ coordinates: p.point, label: 'Building edge' });
        }
    return best;
  }
  const nodes = new Map(data.graph.nodes.map((n) => [n.id, n]));
  const edges = data.graph.edges.filter((e) => e.sourceId !== excludePath);
  const seen = new Set<string>();
  for (const edge of edges) {
    const key = [edge.from, edge.to].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    if (!a || !b) continue;
    const p = projectSegment(point, a.coordinates, b.coordinates);
    consider({
      coordinates: p.point,
      label: `Connect to ${edge.name || 'path'}${edge.accessible ? '' : ' (restricted)'}`,
      target: {
        type: 'segment',
        sourceId: edge.sourceId,
        from: a.id,
        to: b.id,
        coordinates: p.point,
      },
    });
  }
  for (const id of new Set(edges.flatMap((e) => [e.from, e.to]))) {
    const node = nodes.get(id)!;
    consider({
      coordinates: node.coordinates,
      label: 'Connect to junction',
      target: { type: 'node', nodeId: id, coordinates: node.coordinates },
    });
  }
  return best;
}

export function featureEdit(
  data: CampusData,
  kind: MapEdit['kind'],
  id: string,
  edits: MapEdit[],
): MapEdit | undefined {
  const saved = edits.find((e) => e.id === id && e.kind === kind);
  if (kind === 'entrance') {
    if (saved) return structuredClone(saved);
    const e = data.entrances?.find((e) => e.id === id);
    if (e)
      return {
        id,
        kind,
        geometry: { type: 'Point', coordinates: e.coordinates },
        properties: {
          name: e.name,
          placeId: e.placeId,
          buildingId: e.buildingId,
          access: e.walkingAccess,
          connectTo: e.graphNode,
        },
      };
  }
  if (kind === 'place') {
    if (saved) return structuredClone(saved);
    const p = data.places.find((p) => p.id === id);
    if (p)
      return {
        id,
        kind,
        geometry: { type: 'Point', coordinates: p.coordinates },
        properties: {
          name: p.name,
          category: p.category,
          aliases: p.aliases.join(', '),
          department: p.department,
          faculty: p.faculty,
        },
      };
  }
  const f = data.map.features.find(
    (f) => f.properties?.id === id && f.properties?.kind === kind,
  );
  if (!f) return saved && structuredClone(saved);
  const edit: MapEdit = {
    id,
    kind,
    geometry: structuredClone(f.geometry),
    properties: {
      ...f.properties,
      ...saved?.properties,
      name:
        f.properties?.name || (kind === 'path' ? 'Campus path' : 'Building'),
    },
  };
  if (kind === 'path' && f.geometry.type === 'LineString') {
    edit.properties.access = pathWalkingAccess(data, id);
    const used = new Set(
      data.graph.edges
        .filter((e) => e.sourceId === id)
        .flatMap((e) => [e.from, e.to]),
    );
    const nodes = data.graph.nodes.filter((n) => used.has(n.id));
    const drawn = f.geometry.coordinates as Position[];
    const points: Position[] = [];
    for (let i = 1; i < drawn.length; i++) {
      points.push(drawn[i - 1]);
      points.push(
        ...nodes
          .map((n) => ({
            n,
            p: projectSegment(n.coordinates, drawn[i - 1], drawn[i]),
          }))
          .filter(({ p }) => p.distance < 0.15 && p.t > 0.001 && p.t < 0.999)
          .sort((a, b) => a.p.t - b.p.t)
          .map(({ n }) => n.coordinates),
      );
    }
    points.push(drawn.at(-1)!);
    const unique = points.filter(
      (p, i) => !i || distance(p, points[i - 1]) > 0.1,
    );
    const oldIds = edit.properties.vertexIds;
    edit.geometry = { type: 'LineString', coordinates: unique };
    edit.properties.vertexIds = unique.map(
      (p) =>
        nodes.find((n) => distance(n.coordinates, p) < 0.15)?.id ||
        `${id}:vertex:${crypto.randomUUID()}`,
    );
    edit.properties.connections = (edit.properties.connections || [])
      .map((c) => {
        const oldIndex = oldIds?.indexOf(c.vertexId) ?? -1;
        const oldPoint =
          saved?.geometry.type === 'LineString' &&
          saved.geometry.coordinates[oldIndex];
        const index = oldPoint
          ? unique.findIndex((p) => distance(p, oldPoint as Position) < 0.2)
          : -1;
        return {
          ...c,
          vertexId: index >= 0 ? edit.properties.vertexIds![index] : c.vertexId,
        };
      })
      .filter((c) => edit.properties.vertexIds!.includes(c.vertexId));
  }
  return edit;
}

/** Retain IDs through insertion/deletion and move every member of an existing junction together. */
export function geometryEdits(
  current: MapEdit,
  geometry: Geometry,
  data: CampusData,
  edits: MapEdit[],
): MapEdit[] {
  const next = structuredClone({ ...current, geometry });
  const batch: MapEdit[] = [next];
  if (current.kind === 'entrance' && geometry.type === 'Point') {
    const nodeId = data.entrances?.find((e) => e.id === current.id)?.graphNode;
    const sourceId =
      nodeId &&
      data.graph.edges.find((e) => e.from === nodeId || e.to === nodeId)
        ?.sourceId;
    const path = sourceId && featureEdit(data, 'path', sourceId, edits);
    if (path && path.geometry.type === 'LineString') {
      const index = path.properties.vertexIds?.indexOf(nodeId!);
      if (index !== undefined && index >= 0) {
        const moved = structuredClone(path.geometry);
        moved.coordinates[index] = geometry.coordinates;
        const linked = geometryEdits(path, moved, data, edits);
        next.properties.connection = {
          type: 'node',
          nodeId: nodeId!,
          coordinates: geometry.coordinates as Position,
        };
        delete next.properties.connectTo;
        return [
          ...linked.filter(
            (e) => e.kind !== current.kind || e.id !== current.id,
          ),
          next,
        ];
      }
    }
  }
  if (current.geometry.type !== 'LineString' || geometry.type !== 'LineString')
    return batch;
  const old = current.geometry.coordinates as Position[],
    points = geometry.coordinates as Position[];
  const oldIds =
    current.properties.vertexIds ||
    old.map((_, i) => `${current.id}:vertex:${i}`);
  const used = new Set<number>();
  const indices = points.map((p) => {
    const i = old.findIndex((q, j) => !used.has(j) && distance(p, q) < 0.1);
    if (i >= 0) used.add(i);
    return i;
  });
  if (points.length === old.length)
    indices.forEach((v, i) => {
      if (v < 0 && !used.has(i)) {
        indices[i] = i;
        used.add(i);
      }
    });
  next.properties.vertexIds = indices.map((i) =>
    i >= 0 ? oldIds[i] : `${current.id}:vertex:${crypto.randomUUID()}`,
  );
  next.properties.connections = (next.properties.connections || []).filter(
    (c) => next.properties.vertexIds!.includes(c.vertexId),
  );
  const moved = indices.flatMap((oldIndex, i) =>
    oldIndex >= 0 && distance(old[oldIndex], points[i]) > 0.1
      ? [{ id: oldIds[oldIndex], point: points[i] }]
      : [],
  );
  for (const move of moved) {
    const affected = new Set(
      data.graph.edges
        .filter((e) => e.from === move.id || e.to === move.id)
        .map((e) => e.sourceId),
    );
    for (const id of affected) {
      if (id === current.id) continue;
      let path = batch.find((e) => e.kind === 'path' && e.id === id);
      if (!path) {
        path = featureEdit(data, 'path', id, edits);
        if (path) batch.push(path);
      }
      if (path?.geometry.type === 'LineString')
        path.geometry.coordinates = path.geometry.coordinates.map((p, i) =>
          path!.properties.vertexIds?.[i] === move.id ? move.point : p,
        );
    }
    for (const entrance of data.entrances || [])
      if (entrance.graphNode === move.id) {
        const edit = featureEdit(data, 'entrance', entrance.id, edits);
        if (edit) {
          edit.geometry = { type: 'Point', coordinates: move.point };
          edit.properties.connection = {
            type: 'node',
            nodeId: move.id,
            coordinates: move.point,
          };
          delete edit.properties.connectTo;
          batch.push(edit);
        }
      }
    for (const edit of [...edits, ...batch]) {
      const oldNode = data.graph.nodes.find((n) => n.id === move.id);
      const follows = (target: ConnectionTarget) =>
        target.type === 'node'
          ? target.nodeId === move.id
          : !!oldNode &&
            distance(target.coordinates, oldNode.coordinates) < 0.2 &&
            affected.has(target.sourceId);
      const changed = edit.properties.connections?.some((c) =>
        follows(c.target),
      );
      if (!changed) continue;
      let e = batch.find((p) => p.id === edit.id && p.kind === edit.kind);
      if (!e) {
        e = structuredClone(edit);
        batch.push(e);
      }
      e.properties.connections = e.properties.connections!.map((c) =>
        follows(c.target)
          ? {
              ...c,
              target: {
                type: 'node',
                nodeId: move.id,
                coordinates: move.point,
              },
            }
          : c,
      );
    }
  }
  return batch;
}
