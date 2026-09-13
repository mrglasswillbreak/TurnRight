import type { UnfinishedDrawing } from './editor-workspace';
export function drawingProgress(drawing: UnfinishedDrawing | null) {
  const geometry = drawing?.geometry;
  const points =
    geometry?.type === 'LineString'
      ? geometry.coordinates
      : geometry?.type === 'Polygon'
        ? geometry.coordinates[0] || []
        : [];
  const count = points.length;
  const minimum = drawing?.kind === 'building' ? 3 : 2;
  const remaining = Math.max(
    0,
    minimum - new Set(points.map((p) => p.join(','))).size,
  );
  const canFinish =
    !!drawing &&
    ['path', 'barrier', 'building'].includes(drawing.kind) &&
    remaining === 0;
  return {
    count,
    canFinish,
    message: !count
      ? 'Click or tap the map to place the first point.'
      : `${count} ${count === 1 ? 'point' : 'points'} placed. ${canFinish ? 'Finish when the shape is complete.' : `Add at least ${remaining} more ${remaining === 1 ? 'point' : 'points'}.`}`,
  };
}
