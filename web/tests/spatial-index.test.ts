import { expect, it } from 'vitest';
import { BoundsIndex } from '../src/spatial-index';

it('queries global overlays without allocating a global campus grid', () => {
  const index = new BoundsIndex<string>();
  index.add([-180, -85, 180, 85], 'world');
  index.add([3.39, 6.51, 3.391, 6.511], 'campus');
  index.add([20, 20, 21, 21], 'distant');
  expect(index.query([3.39, 6.51, 3.391, 6.511])).toEqual(['world', 'campus']);
  expect(index.query([-180, -85, 180, 85])).toEqual(['world', 'campus', 'distant']);
  expect(index.query([170, 89, 171, 90])).toEqual([]);
});
