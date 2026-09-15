import type { CustomRoof } from './visual-types.js';
import { customRoofSurface } from './custom-roof.js';
import { standardRoofSupported } from './building-surfaces.js';

/** An editable, illustrative ridge plan, never an assertion of surveyed roof geometry.
 * Interior triangle connections keep ridges inside concave outlines and around holes. */
export function proposeHipRoof(
  polygon: number[][][],
  height: number,
): CustomRoof {
  const rise = Math.min(1.8, height * 0.18);
  const roof: CustomRoof = {
    eaves: height - rise,
    points: [],
    lines: [],
    provenance:
      'Approximate hip roof derived from the mapped footprint. Ridge positions, pitch and eaves are illustrative, not surveyed. Total building height and courtyard openings are retained.',
  };
  const flat = customRoofSurface(polygon, { ...roof, eaves: height }, height);
  const origin = polygon[0][0],
    sx = 111195 * Math.cos((origin[1] * Math.PI) / 180),
    sy = 111195;
  const local = (p: number[]) => [
    (p[0] - origin[0]) * sx,
    (p[1] - origin[1]) * sy,
  ];
  const rings = polygon.map((ring) => ring.slice(0, -1).map(local));
  const area = (ring: number[][]) =>
    Math.abs(
      ring.reduce((sum, p, i) => {
        const q = ring[(i + 1) % ring.length];
        return sum + p[0] * q[1] - q[0] * p[1];
      }, 0),
    ) / 2;
  const expected =
    area(rings[0]) - rings.slice(1).reduce((sum, r) => sum + area(r), 0);
  const covered = flat.triangles.reduce(
    (sum, t) => sum + area(t.map((i) => local(flat.points[i]))),
    0,
  );
  if (
    expected < 1 ||
    Math.abs(covered - expected) > Math.max(0.01, expected * 1e-6)
  )
    throw new Error(
      'Review the wing outline and courtyard rings before generating a roof.',
    );
  const distance = (p: number[]) =>
    Math.min(
      ...rings.flatMap((ring) =>
        ring.map((a, i) => {
          const b = ring[(i + 1) % ring.length],
            dx = b[0] - a[0],
            dy = b[1] - a[1];
          const t = Math.max(
            0,
            Math.min(
              1,
              ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy),
            ),
          );
          return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
        }),
      ),
    );
  const clearances: number[] = [];
  const add = (p: number[]) => {
    const found = roof.points.findIndex(
      (q) => Math.hypot(...local(q.coordinates).map((v, i) => v - p[i])) < 1e-6,
    );
    if (found >= 0) return roof.points[found].id;
    const clearance = distance(p);
    if (!Number.isFinite(clearance) || clearance < 0.01)
      throw new Error(
        'This wing is too narrow for an approximate ridge. Draw a custom roof instead.',
      );
    const id = `ridge-point-${roof.points.length}`;
    roof.points.push({
      id,
      coordinates: [origin[0] + p[0] / sx, origin[1] + p[1] / sy],
      elevation: height,
    });
    clearances.push(clearance);
    return id;
  };
  const connect = (from: string, to: string) => {
    if (from !== to)
      roof.lines.push({
        id: `ridge-line-${roof.lines.length}`,
        from,
        to,
        kind: 'ridge',
      });
  };
  const midpoint = (a: number[], b: number[]) =>
    a.map((v, i) => (v + b[i]) / 2);
  if (standardRoofSupported(polygon)) {
    const outer = [...rings[0]];
    if (
      Math.hypot(...outer[1].map((v, i) => v - outer[0][i])) <
      Math.hypot(...outer[2].map((v, i) => v - outer[1][i]))
    )
      outer.push(outer.shift()!);
    const a = midpoint(outer[0], outer[3]),
      b = midpoint(outer[1], outer[2]);
    connect(
      add(a.map((v, i) => v * 0.8 + b[i] * 0.2)),
      add(a.map((v, i) => v * 0.2 + b[i] * 0.8)),
    );
  } else {
    const points = flat.points.map(local);
    const edges = new Map<
      string,
      { a: number; b: number; count: number; point?: string }
    >();
    const key = (a: number, b: number) =>
      [a, b].sort((x, y) => x - y).join(':');
    for (const t of flat.triangles)
      for (let i = 0; i < 3; i++) {
        const a = t[i],
          b = t[(i + 1) % 3],
          k = key(a, b),
          edge = edges.get(k);
        if (edge) edge.count++;
        else edges.set(k, { a, b, count: 1 });
      }
    for (const e of edges.values())
      if (e.count === 2) e.point = add(midpoint(points[e.a], points[e.b]));
    for (const t of flat.triangles) {
      const mids = t
        .map((a, i) => edges.get(key(a, t[(i + 1) % 3]))!.point)
        .filter((p): p is string => !!p);
      if (mids.length === 2) connect(mids[0], mids[1]);
      else if (mids.length === 3 || mids.length === 0) {
        const coords = t.map((i) => points[i]);
        const weights = coords.map((_, i) =>
          Math.hypot(
            ...coords[(i + 1) % 3].map((v, k) => v - coords[(i + 2) % 3][k]),
          ),
        );
        const center = add(
          [0, 1].map(
            (k) =>
              coords.reduce((sum, p, i) => sum + p[k] * weights[i], 0) /
              weights.reduce((a, b) => a + b, 0),
          ),
        );
        for (const m of mids) connect(center, m);
      }
    }
  }
  const widest = Math.max(...clearances);
  roof.points.forEach((p, i) => {
    p.elevation = roof.eaves + (rise * clearances[i]) / widest;
  });
  const result = customRoofSurface(polygon, roof, height);
  if (!result.slopes.some((s) => s > 0.1))
    throw new Error(
      'The proposed roof has no usable slope. Draw a custom roof instead.',
    );
  return roof;
}
