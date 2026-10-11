import type { Feature, Geometry } from 'geojson';
import type { SourceMapRow } from './source-updates';

export const proposalColors = {
  add: '#16815d',
  modify: '#b86d08',
  remove: '#c53c4b',
};
export function proposalFeatures(
  rows: SourceMapRow[],
  showBefore: boolean,
): Feature[] {
  return rows.flatMap((row) => {
    const result: Feature[] = [];
    for (const [side, value] of [
      ['before', row.before],
      ['after', row.after],
    ] as const) {
      if (!value || (side === 'before' && row.kind !== 'remove' && !showBefore))
        continue;
      result.push({
        type: 'Feature',
        geometry: value.geometry,
        properties: {
          proposalId: row.id,
          name: row.name,
          kind: row.kind,
          side,
          color:
            side === 'before' && row.kind !== 'remove'
              ? '#64748b'
              : proposalColors[row.kind],
        },
      });
    }
    return result;
  });
}
export function proposalBounds(
  features: Feature[],
): [[number, number], [number, number]] | null {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const coordinates = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      const [x, y] = value;
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        Math.abs(x) > 180 ||
        Math.abs(y) > 90
      )
        return;
      bounds[0] = Math.min(bounds[0], x);
      bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x);
      bounds[3] = Math.max(bounds[3], y);
    } else value.forEach(coordinates);
  };
  const geometry = (shape: Geometry) => {
    if (shape.type === 'GeometryCollection') shape.geometries.forEach(geometry);
    else coordinates(shape.coordinates);
  };
  features.forEach((f) => geometry(f.geometry));
  return Number.isFinite(bounds[0])
    ? [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ]
    : null;
}
