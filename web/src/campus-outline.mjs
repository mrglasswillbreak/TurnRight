/** Bound directory geometry before handing it to the map worker. */
export function validCampusOutline(value) {
  if (
    !value ||
    !['Polygon', 'MultiPolygon'].includes(value.type) ||
    !Array.isArray(value.coordinates)
  )
    return false;
  const polygons =
    value.type === 'Polygon' ? [value.coordinates] : value.coordinates;
  let vertices = 0;
  return (
    polygons.length > 0 &&
    polygons.length <= 20000 &&
    polygons.every(
      (polygon) =>
        Array.isArray(polygon) &&
        polygon.length > 0 &&
        polygon.length <= 20000 &&
        polygon.every((ring) => {
          if (
            !Array.isArray(ring) ||
            ring.length < 4 ||
            (vertices += ring.length) > 20000
          )
            return false;
          return (
            ring.every(
              (point) =>
                Array.isArray(point) &&
                point.length >= 2 &&
                Number.isFinite(point[0]) &&
                Number.isFinite(point[1]) &&
                Math.abs(point[0]) <= 180 &&
                Math.abs(point[1]) <= 90,
            ) &&
            ring[0][0] === ring.at(-1)[0] &&
            ring[0][1] === ring.at(-1)[1]
          );
        }),
    )
  );
}
