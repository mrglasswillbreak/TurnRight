import { describe, expect, it } from 'vitest';
import {
  copyElements,
  detachInstance,
  editableFacade,
  elementBounds,
  generatedElements,
  layoutElements,
  modelFeature,
  moveElements,
  patternElements,
  placementErrors,
  wallMetrics,
  authoringErrors,
  emptyAuthoring,
} from '../src/model-authoring';
import { facadeErrors } from '../src/building-facades';
import { facadeMeshes } from '../src/facade-mesh';
import { mergeModelMeshes } from '../src/building-model';
import { remapBuildingSurfaces } from '../src/building-surfaces';
import type { MapEdit } from '../src/types';
import type { FacadeElement } from '../src/visual-types';
const edit: MapEdit = {
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
    name: 'Building',
    height: 9,
    floors: 3,
    appearance: { windows: true, roofForm: 'flat' },
  },
};
const f = modelFeature(edit),
  wall = editableFacade(f, 'b:wall:0:0:0'),
  m = wallMetrics(f, wall.wallId);
const element: FacadeElement = {
  id: 'one',
  kind: 'window',
  x: 0.3,
  bottom: 1,
  width: 1,
  height: 2,
  depth: 0.1,
  count: 1,
  spacing: 0,
  colour: '#123456',
};
describe('precise model commands', () => {
  it('uses the model wall length and converts metre moves without rounding drift', () => {
    const next = moveElements([element], ['one'], 1.234, 0.5, m.length)[0];
    expect((next.x - element.x) * m.length).toBeCloseTo(1.234, 8);
    expect(next.bottom).toBe(1.5);
    expect(moveElements([next], ['one'], -1.234, -0.5, m.length)[0]).toEqual(
      element,
    );
  });
  it('copies physical sizes and repetitions between unequal walls with fresh identities', () => {
    const e = { ...element, count: 3, spacing: 0.1 };
    const c = copyElements([e], 20, 40)[0];
    expect(c.id).not.toBe(e.id);
    expect(c.x * 40).toBe(e.x * 20);
    expect(c.spacing * 40).toBe(e.spacing * 20);
    expect(c.width).toBe(e.width);
  });
  it('detaches an instance while retaining every original position', () => {
    const e = { ...element, count: 5, spacing: 0.1 };
    const result = detachInstance([e], 'one', 2);
    const positions = result.elements
      .flatMap((v) =>
        Array.from(
          { length: v.count },
          (_, i) => v.x + (i - (v.count - 1) / 2) * v.spacing,
        ),
      )
      .sort();
    const original = Array.from(
      { length: 5 },
      (_, i) => e.x + (i - 2) * e.spacing,
    ).sort();
    positions.forEach((p, i) => expect(p).toBeCloseTo(original[i], 10));
    expect(result.elements.find((v) => v.id === result.detachedId)?.count).toBe(
      1,
    );
  });
  it('aligns, distributes and mirrors element bounds', () => {
    const list = [
      element,
      { ...element, id: 'two', x: 0.6, width: 2 },
      { ...element, id: 'three', x: 0.9 },
    ];
    const aligned = layoutElements(
      list,
      list.map((e) => e.id),
      20,
      'left',
    ).map((e) => elementBounds(e, 20));
    expect(new Set(aligned.map((e) => e.left)).size).toBe(1);
    const mirrored = layoutElements(
      list,
      list.map((e) => e.id),
      20,
      'mirror',
    );
    expect(mirrored[0].x).toBeCloseTo(0.9);
    expect(mirrored[2].x).toBeCloseTo(0.3);
  });
  it('creates bounded patterns without changing the seed', () => {
    const result = patternElements([element], 2, 3, 2, 3, 20);
    expect(result).toHaveLength(6);
    expect(new Set(result.map((e) => e.id)).size).toBe(6);
    expect(result[5].bottom).toBe(4);
    expect(element.bottom).toBe(1);
    expect(() => patternElements([element], 40, 40, 2, 3, 20)).toThrow('100');
  });
  it('rejects invalid placement rather than clipping or truncating', () => {
    expect(placementErrors([{ ...element, x: 0 }], 20, 10)).toHaveLength(1);
    expect(placementErrors([{ ...element, count: 41 }], 20, 10)).toHaveLength(
      1,
    );
    expect(placementErrors([element], 20, 10)).toEqual([]);
  });
  it('converts generated rows and trims into a complete bounded layout', () => {
    const generated = generatedElements(m);
    expect(generated.filter((e) => e.kind === 'window')).toHaveLength(3);
    expect(generated.every((e) => e.flat)).toBe(true);
    expect(placementErrors(generated, m.length, m.eaves)).toEqual([]);
  });
  it('allows explicit illustrative evidence, requires photos for observation and provenance for measurement', () => {
    const feature = {
      ...f,
      properties: {
        ...f.properties,
        appearance: { facades: { [wall.wallId]: wall } },
      },
    };
    expect(facadeErrors(feature, [])).toEqual([]);
    wall.confidence = 'observed';
    expect(facadeErrors(feature, []).length).toBeGreaterThan(0);
    wall.confidence = 'documented';
    wall.notes = '';
    expect(facadeErrors(feature, []).length).toBeGreaterThan(0);
    wall.confidence = 'inferred';
  });
  it('keeps detail and instance identity after material batching', () => {
    const facade = {
      ...wall,
      elements: [{ ...element, count: 3, spacing: 0.1 }],
    };
    const meshes = mergeModelMeshes(
      facadeMeshes(facade, [0, 0], [20, 0], [0, -1], 10, '#ffffff'),
    );
    expect(meshes.length).toBeLessThan(4);
    expect(
      new Set(meshes.flatMap((m) => m.surfaces!.map((s) => s.instanceIndex))),
    ).toEqual(new Set([0, 1, 2]));
    expect(
      meshes.every((m) => m.surfaces!.every((s) => s.elementId === 'one')),
    ).toBe(true);
  });
  it('flags moved assignments without changing stored detail dimensions', () => {
    const e = structuredClone(edit);
    e.properties.appearance = {
      facades: { [wall.wallId]: { ...wall, elements: [element] } },
    };
    const geometry = structuredClone(e.geometry);
    if (geometry.type === 'Polygon') geometry.coordinates[0][1][0] += 0.00005;
    const next = remapBuildingSurfaces(e, geometry);
    expect(next.properties.appearance!.facades![wall.wallId].needsReview).toBe(
      true,
    );
    expect(
      next.properties.appearance!.facades![wall.wallId].wallCoordinates,
    ).toEqual(wall.wallCoordinates);
  });
  it('bounds private authoring data and rejects unknown versions', () => {
    expect(authoringErrors(emptyAuthoring())).toEqual([]);
    expect(authoringErrors({ ...emptyAuthoring(), version: 2 })).not.toEqual(
      [],
    );
  });
});
