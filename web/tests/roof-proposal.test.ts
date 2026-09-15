import { describe, expect, it } from 'vitest';
import { proposeHipRoof } from '../src/roof-proposal';
import { customRoofSurface } from '../src/custom-roof';
import {
  buildingTopology,
  remapBuildingSurfaces,
} from '../src/building-surfaces';
import type { MapEdit } from '../src/types';

const ring = (points: number[][]) =>
  [...points, points[0]].map(([x, y]) => [3.2 + x / 111195, 6.46 + y / 111195]);
const rect = ring([
  [0, 0],
  [30, 0],
  [30, 12],
  [0, 12],
]);
const concave = ring([
  [0, 0],
  [30, 0],
  [30, 10],
  [10, 10],
  [10, 30],
  [0, 30],
]);
const outer = ring([
  [0, 0],
  [40, 0],
  [40, 40],
  [0, 40],
]);
const hole = ring([
  [10, 10],
  [10, 30],
  [30, 30],
  [30, 10],
]);
describe('editable approximate roof plans', () => {
  it.each([[rect], [concave], [outer, hole]])(
    'creates a sloped, bounded roof over footprint %j',
    (...polygon) => {
      const before = structuredClone(polygon),
        roof = proposeHipRoof(polygon, 9);
      expect(polygon).toEqual(before);
      expect(proposeHipRoof(polygon, 9)).toEqual(roof);
      const surface = customRoofSurface(polygon, roof, 9);
      expect(surface.slopes.some((s) => s > 1)).toBe(true);
      expect(surface.points.every((p) => p[2] >= roof.eaves && p[2] <= 9)).toBe(
        true,
      );
      expect(Math.max(...surface.points.map((p) => p[2]))).toBeCloseTo(9);
      expect(roof.provenance).toMatch(/illustrative/);
    },
  );
  it('keeps courtyard interiors open', () => {
    const roof = proposeHipRoof([outer, hole], 6),
      surface = customRoofSurface([outer, hole], roof, 6);
    for (const t of surface.triangles) {
      const center = [0, 1].map(
        (k) => t.reduce((s, i) => s + surface.points[i][k], 0) / 3,
      );
      expect(
        center[0] > hole[0][0] &&
          center[0] < hole[2][0] &&
          center[1] > hole[0][1] &&
          center[1] < hole[2][1],
      ).toBe(false);
    }
  });
  it('rejects misclassified exterior rings, invalid heights and point budget overflow', () => {
    const outside = rect.map(([x, y]) => [x + 0.001, y]);
    expect(() => proposeHipRoof([outer, outside], 6)).toThrow(
      /outline|courtyard/,
    );
    expect(() => proposeHipRoof([rect], 0)).toThrow(/height/);
    expect(() => proposeHipRoof([rect], NaN)).toThrow(/height/);
    const circle = ring(
      Array.from({ length: 140 }, (_, i) => [
        30 * Math.cos((i * Math.PI) / 70),
        30 * Math.sin((i * Math.PI) / 70),
      ]),
    );
    expect(() => proposeHipRoof([circle], 6)).toThrow(/128/);
  });
  it('moves generated control points with the wing while retaining appearance', () => {
    const geometry = { type: 'Polygon' as const, coordinates: [concave] };
    const topology = buildingTopology({
      type: 'Feature',
      geometry,
      properties: { id: 'b' },
    });
    const roof = proposeHipRoof([concave], 6);
    const edit: MapEdit = {
      id: 'b',
      kind: 'building',
      geometry,
      properties: {
        height: 6,
        buildingTopology: topology,
        appearance: { roofs: { [topology.parts[0].id]: roof } },
      },
    };
    const next = remapBuildingSurfaces(edit, {
      type: 'Polygon',
      coordinates: [concave.map(([x, y]) => [x + 0.0001, y])],
    });
    const moved = next.properties.appearance!.roofs![topology.parts[0].id];
    expect(moved.points[0].coordinates[0]).toBeCloseTo(
      roof.points[0].coordinates[0] + 0.0001,
      9,
    );
    expect(moved.provenance).toBe(roof.provenance);
    expect(() =>
      customRoofSurface(
        (next.geometry as typeof geometry).coordinates,
        moved,
        6,
      ),
    ).not.toThrow();
  });
});
