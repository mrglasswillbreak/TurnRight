import {
  BoxGeometry,
  PlaneGeometry,
  CylinderGeometry,
  ConeGeometry,
  SphereGeometry,
  TorusGeometry,
  ShapeUtils,
  Vector2,
  type BufferGeometry,
} from 'three';
import {
  identityTransform,
  modelId,
  type ModelCurve,
  type ModelObject,
  type Vec3,
} from './model-document.js';
import { curveProfile, ellipseCurve } from './model-curves.js';

export type PrimitiveKind =
  | 'box'
  | 'plane'
  | 'cylinder'
  | 'cone'
  | 'sphere'
  | 'torus'
  | 'ellipse';
export function objectFromGeometry(
  geometry: BufferGeometry,
  name: string,
  material = 'default',
  weld = false,
  materialForTriangle?: (triangle: number) => string,
): ModelObject {
  const object: ModelObject = {
    id: modelId(),
    name,
    hidden: false,
    locked: false,
    transform: identityTransform(),
    vertices: {},
    faces: [],
  };
  const position = geometry.getAttribute('position'),
    uv = geometry.getAttribute('uv'),
    normal = geometry.getAttribute('normal'),
    index = geometry.getIndex();
  const ids: string[] = [],
    positions = new Map<string, string>();
  for (let i = 0; i < position.count; i++) {
    const p: Vec3 = [position.getX(i), position.getY(i), position.getZ(i)],
      key = p.map((n) => n.toFixed(7)).join(':');
    const id = (weld && positions.get(key)) || modelId();
    ids.push(id);
    object.vertices[id] = p;
    positions.set(key, id);
  }
  for (let i = 0; i < (index?.count || position.count); i += 3) {
    const corners = [0, 1, 2]
      .map((n) => (index ? index.getX(i + n) : i + n))
      .map((v) => ({
        vertex: ids[v],
        ...(uv ? { uv: [uv.getX(v), uv.getY(v)] as [number, number] } : {}),
        ...(normal
          ? { normal: [normal.getX(v), normal.getY(v), normal.getZ(v)] as Vec3 }
          : {}),
      }));
    if (new Set(corners.map((c) => c.vertex)).size === 3)
      object.faces.push({
        id: modelId(),
        material: materialForTriangle?.(i / 3) || material,
        corners,
      });
  }
  return object;
}
export function curveMesh(
  curve: ModelCurve,
  name: string,
  material = 'default',
): ModelObject {
  if (!curve.closed)
    throw new Error('Close the curve profile before creating its surface.');
  const points = curveProfile(curve);
  if (
    points.length < 3 ||
    points.some((p) => Math.abs(p[2] - points[0][2]) > 0.001)
  )
    throw new Error(
      'A profile needs at least three points on one horizontal plane.',
    );
  const area = ShapeUtils.area(points.map((p) => new Vector2(p[0], p[1])));
  if (Math.abs(area) < 0.0001)
    throw new Error('The curve profile has no surface area.');
  if (points.length > 4096)
    throw new Error('Simplify this profile to at most 4096 generated points.');
  const cross = (a: Vec3, b: Vec3, c: Vec3) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-7)
      throw new Error('Remove overlapping profile points.');
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const c = points[j],
        d = points[(j + 1) % points.length];
      if (
        Math.max(a[0], b[0]) < Math.min(c[0], d[0]) ||
        Math.max(c[0], d[0]) < Math.min(a[0], b[0]) ||
        Math.max(a[1], b[1]) < Math.min(c[1], d[1]) ||
        Math.max(c[1], d[1]) < Math.min(a[1], b[1])
      )
        continue;
      if (
        cross(a, b, c) * cross(a, b, d) <= 0 &&
        cross(c, d, a) * cross(c, d, b) <= 0
      )
        throw new Error(
          'The profile crosses itself. Move its control points before extrusion.',
        );
    }
  }
  if (area < 0) points.reverse();
  const object: ModelObject = {
    id: modelId(),
    name,
    hidden: false,
    locked: false,
    transform: identityTransform(),
    vertices: {},
    faces: [],
  };
  const z = curve.depth;
  const low = points.map((p, i) => {
    const id = `profile:base:${i}`;
    object.vertices[id] = p;
    return id;
  });
  const high =
    z > 0
      ? points.map((p, i) => {
          const id = `profile:top:${i}`;
          object.vertices[id] = [p[0], p[1], p[2] + z];
          return id;
        })
      : low;
  const triangles = ShapeUtils.triangulateShape(
    points.map((p) => new Vector2(p[0], p[1])),
    [],
  );
  const face = (id: string, ids: string[]) => ({
    id,
    material,
    corners: ids.map((vertex) => ({ vertex })),
  });
  triangles.forEach((t, i) => {
    object.faces.push(
      face(
        `profile:top-face:${i}`,
        t.map((v) => high[v]),
      ),
    );
    if (z > 0)
      object.faces.push(
        face(`profile:base-face:${i}`, t.map((v) => low[v]).reverse()),
      );
  });
  if (z > 0)
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      object.faces.push(
        face(`profile:side:${i}`, [low[i], low[j], high[j], high[i]]),
      );
    }
  return object;
}
export function primitive(kind: PrimitiveKind, size = 4): ModelObject {
  if (!Number.isFinite(size) || size <= 0 || size > 500)
    throw new Error('Primitive size must be between zero and 500 metres.');
  if (kind === 'ellipse') {
    const curve = ellipseCurve(size, size * 0.65, 2);
    return { ...curveMesh(curve, 'Ellipse'), curve };
  }
  const geometry =
    kind === 'box'
      ? new BoxGeometry(size, size, size)
      : kind === 'plane'
        ? new PlaneGeometry(size, size)
        : kind === 'cylinder'
          ? new CylinderGeometry(size / 2, size / 2, size, 32)
          : kind === 'cone'
            ? new ConeGeometry(size / 2, size, 32)
            : kind === 'sphere'
              ? new SphereGeometry(size / 2, 24, 16)
              : new TorusGeometry(size * 0.35, size * 0.15, 12, 32);
  if (kind === 'cone' || kind === 'cylinder' || kind === 'sphere')
    geometry.rotateX(Math.PI / 2);
  if (kind !== 'plane') geometry.translate(0, 0, size / 2);
  const object = objectFromGeometry(
    geometry,
    kind[0].toUpperCase() + kind.slice(1),
    'default',
    true,
  );
  geometry.dispose();
  return object;
}
