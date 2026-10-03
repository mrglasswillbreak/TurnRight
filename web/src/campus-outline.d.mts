import type { Polygon, MultiPolygon } from 'geojson';
export function validCampusOutline(
  value: unknown,
): value is Polygon | MultiPolygon;
