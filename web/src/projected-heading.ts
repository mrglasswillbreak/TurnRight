/** Project a short great-circle step so globe arrows follow the local tangent,
 * including near the antimeridian, instead of subtracting camera bearing alone. */
export function projectedHeading(
  coordinates: [number, number],
  degrees: number,
  project: (point: [number, number]) => { x: number; y: number },
): number | null {
  if (![...coordinates, degrees].every(Number.isFinite)) return null;
  const rad = Math.PI / 180,
    lat = coordinates[1] * rad,
    angle = degrees * rad,
    distance = 0.001;
  const nextLat = Math.asin(
    Math.sin(lat) * Math.cos(distance) +
      Math.cos(lat) * Math.sin(distance) * Math.cos(angle),
  );
  const nextLng =
    coordinates[0] +
    Math.atan2(
      Math.sin(angle) * Math.sin(distance) * Math.cos(lat),
      Math.cos(distance) - Math.sin(lat) * Math.sin(nextLat),
    ) /
      rad;
  const a = project(coordinates),
    b = project([nextLng, nextLat / rad]);
  const dx = b.x - a.x,
    dy = b.y - a.y;
  if (![dx, dy].every(Number.isFinite) || Math.hypot(dx, dy) < 1e-7)
    return null;
  return (Math.atan2(dx, -dy) / rad + 360) % 360;
}
