import Delaunator from 'delaunator';
import Constrainautor from '@kninnug/constrainautor';
import type { CustomRoof } from './visual-types.js';

export interface RoofSurface {
  points: [number, number, number][];
  triangles: number[][];
  slopes: number[];
}
const cross = (a: number[], b: number[], c: number[]) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onEdge = (p: number[], a: number[], b: number[]) =>
  Math.abs(cross(a, b, p)) < 1e-7 &&
  p[0] >= Math.min(a[0], b[0]) - 1e-7 &&
  p[0] <= Math.max(a[0], b[0]) + 1e-7 &&
  p[1] >= Math.min(a[1], b[1]) - 1e-7 &&
  p[1] <= Math.max(a[1], b[1]) + 1e-7;
function inside(p: number[], ring: number[][]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}
/** Constrain before clipping: courtyard and concave boundary edges remain intact. */
export function customRoofSurface(
  polygon: number[][][],
  roof: CustomRoof,
  totalHeight: number,
): RoofSurface {
  if (
    !Number.isFinite(totalHeight) ||
    totalHeight <= 0 ||
    !roof ||
    !Number.isFinite(roof.eaves) ||
    roof.eaves <= 0 ||
    roof.eaves > totalHeight
  )
    throw new Error(
      'Roof eaves must be above ground and within the building height.',
    );
  if (
    !Array.isArray(roof.points) ||
    !Array.isArray(roof.lines) ||
    roof.points.length > 128 ||
    roof.lines.length > 256
  )
    throw new Error(
      'A custom roof supports up to 128 control points and 256 lines.',
    );
  const origin = polygon[0][0],
    sx = 111195 * Math.cos((origin[1] * Math.PI) / 180),
    sy = 111195;
  const local = (p: number[]) => [
    (p[0] - origin[0]) * sx,
    (p[1] - origin[1]) * sy,
  ];
  const rings = polygon.map((r) => r.slice(0, -1).map(local));
  const contains = (p: number[]) =>
    rings.some((r) => r.some((a, i) => onEdge(p, a, r[(i + 1) % r.length]))) ||
    (inside(p, rings[0]) && !rings.slice(1).some((r) => inside(p, r)));
  const points: [number, number, number][] = [],
    constraints: [number, number][] = [];
  const add = (p: number[], height: number) => {
    if (
      p.length !== 2 ||
      !p.every(Number.isFinite) ||
      !Number.isFinite(height) ||
      height < roof.eaves ||
      height > totalHeight
    )
      throw new Error(
        'Roof control points must have valid coordinates and elevations between eaves and total height.',
      );
    if (!contains(p))
      throw new Error(
        'Roof control point is outside this wing or inside a courtyard.',
      );
    const found = points.findIndex(
      (q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6,
    );
    if (found >= 0) {
      if (Math.abs(points[found][2] - height) > 1e-4)
        throw new Error(
          'Intersecting roof lines have incompatible elevations.',
        );
      return found;
    }
    points.push([p[0], p[1], height]);
    return points.length - 1;
  };
  for (const ring of rings) {
    const ids = ring.map((p) => add(p, roof.eaves));
    ids.forEach((a, i) => constraints.push([a, ids[(i + 1) % ids.length]]));
  }
  const ids = new Map<string, number>();
  for (const p of roof.points) {
    if (
      !p ||
      typeof p.id !== 'string' ||
      !p.id ||
      p.id.length > 240 ||
      ids.has(p.id)
    )
      throw new Error('Roof control point identities must be unique.');
    if (
      !Array.isArray(p.coordinates) ||
      p.coordinates.length !== 2 ||
      !p.coordinates.every(Number.isFinite)
    )
      throw new Error(
        'Roof points need finite longitude and latitude coordinates.',
      );
    ids.set(p.id, add(local(p.coordinates), p.elevation));
  }
  const lines = new Set<string>();
  for (const line of roof.lines) {
    const a = ids.get(line.from),
      b = ids.get(line.to);
    if (
      !line.id ||
      lines.has(line.id) ||
      a === undefined ||
      b === undefined ||
      a === b ||
      !['ridge', 'valley'].includes(line.kind)
    )
      throw new Error(
        'Roof lines need unique identities and two different valid endpoints.',
      );
    lines.add(line.id);
    constraints.push([a, b]);
  }
  for (let i = 0; i < constraints.length; i++)
    for (let j = i + 1; j < constraints.length; j++) {
      const [ai, bi] = constraints[i],
        [ci, di] = constraints[j],
        a = points[ai],
        b = points[bi],
        c = points[ci],
        d = points[di];
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        ex = d[0] - c[0],
        ey = d[1] - c[1],
        den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-10) continue;
      const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / den,
        u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / den;
      if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) continue;
      const za = a[2] + t * (b[2] - a[2]),
        zb = c[2] + u * (d[2] - c[2]);
      if (Math.abs(za - zb) > 1e-4)
        throw new Error(
          'Intersecting roof lines have incompatible elevations.',
        );
      add([a[0] + t * dx, a[1] + t * dy], za);
    }
  const edges: [number, number][] = [],
    seen = new Set<string>();
  for (const [ai, bi] of constraints) {
    const a = points[ai],
      b = points[bi],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) throw new Error('Roof line is too short.');
    const indices = points
      .map((p, id) => ({ p, id }))
      .filter(({ p }) => onEdge(p, a, b))
      .sort(
        (x, y) =>
          Math.hypot(x.p[0] - a[0], x.p[1] - a[1]) -
          Math.hypot(y.p[0] - a[0], y.p[1] - a[1]),
      );
    for (let i = 1; i < indices.length; i++) {
      const x = indices[i - 1],
        y = indices[i],
        middle = [(x.p[0] + y.p[0]) / 2, (x.p[1] + y.p[1]) / 2];
      if (!contains(middle))
        throw new Error('Roof line leaves the wing or crosses a courtyard.');
      for (const { p } of [x, y]) {
        const t = Math.hypot(p[0] - a[0], p[1] - a[1]) / length;
        if (Math.abs(p[2] - (a[2] + t * (b[2] - a[2]))) > 1e-4)
          throw new Error(
            'A roof point on a line has an incompatible elevation.',
          );
      }
      const key = [x.id, y.id].sort((a, b) => a - b).join(':');
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([x.id, y.id]);
      }
    }
  }
  const del = Delaunator.from(points);
  // The package exposes ESM at runtime but its TypeScript entry is classified as CJS under NodeNext.
  const Constrain = Constrainautor as unknown as new (
    mesh: ReturnType<typeof Delaunator.from>,
    edges: [number, number][],
  ) => unknown;
  new Constrain(del, edges);
  const triangles: number[][] = [],
    slopes: number[] = [];
  for (let i = 0; i < del.triangles.length; i += 3) {
    const ids = Array.from(del.triangles.slice(i, i + 3)),
      [a, b, c] = ids.map((id) => points[id]);
    const center = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
    if (
      !inside(center, rings[0]) ||
      rings.slice(1).some((r) => inside(center, r))
    )
      continue;
    const area = cross(a, b, c);
    if (Math.abs(area) < 1e-8)
      throw new Error('Roof contains a degenerate surface.');
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    triangles.push(ids);
    slopes.push(
      (Math.atan2(Math.hypot(nx, ny), Math.abs(area)) * 180) / Math.PI,
    );
  }
  if (!triangles.length) throw new Error('Roof has no valid surfaces.');
  return {
    points: points.map((p) => [
      origin[0] + p[0] / sx,
      origin[1] + p[1] / sy,
      p[2],
    ]),
    triangles,
    slopes,
  };
}
