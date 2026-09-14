import type { Geometry } from 'geojson';
import { canonical } from './editor-conflicts';
function payload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const object = value as Record<string, unknown>;
  return object.payload && typeof object.payload === 'object'
    ? (object.payload as Record<string, unknown>)
    : object;
}
export function sourceGeometry(value: unknown): Geometry | undefined {
  const p = payload(value);
  if (p.geometry && typeof p.geometry === 'object')
    return p.geometry as Geometry;
  if (Array.isArray(p.coordinates) && typeof p.coordinates[0] === 'number')
    return { type: 'Point', coordinates: p.coordinates as number[] };
}
function fields(value: unknown) {
  const p = payload(value),
    values: Record<string, unknown> = {};
  const flatten = (
    object: Record<string, unknown>,
    prefix = '',
    root = false,
  ) => {
    for (const [key, value] of Object.entries(object)) {
      if (root && ['geometry', 'coordinates', 'type'].includes(key)) continue;
      const name = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value))
        flatten(
          value as Record<string, unknown>,
          key === 'properties' ? prefix : name,
        );
      else values[name] = value;
    }
  };
  flatten(p, '', true);
  return values;
}
export function sourceComparison(before: unknown, after: unknown) {
  const b = fields(before),
    a = fields(after);
  return {
    fields: [...new Set([...Object.keys(b), ...Object.keys(a)])]
      .sort()
      .filter((key) => canonical(b[key]) !== canonical(a[key]))
      .map((key) => ({ key, before: b[key], after: a[key] })),
    geometryChanged:
      canonical(sourceGeometry(before)) !== canonical(sourceGeometry(after)),
  };
}
