import type { Position } from "./types.js";
export const distance = (a: Position, b: Position) => {
  const rad = Math.PI / 180;
  return (
    Math.hypot((b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) * rad) / 2), (b[1] - a[1]) * rad) *
    6371000
  );
};
export const bearing = (a: Position, b: Position) => {
  const rad = Math.PI / 180;
  return (
    ((Math.atan2(
      Math.sin((b[0] - a[0]) * rad) * Math.cos(b[1] * rad),
      Math.cos(a[1] * rad) * Math.sin(b[1] * rad) -
        Math.sin(a[1] * rad) * Math.cos(b[1] * rad) * Math.cos((b[0] - a[0]) * rad),
    ) *
      180) /
      Math.PI +
      360) %
    360
  );
};
export function projectSegment(p: Position, a: Position, b: Position) {
  const scale = Math.cos((p[1] * Math.PI) / 180);
  const dx = (b[0] - a[0]) * scale,
    dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * scale * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
  );
  const point: Position = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { point, t, distance: distance(p, point) };
}
export function closestProgress(p: Position, line: Position[], previous = 0) {
  let along = 0,
    best = { distance: Infinity, progress: 0, point: line[0] };
  for (let i = 1; i < line.length; i++) {
    const length = distance(line[i - 1], line[i]);
    const result = projectSegment(p, line[i - 1], line[i]);
    const progress = along + length * result.t;
    const score = result.distance + Math.max(0, previous - progress - 25) * 0.3;
    if (score < best.distance) best = { distance: score, progress, point: result.point };
    along += length;
  }
  return best;
}
export const meters = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)} km` : `${Math.round(n / 5) * 5} m`;
export const minutes = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} min`;
