import { describe, expect, it } from 'vitest';
import {
  modelDocumentErrors,
  newModelDocument,
  type MeshSelection,
  type ModelObject,
} from '../src/model-document';
import { meshCommand } from '../src/model-mesh-commands';
import {
  curvePoint,
  ellipseCurve,
  sampleCurveSegment,
} from '../src/model-curves';
import { curveMesh, primitive } from '../src/model-primitives';

function quad(): ModelObject {
  return {
    ...primitive('plane'),
    vertices: { a: [0, 0, 0], b: [4, 0, 0], c: [4, 4, 0], d: [0, 4, 0] },
    faces: [
      {
        id: 'front',
        material: 'default',
        corners: [
          { vertex: 'a', uv: [0, 0] },
          { vertex: 'b', uv: [1, 0] },
          { vertex: 'c', uv: [1, 1] },
          { vertex: 'd', uv: [0, 1] },
        ],
      },
    ],
  };
}
const face = (o: ModelObject): MeshSelection => ({
  objectId: o.id,
  kind: 'face',
  ids: ['front'],
});
function valid(object: ModelObject) {
  const d = newModelDocument([3.2, 6.46]);
  d.objects = [object];
  expect(modelDocumentErrors(d)).toEqual([]);
}
describe('mesh commands with stable component identities', () => {
  it('moves individual vertices without changing neighbours or the input', () => {
    const o = quad(),
      before = structuredClone(o),
      s: MeshSelection = { objectId: o.id, kind: 'vertex', ids: ['a'] };
    const r = meshCommand(o, s, { kind: 'move', value: [1, 2, 0] });
    expect(r.object.vertices.a).toEqual([1, 2, 0]);
    expect(r.object.vertices.b).toEqual(o.vertices.b);
    expect(o).toEqual(before);
    expect(r.selection).toEqual(s);
    valid(r.object);
  });
  it('extrudes a face, retaining its identity and UVs', () => {
    const o = quad(),
      r = meshCommand(o, face(o), { kind: 'extrude', amount: 3 });
    expect(r.object.faces).toHaveLength(5);
    expect(r.object.faces[0].id).toBe('front');
    for (const c of r.object.faces[0].corners)
      expect(r.object.vertices[c.vertex][2]).toBe(3);
    expect(r.object.faces[0].corners.map((c) => c.uv)).toEqual(
      o.faces[0].corners.map((c) => c.uv),
    );
    valid(r.object);
  });
  it('supports inset, subdivision, duplication, merge, and delete without mutating source', () => {
    const o = quad(),
      s = face(o);
    expect(
      meshCommand(o, s, { kind: 'inset', amount: 0.25 }).object.faces,
    ).toHaveLength(5);
    expect(meshCommand(o, s, { kind: 'subdivide' }).object.faces).toHaveLength(
      4,
    );
    const duplicated = meshCommand(o, s, { kind: 'duplicate' });
    expect(duplicated.object.faces).toHaveLength(2);
    expect(duplicated.selection.ids).not.toContain('front');
    valid(duplicated.object);
    const merged = meshCommand(
      o,
      { objectId: o.id, kind: 'vertex', ids: ['a', 'b'] },
      { kind: 'merge' },
    );
    expect(merged.object.faces[0].corners).toHaveLength(3);
    valid(merged.object);
    expect(meshCommand(o, s, { kind: 'delete' }).object.faces).toHaveLength(0);
    expect(o.faces).toHaveLength(1);
  });
  it('rejects locked geometry and collapsing transforms', () => {
    const o = quad();
    o.locked = true;
    expect(() => meshCommand(o, face(o), { kind: 'delete' })).toThrow(/Unlock/);
    o.locked = false;
    expect(() =>
      meshCommand(o, face(o), { kind: 'scale', value: [0, 1, 1] }),
    ).toThrow(/collapse/);
  });
  it('interpolates inset UVs and preserves the untouched outer border', () => {
    const o = quad();
    const next = meshCommand(o, face(o), { kind: 'inset', amount: 1 }).object;
    const inner = next.faces.find((f) => f.id === 'front')!;
    for (const corner of inner.corners) {
      const p = next.vertices[corner.vertex];
      expect(corner.uv?.[0]).toBeCloseTo(p[0] / 4);
      expect(corner.uv?.[1]).toBeCloseTo(p[1] / 4);
    }
    expect(next.vertices.a).toEqual(o.vertices.a);
  });
  it('validates every primitive and detects dangling references and hierarchy cycles', () => {
    for (const kind of [
      'box',
      'plane',
      'sphere',
      'cylinder',
      'cone',
      'torus',
      'ellipse',
    ] as const)
      valid(primitive(kind));
    const d = newModelDocument([3.2, 6.46]);
    d.objects = [quad()];
    d.objects[0].faces[0].corners[0].vertex = 'missing';
    expect(modelDocumentErrors(d).join(' ')).toMatch(/invalid/);
    d.objects = [quad(), quad()];
    d.objects[0].parentId = d.objects[1].id;
    d.objects[1].parentId = d.objects[0].id;
    expect(modelDocumentErrors(d)).toEqual([
      'Model hierarchy contains a cycle.',
    ]);
  });
});
describe('curve source and deterministic tessellation', () => {
  it('rejects invalid profile edits and extrusion beyond the model bounds', () => {
    const document = newModelDocument([3.2, 6.46]);
    const object = primitive('ellipse');
    document.objects = [object];
    object.curve!.closed = false;
    expect(modelDocumentErrors(document).join(' ')).toMatch(/profile/);
    object.curve!.closed = true;
    object.transform.position[2] = 1999;
    expect(modelDocumentErrors(document).join(' ')).toMatch(
      /bounds|within 2 km/,
    );
  });
  it('samples circular arcs through the supplied middle point', () => {
    const segment = {
      id: 'arc',
      kind: 'arc' as const,
      through: [0, 1, 0] as [number, number, number],
      end: [-1, 0, 0] as [number, number, number],
    };
    const p = curvePoint([1, 0, 0], segment, 0.5);
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(1);
    expect(sampleCurveSegment([1, 0, 0], segment)).toEqual(
      sampleCurveSegment([1, 0, 0], segment),
    );
  });
  it('keeps ellipse controls editable and produces bounded closed extrusion', () => {
    const curve = ellipseCurve(10, 6, 3),
      o = curveMesh(curve, 'Oval');
    valid(o);
    expect(Math.max(...Object.values(o.vertices).map((v) => v[0]))).toBeCloseTo(
      5,
    );
    expect(Math.max(...Object.values(o.vertices).map((v) => v[1]))).toBeCloseTo(
      3,
    );
    expect(Math.max(...Object.values(o.vertices).map((v) => v[2]))).toBe(3);
  });
  it('rejects collinear arc definitions without changing saved control points', () => {
    expect(() =>
      curvePoint(
        [0, 0, 0],
        { id: 'bad', kind: 'arc', through: [1, 0, 0], end: [2, 0, 0] },
        0.5,
      ),
    ).toThrow(/non-collinear/);
  });
});
