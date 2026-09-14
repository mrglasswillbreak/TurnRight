import { expect, it } from 'vitest';
import { buildingOutline } from '../src/building-outline';
import type { ModelMesh } from '../src/visual-types';

const wall: ModelMesh = {
  colour: '#ffffff',
  positions: [0, 0, 0, 2, 0, 0, 2, 0, 3, 0, 0, 3],
  indices: [0, 1, 2, 0, 2, 3],
  surfaces: [
    { partId: 'wing', wallId: 'wall', role: 'wall', start: 0, count: 2 },
  ],
};
it('highlights four wall edges instead of six triangle edges without changing the model', () => {
  const original = structuredClone(wall);
  const outline = buildingOutline(wall, {
    buildingId: 'b',
    partId: 'wing',
    wallId: 'wall',
  });
  expect(outline).toHaveLength(24);
  expect(wall).toEqual(original);
  expect(
    buildingOutline(
      {
        ...wall,
        positions: new Float32Array(wall.positions),
        indices: new Uint16Array(wall.indices),
      },
      { buildingId: 'b', wallId: 'wall' },
    ),
  ).toEqual(outline);
  expect(buildingOutline(wall, { buildingId: 'b', wallId: 'other' })).toEqual(
    [],
  );
});
it('omits facade details and supports packages without surface metadata', () => {
  for (const role of ['window', 'trim'] as const)
    expect(
      buildingOutline(
        {
          ...wall,
          surfaces: [{ ...wall.surfaces![0], role }],
        },
        { buildingId: 'b' },
      ),
    ).toEqual([]);
  expect(
    buildingOutline({ ...wall, surfaces: undefined }, { buildingId: 'b' }),
  ).toEqual([]);
});
it('matches coincident vertices across roof triangles and keeps a selected triangle outline', () => {
  const roof: ModelMesh = {
    ...wall,
    positions: [0, 0, 3, 2, 0, 3, 2, 2, 3, 0, 0, 3, 2, 2, 3, 0, 2, 3],
    indices: [0, 1, 2, 3, 4, 5],
    surfaces: [{ start: 0, count: 2, partId: 'wing', role: 'roof' }],
  };
  expect(buildingOutline(roof, { buildingId: 'b', role: 'roof' })).toHaveLength(
    24,
  );
  expect(
    buildingOutline(roof, { buildingId: 'b', role: 'roof', roofTriangle: 1 }),
  ).toEqual([0, 0, 3, 2, 2, 3, 2, 2, 3, 0, 2, 3, 0, 2, 3, 0, 0, 3]);
});
