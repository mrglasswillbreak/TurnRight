import { describe, expect, it } from 'vitest';
import { projectedHeading } from '../src/projected-heading';
describe('globe heading projection', () => {
  const flat = ([lng, lat]: [number, number]) => ({ x: lng, y: -lat });
  it('keeps cardinal directions and follows the projected local tangent', () => {
    for (const direction of [0, 90, 180, 270])
      expect(projectedHeading([0, 0], direction, flat)).toBeCloseTo(
        direction,
        4,
      );
    expect(
      projectedHeading([0, 0], 0, ([lng, lat]) => ({ x: lat, y: lng })),
    ).toBeCloseTo(90);
  });
  it('does not flip an eastward arrow across the antimeridian', () => {
    expect(projectedHeading([179.999, 0], 90, flat)).toBeCloseTo(90);
    expect(projectedHeading([-179.999, 0], 270, flat)).toBeCloseTo(270);
  });
  it('handles high latitudes and rejects collapsed or unusable projections', () => {
    expect(Number.isFinite(projectedHeading([30, 89.9], 90, flat))).toBe(true);
    expect(projectedHeading([0, 0], 0, () => ({ x: 2, y: 2 }))).toBeNull();
    expect(projectedHeading([NaN, 0], 0, flat)).toBeNull();
  });
});
