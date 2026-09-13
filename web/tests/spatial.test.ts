import { describe, it, expect } from 'vitest';
import { geometryBlocker, cachedGeometryBlocker } from '../src/spatial';
import { BoundsIndex } from '../src/spatial-index';
import { findRoutes } from '../src/routing';
import { campusFixture } from './fixture';
import type { FeatureCollection } from 'geojson';
const map: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { kind: 'building', id: 'outline' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [3.2004, 6.4599],
            [3.2006, 6.4599],
            [3.2006, 6.4601],
            [3.2004, 6.4601],
            [3.2004, 6.4599],
          ],
        ],
      },
    },
  ],
};
describe('building and barrier conflicts', () => {
  it('reuses obstruction checks for metadata but invalidates changed geometry', () => {
    const first = cachedGeometryBlocker(map);
    const renamed = structuredClone(map);
    renamed.features[0].properties!.name = 'New name';
    renamed.features[0].properties!.height = 12;
    expect(cachedGeometryBlocker(renamed)).toBe(first);
    const second = structuredClone(renamed.features[0]);
    second.properties!.id = 'other';
    renamed.features.push(second);
    const ordered = cachedGeometryBlocker(renamed);
    renamed.features.reverse();
    expect(cachedGeometryBlocker(renamed)).toBe(ordered);
    expect(first([3.201, 6.46], [3.2, 6.46])).toBe('building:outline');
    renamed.features = [];
    const changed = cachedGeometryBlocker(renamed);
    expect(changed).not.toBe(first);
    expect(changed([3.2, 6.46], [3.201, 6.46])).toBeUndefined();
  });
  it('queries cell boundaries without duplicates and retains insertion order', () => {
    const index = new BoundsIndex<string>(1);
    index.add([0, 0, 2, 2], 'large');
    index.add([1, 1, 1, 1], 'junction');
    index.add([4, 4, 5, 5], 'distant');
    expect(index.query([1, 1, 2, 2])).toEqual(['large', 'junction']);
    expect(index.query([3, 3, 3.5, 3.5])).toEqual([]);
  });
  it('detects a path crossing a footprint even when both endpoints are outside', () =>
    expect(geometryBlocker([3.2, 6.46], [3.201, 6.46], map)).toBe(
      'building:outline',
    ));
  it('permits a path alongside an outline', () =>
    expect(
      geometryBlocker([3.2, 6.4602], [3.201, 6.4602], map),
    ).toBeUndefined());
  it('detects unconnected fence crossings', () => {
    const barrier: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'fence', kind: 'barrier' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [3.2005, 6.4599],
              [3.2005, 6.4601],
            ],
          },
        },
      ],
    };
    expect(geometryBlocker([3.2, 6.46], [3.201, 6.46], barrier)).toBe(
      'barrier:fence',
    );
  });
  it('routes around a footprint instead of following the conflicting source path', () => {
    const data = campusFixture();
    data.map = map;
    const route = findRoutes(data, 'a', 'd')[0];
    for (let i = 1; i < route.coordinates.length; i++)
      expect(
        geometryBlocker(route.coordinates[i - 1], route.coordinates[i], map),
      ).toBeUndefined();
  });
});
