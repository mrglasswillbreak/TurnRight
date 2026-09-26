import {
  add3,
  cross3,
  length3,
  normal3,
  scale3,
  sub3,
  type ModelCurve,
  type ModelCurveSegment,
  type Vec3,
} from './model-document.js';
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const tau = Math.PI * 2;
export function curvePoint(
  start: Vec3,
  segment: ModelCurveSegment,
  t: number,
): Vec3 {
  const end = segment.end;
  if (t <= 0) return [...start];
  if (t >= 1) return [...end];
  if (segment.kind === 'line')
    return add3(scale3(start, 1 - t), scale3(end, t));
  if (segment.kind === 'bezier') {
    const u = 1 - t;
    return add3(
      add3(scale3(start, u * u * u), scale3(segment.control1, 3 * u * u * t)),
      add3(scale3(segment.control2, 3 * u * t * t), scale3(end, t * t * t)),
    );
  }
  const b = sub3(segment.through, start),
    c = sub3(end, start),
    axis = normal3(b),
    normal = normal3(cross3(b, c)),
    up = normal3(cross3(normal, axis));
  const bx = length3(b),
    cx = dot(c, axis),
    cy = dot(c, up);
  if (bx < 1e-7 || Math.abs(cy) < 1e-7)
    throw new Error('An arc needs three distinct, non-collinear points.');
  const x = bx / 2,
    y = (cx * cx + cy * cy - bx * cx) / (2 * cy),
    radius = Math.hypot(x, y);
  const a = Math.atan2(-y, -x),
    through = (Math.atan2(-y, bx - x) - a + tau) % tau,
    to = (Math.atan2(cy - y, cx - x) - a + tau) % tau;
  const sweep = through <= to ? to : to - tau,
    angle = a + sweep * t;
  return add3(
    start,
    add3(
      scale3(axis, x + radius * Math.cos(angle)),
      scale3(up, y + radius * Math.sin(angle)),
    ),
  );
}
/** Bounded, deterministic subdivision with <=2 cm midpoint chord error. */
export function sampleCurveSegment(
  start: Vec3,
  segment: ModelCurveSegment,
  tolerance = 0.02,
): { point: Vec3; t: number }[] {
  if (segment.kind === 'line')
    return [
      { point: [...start], t: 0 },
      { point: [...segment.end], t: 1 },
    ];
  let steps = 8;
  while (steps < 512) {
    let error = 0;
    for (let i = 0; i < steps; i++)
      error = Math.max(
        error,
        length3(
          sub3(
            curvePoint(start, segment, (i + 0.5) / steps),
            scale3(
              add3(
                curvePoint(start, segment, i / steps),
                curvePoint(start, segment, (i + 1) / steps),
              ),
              0.5,
            ),
          ),
        ),
      );
    if (error <= tolerance) break;
    steps *= 2;
  }
  return Array.from({ length: steps + 1 }, (_, i) => ({
    point: curvePoint(start, segment, i / steps),
    t: i / steps,
  }));
}
export function curveProfile(curve: ModelCurve): Vec3[] {
  let point = curve.start;
  const points: Vec3[] = [[...point]];
  for (const segment of curve.segments) {
    points.push(
      ...sampleCurveSegment(point, segment)
        .slice(1)
        .map((p) => p.point),
    );
    point = segment.end;
  }
  if (curve.closed && length3(sub3(points[0], points.at(-1)!)) < 1e-7)
    points.pop();
  return points;
}
export function ellipseCurve(
  width: number,
  depth: number,
  height = 0,
): ModelCurve {
  const x = width / 2,
    y = depth / 2,
    k = 0.5522847498307936;
  return {
    start: [x, 0, 0],
    closed: true,
    depth: height,
    segments: [
      {
        id: 'ellipse:0',
        kind: 'bezier',
        control1: [x, y * k, 0],
        control2: [x * k, y, 0],
        end: [0, y, 0],
      },
      {
        id: 'ellipse:1',
        kind: 'bezier',
        control1: [-x * k, y, 0],
        control2: [-x, y * k, 0],
        end: [-x, 0, 0],
      },
      {
        id: 'ellipse:2',
        kind: 'bezier',
        control1: [-x, -y * k, 0],
        control2: [-x * k, -y, 0],
        end: [0, -y, 0],
      },
      {
        id: 'ellipse:3',
        kind: 'bezier',
        control1: [x * k, -y, 0],
        control2: [x, -y * k, 0],
        end: [x, 0, 0],
      },
    ],
  };
}
