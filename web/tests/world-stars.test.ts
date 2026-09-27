import { expect, it } from 'vitest';
import { starField, spaceOpacity } from '../src/world-stars';

it('stars are deterministic directions on an infinite sphere with restrained brightness', () => {
  const stars = starField();
  expect(stars).toEqual(starField());
  let north = 0,
    south = 0;
  for (let i = 0; i < stars.length; i += 4) {
    expect(Math.hypot(stars[i], stars[i + 1], stars[i + 2])).toBeCloseTo(1, 5);
    expect(stars[i + 3]).toBeGreaterThanOrEqual(0.42 - 1e-6);
    expect(stars[i + 3]).toBeLessThanOrEqual(1);
    if (stars[i + 1] > 0) north++;
    else south++;
  }
  expect(Math.abs(north - south)).toBeLessThan(150);
  expect([3, 4, 5, 6, 12].map(spaceOpacity)).toEqual([1, 1, 0.5, 0, 0]);
});
