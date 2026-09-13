import { describe, expect, it } from 'vitest';
import { drawingProgress } from '../src/drawing-state';
import type { UnfinishedDrawing } from '../src/editor-workspace';

describe('drawing progress', () => {
  const draft = (points: number[][]): UnfinishedDrawing => ({
    id: 'new-path',
    kind: 'path',
    properties: {},
    geometry: { type: 'LineString', coordinates: points },
  });
  it('starts before the first vertex and requires two distinct vertices', () => {
    expect(drawingProgress(draft([]))).toMatchObject({
      count: 0,
      canFinish: false,
    });
    expect(drawingProgress(draft([[3, 6]]))).toMatchObject({
      count: 1,
      canFinish: false,
    });
    expect(
      drawingProgress(
        draft([
          [3, 6],
          [3, 6],
        ]),
      ),
    ).toMatchObject({ canFinish: false });
    expect(
      drawingProgress(
        draft([
          [3, 6],
          [3, 6],
        ]),
      ).message,
    ).toContain('1 more point');
    expect(
      drawingProgress(
        draft([
          [3, 6],
          [3.1, 6],
        ]),
      ),
    ).toMatchObject({ count: 2, canFinish: true });
  });
  it('requires three distinct vertices for buildings', () => {
    const building: UnfinishedDrawing = {
      ...draft([]),
      kind: 'building',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [3, 6],
            [4, 6],
          ],
        ],
      },
    };
    expect(drawingProgress(building).canFinish).toBe(false);
    building.geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [3, 6],
          [4, 6],
          [4, 7],
        ],
      ],
    };
    expect(drawingProgress(building).canFinish).toBe(true);
  });
});
