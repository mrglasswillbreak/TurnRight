import { describe, it, expect } from 'vitest';
import { fitRoofHeight, inheritsBuildingHeight } from '../src/model-height';
import { createBuildingModel } from '../src/building-model';
import { resolveBuildingVisual } from '../src/building-surfaces';
import { editableFacade, modelFeature } from '../src/model-authoring';
import type { MapEdit } from '../src/types';
const base: MapEdit = {
  id: 'b',
  kind: 'building',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [3, 6],
        [3.0002, 6],
        [3.0002, 6.0001],
        [3, 6.0001],
        [3, 6],
      ],
    ],
  },
  properties: {
    height: 6,
    heightMode: 'metres',
    appearance: {
      windows: false,
      roofForm: 'flat',
      roofs: {
        'b:wing:0': {
          eaves: 5,
          points: [
            { id: 'peak', coordinates: [3.0001, 6.00005], elevation: 6 },
          ],
          lines: [],
        },
      },
    },
  },
};
const peak = (edit: MapEdit) =>
  Math.max(
    ...createBuildingModel(
      modelFeature(edit),
      resolveBuildingVisual(modelFeature(edit)),
    ).meshes.flatMap((m) => m.positions.filter((_, i) => i % 3 === 2)),
  );
describe('model height and custom roofs', () => {
  it('changes rendered height, retains roof geometry and does not mutate the original', () => {
    const edit = structuredClone(base);
    edit.properties.height = 12;
    const before = structuredClone(edit);
    const result = fitRoofHeight(edit, 'b:wing:0', 12);
    expect(edit).toEqual(before);
    expect(peak(edit)).toBeCloseTo(6);
    expect(peak(result)).toBeCloseTo(12);
    expect(result.properties.appearance!.roofs!['b:wing:0'].eaves).toBe(10);
    expect(
      result.properties.appearance!.roofs!['b:wing:0'].points[0].coordinates,
    ).toEqual([3.0001, 6.00005]);
    expect(
      result.properties.appearance!.roofs!['b:wing:0'].provenance,
    ).toContain('require review');
  });
  it('fits floor-derived heights and flags only affected facades without stretching details', () => {
    const edit = structuredClone(base);
    edit.properties.heightMode = 'floors';
    edit.properties.floors = 4;
    const facade = editableFacade(modelFeature(base), 'b:wall:0:0:0');
    facade.reviewedAt = '2026-09-25';
    edit.properties.appearance!.facades = { [facade.wallId]: facade };
    const next = fitRoofHeight(edit, 'b:wing:0', 12);
    expect(peak(next)).toBeCloseTo(12);
    expect(
      next.properties.appearance!.facades![facade.wallId].needsReview,
    ).toBe(true);
    expect(
      next.properties.appearance!.facades![facade.wallId].reviewedAt,
    ).toBeUndefined();
    expect(
      next.properties.appearance!.facades![facade.wallId].elements,
    ).toEqual(facade.elements);
    expect(fitRoofHeight(next, 'b:wing:0', 12)).toBe(next);
  });
  it('does not fabricate roofs or accept invalid heights and preserves explicit wing choices', () => {
    expect(fitRoofHeight(base, 'missing', 12)).toBe(base);
    for (const height of [0, -1, NaN, Infinity, 151])
      expect(fitRoofHeight(base, 'b:wing:0', height)).toBe(base);
    expect(inheritsBuildingHeight(undefined)).toBe(true);
    expect(inheritsBuildingHeight({})).toBe(true);
    for (const value of [
      { height: 6 },
      { floors: 2 },
      { heightMode: 'unknown' },
    ])
      expect(inheritsBuildingHeight(value)).toBe(false);
  });
});
