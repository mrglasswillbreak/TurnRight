import type { SurfaceFrame, SurfacePoint } from './model-surface';

const metresPerDegree = (Math.PI / 180) * 6371008.8;
export function surfaceLocal(
  point: SurfacePoint,
  origin: number[],
): [number, number, number] {
  return [
    (point[0] - origin[0]) *
      metresPerDegree *
      Math.cos((origin[1] * Math.PI) / 180),
    (point[1] - origin[1]) * metresPerDegree,
    point[2],
  ];
}

/** Match the SVG's inverse pointer transform, including letterboxing and panel offsets. */
export function surfaceCameraFrame(
  frame: SurfaceFrame,
  origin: number[],
  bounds: { left: number; top: number; width: number; height: number },
) {
  const a = surfaceLocal(frame.origin, origin),
    b = surfaceLocal(frame.x, origin),
    c = surfaceLocal(frame.y, origin);
  const x = b.map((v, i) => v - a[i]),
    y = c.map((v, i) => v - a[i]);
  const sx = (bounds.left + bounds.width / 2 - frame.screen.e) / frame.screen.a;
  const sy = (bounds.top + bounds.height / 2 - frame.screen.f) / frame.screen.d;
  return {
    centre: a.map((v, i) => v + x[i] * sx + y[i] * sy),
    right: x,
    up: y.map((v) => -v),
    width: (bounds.width * Math.hypot(...x)) / Math.abs(frame.screen.a),
    height: (bounds.height * Math.hypot(...y)) / Math.abs(frame.screen.d),
  };
}
