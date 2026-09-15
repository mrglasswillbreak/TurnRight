import type { FeatureCollection } from 'geojson';
import type { CampusData, Category, Place } from './types';
import { visualEdges } from './map-display';

export const placeColours: Record<Category, { light: string; dark: string }> = {
  academic: { light: '#6863cf', dark: '#c7b5ed' },
  library: { light: '#406fc3', dark: '#aacdf5' },
  worship: { light: '#ad789e', dark: '#e1acd3' },
  food: { light: '#db8741', dark: '#ffbd83' },
  services: { light: '#337f91', dark: '#91d2df' },
  residence: { light: '#8896a5', dark: '#c6aceb' },
  sports: { light: '#639466', dark: '#8cd59b' },
  gate: { light: '#d58b4d', dark: '#efcf87' },
  other: { light: '#778795', dark: '#c1cfdf' },
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
        color: (placeColours[p.category] || placeColours.other).light,
        nightColor: (placeColours[p.category] || placeColours.other).dark,
        badge: `place-${Object.hasOwn(placeColours, p.category) ? p.category : 'other'}`,
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
