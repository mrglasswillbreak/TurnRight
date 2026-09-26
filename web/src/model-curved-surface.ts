import { alongPath, pathDistances } from './building-curves';
/** Piecewise projection and inverse of an arc-length wall coordinate onto a chosen outside-facing section. */
export function curvedSurface(
  coordinates: number[][],
  length: number,
  section: number,
) {
  const origin = coordinates[0],
    k = (Math.PI / 180) * 6371008.8,
    sx = k * Math.cos((origin[1] * Math.PI) / 180);
  const points = coordinates.map((p) => [
      (p[0] - origin[0]) * sx,
      (p[1] - origin[1]) * k,
    ]),
    { lengths, total } = pathDistances(points),
    distances = [0];
  for (const n of lengths) distances.push(distances.at(-1)! + n);
  const index = Math.max(0, Math.min(lengths.length - 1, section)),
    a = points[index],
    b = points[index + 1],
    unit = [(b[0] - a[0]) / lengths[index], (b[1] - a[1]) / lengths[index]],
    anchor = (distances[index] * length) / total;
  const projected = points.map(
    (p) => anchor + (p[0] - a[0]) * unit[0] + (p[1] - a[1]) * unit[1],
  );
  const facing = (i: number) =>
    (projected[i + 1] - projected[i]) / lengths[i] > 0.15;
  let first = index,
    last = index;
  while (first > 0 && facing(first - 1)) first--;
  while (last < lengths.length - 1 && facing(last + 1)) last++;
  const project = (distance: number) => {
    const at = alongPath(points, (distance * total) / length).point;
    return anchor + (at[0] - a[0]) * unit[0] + (at[1] - a[1]) * unit[1];
  };
  const inverse = (x: number) => {
    for (let i = first; i <= last; i++)
      if (x <= projected[i + 1] || i === last) {
        const fraction = Math.max(
          0,
          Math.min(1, (x - projected[i]) / (projected[i + 1] - projected[i])),
        );
        return ((distances[i] + fraction * lengths[i]) * length) / total;
      }
    return 0;
  };
  return {
    project,
    inverse,
    visible: (d: number) =>
      d >= (distances[first] * length) / total &&
      d <= (distances[last + 1] * length) / total,
    sectionAt: (d: number) => alongPath(points, (d * total) / length).index,
    frame: (x: number, y: number): [number, number, number] => [
      origin[0] + (a[0] + (x - anchor) * unit[0]) / sx,
      origin[1] + (a[1] + (x - anchor) * unit[1]) / k,
      -y,
    ],
    distances: distances.map((n) => (n * length) / total),
    bounds: [projected[first], projected[last + 1]] as [number, number],
  };
}
