import type { CampusData, Route } from './types';
export function routeSteps(data: CampusData, route: Pick<Route, 'edgeIds'>) {
  const edges = new Map(data.graph.edges.map((e) => [e.id, e]));
  let steps = 0,
    unknown = 0;
  for (const id of new Set(route.edgeIds)) {
    const edge = edges.get(id);
    if (edge?.steps === true) steps++;
    else if (edge?.steps !== false) unknown++;
  }
  return {
    steps,
    unknown,
    message: steps
      ? `Recorded steps on this route.${unknown ? ' Steps information is unknown for other segments.' : ''}`
      : unknown
        ? 'Steps information is unknown for parts of this route.'
        : 'Route segments are recorded without steps. Step-free access has not been verified.',
  };
}
