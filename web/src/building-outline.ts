import type { BuildingSelection, ModelMesh } from './visual-types';

/** Highlight surface boundaries, without triangulation diagonals or window grids. */
export function buildingOutline(
  mesh: Pick<ModelMesh, 'surfaces'> & {
    positions: ArrayLike<number>;
    indices: ArrayLike<number>;
  },
  selection: BuildingSelection,
): number[] {
  const output: number[] = [];
  for (const surface of mesh.surfaces || []) {
    if (
      !['wall', 'roof'].includes(surface.role) ||
      (selection.partId && surface.partId !== selection.partId) ||
      (selection.wallId && surface.wallId !== selection.wallId) ||
      (selection.role === 'roof' && surface.role !== 'roof')
    )
      continue;
    const edges = new Map<string, { points: number[]; count: number }>();
    for (let t = surface.start; t < surface.start + surface.count; t++) {
      if (
        selection.roofTriangle !== undefined &&
        surface.role === 'roof' &&
        t - surface.start !== selection.roofTriangle
      )
        continue;
      for (let edge = 0; edge < 3; edge++) {
        const a = mesh.indices[t * 3 + edge] * 3;
        const b = mesh.indices[t * 3 + ((edge + 1) % 3)] * 3;
        const start = [
            mesh.positions[a],
            mesh.positions[a + 1],
            mesh.positions[a + 2],
          ],
          end = [
            mesh.positions[b],
            mesh.positions[b + 1],
            mesh.positions[b + 2],
          ];
        const key = [start.join(','), end.join(',')].sort().join('|');
        const existing = edges.get(key);
        if (existing) existing.count++;
        else edges.set(key, { points: [...start, ...end], count: 1 });
      }
    }
    for (const edge of edges.values())
      if (edge.count === 1) output.push(...edge.points);
  }
  return output;
}
