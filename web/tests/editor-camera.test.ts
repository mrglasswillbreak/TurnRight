import { describe, expect, it } from 'vitest';
import { selectionBounds } from '../src/editor-camera';

describe('editor selection framing', () => {
  it('includes the full path, including bends beyond its endpoints', () => {
    expect(
      selectionBounds({
        type: 'LineString',
        coordinates: [
          [3.2, 6.46],
          [3.21, 6.48],
          [3.22, 6.47],
        ],
      }),
    ).toEqual([
      [3.2, 6.46],
      [3.22, 6.48],
    ]);
  });

  it('frames every part of a multipart building', () => {
    expect(
      selectionBounds({
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [3.2, 6.46],
              [3.21, 6.46],
              [3.2, 6.47],
              [3.2, 6.46],
            ],
          ],
          [
            [
              [3.23, 6.48],
              [3.24, 6.48],
              [3.23, 6.49],
              [3.23, 6.48],
            ],
          ],
        ],
      }),
    ).toEqual([
      [3.2, 6.46],
      [3.24, 6.49],
    ]);
  });

  it('handles points and ignores geometry with no usable coordinates', () => {
    expect(
      selectionBounds({ type: 'Point', coordinates: [3.2, 6.46] }),
    ).toEqual([
      [3.2, 6.46],
      [3.2, 6.46],
    ]);
    expect(selectionBounds({ type: 'LineString', coordinates: [] })).toBeNull();
  });
});
