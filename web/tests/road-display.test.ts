import { afterEach, expect, it, vi } from 'vitest';
import type { FeatureCollection } from 'geojson';
import { requestRoadDisplay } from '../src/road-display';
afterEach(() => vi.unstubAllGlobals());
it('retains road display when a browser synchronously refuses a worker during reload', async () => {
  vi.stubGlobal(
    'Worker',
    class {
      constructor() {
        throw new DOMException('Document is unloading', 'SecurityError');
      }
    },
  );
  const source: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [3.2, 6.47],
            [3.21, 6.47],
          ],
        },
        properties: { id: 'road', kind: 'path' },
      },
    ],
  };
  const before = structuredClone(source);
  const rendered = await new Promise<FeatureCollection>((resolve) =>
    requestRoadDisplay(source, resolve),
  );
  expect(rendered.features).toHaveLength(1);
  expect(rendered.features[0].geometry).toEqual(source.features[0].geometry);
  expect(source).toEqual(before);
});
