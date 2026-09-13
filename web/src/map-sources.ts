import type { FeatureCollection } from 'geojson';
import type { CampusData, Place } from './types';
import { visualEdges } from './map-display';

const colors: Record<string, string> = {
  academic: '#6863cf',
  library: '#406fc3',
  worship: '#ad789e',
  food: '#db8741',
  services: '#337f91',
  residence: '#8896a5',
  sports: '#639466',
  gate: '#d58b4d',
  other: '#778795',
};
export function placeFeatures(places: Place[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: places.map((p) => ({
      type: 'Feature',
      id: p.id,
      geometry: { type: 'Point', coordinates: p.coordinates },
      properties: {
        id: p.id,
        name: p.name.replace(/[^\x20-\x7E]/g, ' '),
        category: p.category,
        color: colors[p.category],
        priority: /library|senate|health|clinic|faculty|gate/i.test(p.name)
          ? 1
          : 2,
      },
    })),
  };
}
export function closureFeatures(
  graph: CampusData['graph'],
  closures: CampusData['closures'],
): FeatureCollection {
  const closed = new Set(
    closures.filter((c) => !c.reopenedAt).flatMap((c) => c.edgeIds),
  );
  const nodes = new Map(graph.nodes.map((n) => [n.id, n.coordinates]));
  const edges = graph.edges.filter(
    (e) =>
      (closed.has(e.id) || e.geometryBlocked) &&
      nodes.has(e.from) &&
      nodes.has(e.to),
  );
  // A closure takes precedence over a geometry warning on the reverse edge.
  edges.sort((a, b) => Number(closed.has(b.id)) - Number(closed.has(a.id)));
  return {
    type: 'FeatureCollection',
    features: visualEdges(edges).map((e) => ({
      type: 'Feature',
      id: e.id,
      properties: { conflict: !!e.geometryBlocked && !closed.has(e.id) },
      geometry: {
        type: 'LineString',
        coordinates: [nodes.get(e.from)!, nodes.get(e.to)!],
      },
    })),
  };
}
