import type {
  FacadeDescription,
  ModelMesh,
  BuildingSelection,
} from './visual-types.js';
import { textRecipe } from './surface-text.js';
/** Small architectural primitives share one mesh per material and preserve surface picking. */
export function facadeMeshes(
  f: FacadeDescription,
  a: number[],
  b: number[],
  outward: number[],
  eaves: number,
  wallColour: string,
  frameColour = '#d4d4c8',
): ModelMesh[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
    dx = (b[0] - a[0]) / length,
    dy = (b[1] - a[1]) / length;
  const meshes = new Map<string, ModelMesh>();
  const roles = new WeakMap<
    ModelMesh,
    NonNullable<BuildingSelection['role']>
  >();
  let elementId: string | undefined, instanceIndex: number | undefined;
  const point = (x: number, z: number, d: number) =>
    [a[0] + dx * x + outward[0] * d, a[1] + dy * x + outward[1] * d, z].map(
      (n) => Math.round(n * 1000) / 1000,
    );
  const mesh = (
    colour: string,
    role: NonNullable<BuildingSelection['role']>,
  ) => {
    const key = colour + role;
    if (!meshes.has(key))
      meshes.set(key, {
        positions: [],
        indices: [],
        colour,
        detail: true,
        surfaces: [],
      });
    const value = meshes.get(key)!;
    roles.set(value, role);
    return value;
  };
  const face = (m: ModelMesh, p: number[][]) => {
    const s = m.positions.length / 3;
    const start = m.indices.length / 3;
    const last = m.surfaces!.at(-1);
    const role = roles.get(m)!;
    m.positions.push(...p.flat());
    m.indices.push(s, s + 1, s + 2, s, s + 2, s + 3);
    if (
      last &&
      last.elementId === elementId &&
      last.instanceIndex === instanceIndex
    )
      last.count += 2;
    else
      m.surfaces!.push({
        start,
        count: 2,
        partId: f.partId,
        wallId: f.wallId,
        role,
        elementId,
        instanceIndex,
      });
  };
  const box = (
    m: ModelMesh,
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
    offset = 0.025,
  ) => {
    const l = x - w / 2,
      r = x + w / 2,
      t = z + h;
    if (l < -0.03 || r > length + 0.03 || z < 0 || t > eaves + 3)
      throw new Error(
        'A façade detail extends beyond its wall. Review its position, repetitions, and dimensions.',
      );
    const p = [
      point(l, z, offset),
      point(r, z, offset),
      point(r, t, offset),
      point(l, t, offset),
      point(l, z, offset + d),
      point(r, z, offset + d),
      point(r, t, offset + d),
      point(l, t, offset + d),
    ];
    for (const q of [
      [4, 5, 6, 7],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
      [3, 7, 6, 2],
      [0, 1, 5, 4],
    ])
      face(
        m,
        q.map((i) => p[i]),
      );
  };
  if (f.texture) {
    const m = mesh(wallColour, 'wall');
    meshes.delete(wallColour + 'wall');
    meshes.set('texture', m);
    m.texture = f.texture;
    face(m, [
      point(0, 0, 0.02),
      point(length, 0, 0.02),
      point(length, eaves, 0.02),
      point(0, eaves, 0.02),
    ]);
    m.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
  }
  for (const e of f.elements)
    for (let i = 0; i < e.count; i++) {
      elementId = e.id;
      instanceIndex = i;
      const x = (e.x + (i - (e.count - 1) / 2) * e.spacing) * length;
      const m = mesh(
        e.colour,
        e.kind === 'window' ? 'window' : e.kind === 'door' ? 'wall' : 'trim',
      );
      if (e.kind === 'text') {
        const label: ModelMesh = {
          positions: [],
          indices: [],
          colour: '#ffffff',
          detail: true,
          text: textRecipe(e),
          surfaces: [],
          uvs:
            dy * outward[0] - dx * outward[1] < 0
              ? [1, 0, 0, 0, 0, 1, 1, 1]
              : [0, 0, 1, 0, 1, 1, 0, 1],
        };
        roles.set(label, 'trim');
        face(label, [
          point(x - e.width / 2, e.bottom, 0.04),
          point(x + e.width / 2, e.bottom, 0.04),
          point(x + e.width / 2, e.bottom + e.height, 0.04),
          point(x - e.width / 2, e.bottom + e.height, 0.04),
        ]);
        meshes.set(`text:${e.id}:${i}`, label);
      } else if (e.flat) {
        face(m, [
          point(x - e.width / 2, e.bottom, 0.018),
          point(x + e.width / 2, e.bottom, 0.018),
          point(x + e.width / 2, e.bottom + e.height, 0.018),
          point(x - e.width / 2, e.bottom + e.height, 0.018),
        ]);
      } else if (e.kind === 'window' || e.kind === 'door') {
        box(m, x, e.bottom, e.width, e.height, 0.02);
        const frame = mesh(frameColour, 'trim'),
          t = Math.min(0.09, e.width / 8, e.height / 8),
          d = Math.max(0.05, e.depth);
        box(frame, x, e.bottom, e.width, t, d);
        box(frame, x, e.bottom + e.height - t, e.width, t, d);
        box(frame, x - e.width / 2 + t / 2, e.bottom, t, e.height, d);
        box(frame, x + e.width / 2 - t / 2, e.bottom, t, e.height, d);
        if (e.kind === 'window') box(frame, x, e.bottom, t, e.height, d);
      } else if (e.kind === 'balcony') {
        box(m, x, e.bottom, e.width, 0.18, e.depth);
        box(m, x, e.bottom + e.height - 0.07, e.width, 0.07, 0.07, e.depth);
        for (let p = 0; p <= Math.ceil(e.width / 0.8); p++)
          box(
            m,
            x - e.width / 2 + (p * e.width) / Math.ceil(e.width / 0.8),
            e.bottom,
            0.04,
            e.height,
            0.04,
            e.depth,
          );
      } else box(m, x, e.bottom, e.width, e.height, e.depth);
    }
  return [...meshes.values()].filter((m) => m.indices.length);
}
