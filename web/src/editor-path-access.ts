import type { CampusData, WalkingAccess } from './types.js';
export const walkingAccessValues = ['yes', 'campus', 'private', 'no'];

export function pathWalkingAccess(data: CampusData, id: string): WalkingAccess {
  const declared = data.map.features.find((f) => f.properties?.id === id)
    ?.properties?.walkingAccess;
  if (walkingAccessValues.includes(declared)) return declared as WalkingAccess;
  const edges = data.graph.edges.filter((e) => e.sourceId === id);
  if (!edges.length || edges.some((e) => !e.accessible)) return 'private';
  return edges.some((e) => e.walkingAccess === 'campus') ? 'campus' : 'yes';
}
