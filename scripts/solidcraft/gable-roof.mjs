import { ShapeUtils, Vector2 } from 'three';

/** Clip both roof slopes to the existing footprint; no new geographic outline. */
export function gableRoof(g, ring, front, height, colour, wallColour) {
  const a = ring[front],
    b = ring[(front + 1) % ring.length];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const coordinate = (p) => (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1];
  const values = ring.map(coordinate),
    lo = Math.min(...values),
    hi = Math.max(...values);
  const ridge = lo + (hi - lo) * 0.47;
  const rise = (x) =>
    100 +
    1500 * (x < ridge ? (x - lo) / (ridge - lo) : (hi - x) / (hi - ridge));
  const split = (points, side) => {
    const result = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i],
        q = points[(i + 1) % points.length];
      const pInside = (coordinate(p) - ridge) * side >= 0,
        qInside = (coordinate(q) - ridge) * side >= 0;
      if (pInside) result.push(p);
      if (pInside !== qInside) {
        const t = (ridge - coordinate(p)) / (coordinate(q) - coordinate(p));
        result.push(p.map((n, j) => n + (q[j] - n) * t));
      }
    }
    return result;
  };
  for (const side of [-1, 1]) {
    const polygon = split(ring, side);
    for (const indices of ShapeUtils.triangulateShape(
      polygon.map((p) => new Vector2(...p)),
      [],
    ))
      g.roofTriangle(
        indices.map((i) => [
          ...polygon[i],
          height + rise(coordinate(polygon[i])),
        ]),
        'H0',
        height,
        colour,
      );
  }
  const area = ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);
  g.setHeight('H0', height);
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i],
      q = ring[(i + 1) % ring.length],
      len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const dir = [(q[0] - p[0]) / len, (q[1] - p[1]) / len],
      normal = area < 0 ? [-dir[1], dir[0]] : [dir[1], -dir[0]];
    const points = [
      [0, 0],
      [len, 0],
      [len, rise(coordinate(q))],
    ];
    const t = (ridge - coordinate(p)) / (coordinate(q) - coordinate(p));
    if (t > 0 && t < 1) points.push([len * t, 1600]);
    points.push([0, rise(coordinate(p))]);
    g.wallProfile(
      { a: p, u: dir, n: normal, inward: area < 0 ? 'positive' : 'negative' },
      0,
      height,
      points,
      120,
      0,
      wallColour,
      'gable_infill',
    );
  }
}
