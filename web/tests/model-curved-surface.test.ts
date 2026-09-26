import { expect, it } from 'vitest';
import { curvedSurface } from '../src/model-curved-surface';
import { wallLength } from '../src/model-authoring';
it('projects curved walls and inverts pointers on the visible section, including reverse courtyard orientation', () => {
  const path = [
    [3.2, 6.46],
    [3.20005, 6.45998],
    [3.2001, 6.46],
    [3.20012, 6.46005],
  ];
  for (const coordinates of [path, [...path].reverse()]) {
    const length = wallLength(coordinates);
    for (let section = 0; section < 3; section++) {
      const view = curvedSurface(coordinates, length, section);
      for (let i = 0; i <= 100; i++) {
        const d = (i * length) / 100;
        if (view.visible(d))
          expect(view.inverse(view.project(d))).toBeCloseTo(d, 6);
      }
      expect(view.frame(view.distances[section], 0)[0]).toBeCloseTo(
        coordinates[section][0],
        8,
      );
    }
  }
});
