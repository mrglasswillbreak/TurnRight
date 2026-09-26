import { expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import { validCampusBoundary } from '../server/campus-boundary';

const square = (x: number, y: number, width: number) => [
  [x, y],
  [x + width, y],
  [x + width, y + width],
  [x, y + width],
  [x, y],
];
it('accepts campus polygons, courtyards and separated sites', () => {
  expect(
    validCampusBoundary({
      type: 'Polygon',
      coordinates: [square(3, 6, 0.02), square(3.005, 6.005, 0.002)],
    }),
  ).toBe(true);
  expect(
    validCampusBoundary({
      type: 'MultiPolygon',
      coordinates: [[square(3, 6, 0.02)], [square(3.03, 6, 0.01)]],
    }),
  ).toBe(true);
});
it('rejects crossing boundaries, overlapping sites, outside holes and folded edges before campus creation', () => {
  const invalid: Polygon[] = [
    {
      type: 'Polygon',
      coordinates: [
        [
          [3, 6],
          [3.02, 6.02],
          [3.02, 6],
          [3, 6.02],
          [3, 6],
        ],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [square(3, 6, 0.02), square(3.05, 6, 0.01)],
    },
    {
      type: 'Polygon',
      coordinates: [
        [
          [3, 6],
          [3.02, 6],
          [3.01, 6],
          [3.02, 6.02],
          [3, 6.02],
          [3, 6],
        ],
      ],
    },
  ];
  invalid.forEach((geometry) =>
    expect(validCampusBoundary(geometry)).toBe(false),
  );
  expect(
    validCampusBoundary({
      type: 'MultiPolygon',
      coordinates: [[square(3, 6, 0.02)], [square(3.01, 6.01, 0.02)]],
    }),
  ).toBe(false);
});
