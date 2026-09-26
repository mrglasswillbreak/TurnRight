import { expect, it } from 'vitest';
import { reviewModelWalls } from '../src/model-review';
import { editableFacade, modelFeature } from '../src/model-authoring';
import { campusFixture } from './fixture';
import type { MapEdit } from '../src/types';

const building: MapEdit = {
  id: 'b',
  kind: 'building',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [3, 6],
        [3.0002, 6],
        [3.0002, 6.0002],
        [3, 6.0002],
        [3, 6],
      ],
    ],
  },
  properties: {
    height: 9,
    floors: 3,
    appearance: { windows: true, roofForm: 'flat' },
  },
};
it('reviews eligible recorded walls together and preserves invalid evidence and geometry', () => {
  const feature = modelFeature(building);
  const facades = Object.fromEntries(
    [0, 1, 2, 3].map((i) => {
      const id = `b:wall:0:0:${i}`;
      return [id, { ...editableFacade(feature, id), needsReview: true }];
    }),
  );
  facades['b:wall:0:0:1'].confidence = 'observed';
  facades['b:wall:0:0:2'].elements[0].bottom = 100;
  facades['b:wall:0:0:3'].wallCoordinates[0] = [4, 7];
  const edit = {
    ...building,
    properties: {
      ...building.properties,
      appearance: { ...building.properties.appearance, facades },
    },
  };
  const result = reviewModelWalls(
    edit,
    campusFixture(),
    '2026-09-26T00:00:00Z',
  );
  expect(result.reviewed).toEqual(['b:wall:0:0:0']);
  expect(result.blocked).toHaveLength(3);
  expect(
    result.edit.properties.appearance?.facades?.['b:wall:0:0:0'].reviewedAt,
  ).toBe('2026-09-26T00:00:00Z');
  expect(facades['b:wall:0:0:0'].needsReview).toBe(true);
  expect(result.edit.properties.appearance?.facades?.['b:wall:0:0:1']).toEqual(
    facades['b:wall:0:0:1'],
  );
});
it('does not generate facade records or re-review already approved walls', () => {
  expect(reviewModelWalls(building, campusFixture()).reviewed).toEqual([]);
  const id = 'b:wall:0:0:0';
  const f = {
    ...editableFacade(modelFeature(building), id),
    reviewedAt: '2026-09-25T00:00:00Z',
    needsReview: false,
  };
  const edit = {
    ...building,
    properties: {
      ...building.properties,
      appearance: { facades: { [id]: f } },
    },
  };
  expect(reviewModelWalls(edit, campusFixture()).reviewed).toEqual([]);
});
