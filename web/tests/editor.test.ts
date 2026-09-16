import { describe, it, expect } from 'vitest';
import {
  applyEdits,
  pathWalkingAccess,
  validateEdit,
} from '../src/editor-model';
import { campusFixture } from './fixture';
import { findRoutes } from '../src/routing';
import type { MapEdit } from '../src/types';
const placeEdit: MapEdit = {
  id: 'library',
  kind: 'place',
  geometry: { type: 'Point', coordinates: [3.201, 6.46] },
  properties: { name: 'Verified library name', category: 'library' },
};
describe('editor topology and overrides', () => {
  it('preserves campus access, a missing gate segment, and closure IDs on a rename', () => {
    const base = campusFixture();
    base.graph.edges = base.graph.edges
      .filter((e) => ['ab', 'ba'].includes(e.id))
      .map((e) => ({
        ...e,
        sourceId: 'campus-road',
        walkingAccess: 'campus',
        accessReviewId: 'owner-confirmation',
      }));
    const geometry = {
      type: 'LineString' as const,
      coordinates: ['a', 'b', 'c'].map(
        (id) => base.graph.nodes.find((n) => n.id === id)!.coordinates,
      ),
    };
    base.map.features.push({
      type: 'Feature',
      geometry,
      properties: {
        id: 'campus-road',
        kind: 'path',
        walkingAccess: 'campus',
        sourceTags: { access: 'private' },
      },
    });
    base.closures = [
      { id: 'closed', reason: 'Temporary closure', edgeIds: ['ab', 'ba'] },
    ];
    expect(pathWalkingAccess(base, 'campus-road')).toBe('campus');
    const result = applyEdits(base, [
      {
        id: 'campus-road',
        kind: 'path',
        geometry,
        properties: { name: 'Renamed road' },
      },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.data.graph.edges.map((e) => e.id)).toEqual(['ab', 'ba']);
    expect(
      result.data.graph.edges.every((e) => e.walkingAccess === 'campus'),
    ).toBe(true);
    expect(result.data.map.features[0].properties?.sourceTags.access).toBe(
      'private',
    );
    expect(result.data.closures[0].edgeIds).toEqual(['ab', 'ba']);
  });
  it('keeps explicit administrator restrictions above imported campus permission', () => {
    const base = campusFixture();
    const geometry = {
      type: 'LineString' as const,
      coordinates: base.graph.nodes.slice(0, 2).map((n) => n.coordinates),
    };
    base.map.features.push({
      type: 'Feature',
      geometry,
      properties: { id: 'ab', kind: 'path', walkingAccess: 'campus' },
    });
    const result = applyEdits(base, [
      {
        id: 'ab',
        kind: 'path',
        geometry,
        properties: { name: 'Staff only', access: 'private' },
      },
    ]);
    expect(result.data.graph.edges.find((e) => e.id === 'ab')?.accessible).toBe(
      false,
    );
    expect(pathWalkingAccess(result.data, 'ab')).toBe('private');
    expect(base.graph.edges.find((e) => e.id === 'ab')?.accessible).toBe(true);
    expect(
      pathWalkingAccess(
        { ...base, graph: { ...base.graph, edges: [] } },
        'unknown',
      ),
    ).toBe('private');
    expect(
      validateEdit({
        id: 'ab',
        kind: 'path',
        geometry,
        properties: { name: 'Invalid', access: 'anything' },
      }),
    ).toContain('Choose a supported walking access setting.');
  });
  it('preserves established shared junctions when a path is renamed', () => {
    const base = campusFixture();
    const original = base.graph.edges.find((e) => e.id === 'bc')!;
    original.sourceId = 'existing';
    base.graph.edges.find((e) => e.id === 'cb')!.sourceId = 'existing';
    const coordinates = [original.from, original.to].map(
      (id) => base.graph.nodes.find((n) => n.id === id)!.coordinates,
    );
    const result = applyEdits(base, [
      {
        id: 'existing',
        kind: 'path',
        geometry: { type: 'LineString', coordinates },
        properties: { name: 'Corrected name' },
      },
    ]);
    expect(result.errors).toEqual([]);
    expect(
      result.data.graph.edges
        .filter((e) => e.sourceId === 'existing')
        .map((e) => e.from),
    ).toEqual(expect.arrayContaining([original.from, original.to]));
  });
  it('keeps place and footprint corrections with the same source ID independent', () => {
    const result = applyEdits(campusFixture(), [
      placeEdit,
      {
        id: 'library',
        kind: 'building',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [3.201, 6.46],
              [3.2011, 6.46],
              [3.2011, 6.4601],
              [3.201, 6.46],
            ],
          ],
        },
        properties: { name: 'Library outline', height: 9 },
      },
    ]);
    expect(result.data.places[0].name).toBe('Verified library name');
    expect(
      result.data.map.features.some(
        (f) => f.properties?.name === 'Library outline',
      ),
    ).toBe(true);
  });
  it('invalidates the old approach when a place is moved', () => {
    const result = applyEdits(campusFixture(), [
      {
        ...placeEdit,
        geometry: { type: 'Point', coordinates: [3.202, 6.462] },
      },
    ]);
    expect(result.data.places[0].graphNode).toBeUndefined();
  });
  it('preserves a campus correction when upstream names change', () => {
    const base = campusFixture();
    base.places[0].name = 'Upstream rename';
    const result = applyEdits(base, [placeEdit]);
    expect(result.data.places[0].name).toBe('Verified library name');
    expect(base.places[0].name).toBe('Upstream rename');
  });
  it('joins crossing paths for navigation without a manual connection', () => {
    const edit: MapEdit = {
      id: 'newpath',
      kind: 'path',
      geometry: {
        type: 'LineString',
        coordinates: [
          [3.2003, 6.4599],
          [3.2003, 6.4601],
        ],
      },
      properties: { name: 'New path' },
    };
    const result = applyEdits(campusFixture(), [edit]);
    expect(result.errors).toEqual([]);
    expect(result.warnings.join()).not.toContain('isolated');
    expect(
      findRoutes(result.data, 'a', 'newpath:vertex:1')[0].edgeIds.length,
    ).toBeGreaterThan(1);
  });
  it('rejects false endpoint and entrance connections', () => {
    const path: MapEdit = {
      id: 'newpath',
      kind: 'path',
      geometry: {
        type: 'LineString',
        coordinates: [
          [3.202, 6.462],
          [3.2021, 6.462],
        ],
      },
      properties: { name: 'Invalid link', connectStart: 'a' },
    };
    expect(applyEdits(campusFixture(), [path]).errors.join()).toContain(
      'within 5 m',
    );
    const entrance: MapEdit = {
      id: 'entrance',
      kind: 'entrance',
      geometry: { type: 'Point', coordinates: [3.202, 6.462] },
      properties: { name: 'Entrance', placeId: 'library', connectTo: 'a' },
    };
    expect(applyEdits(campusFixture(), [entrance]).errors.join()).toContain(
      'within 5 m',
    );
  });
  it('blocks both directions and never expires a closure automatically', () => {
    const edit: MapEdit = {
      id: 'closed',
      kind: 'closure',
      geometry: { type: 'Point', coordinates: [3.2005, 6.46] },
      properties: {
        name: 'Construction',
        edgeIds: ['bc'],
        expectedReopening: '2020-01-01',
      },
    };
    const result = applyEdits(campusFixture(), [edit]);
    expect(result.data.closures[0].edgeIds).toEqual(
      expect.arrayContaining(['bc', 'cb']),
    );
    expect(result.data.closures[0].reopenedAt).toBeUndefined();
  });
  it('rejects invalid coordinates, oversized height, and unknown geometry', () => {
    expect(
      validateEdit({
        ...placeEdit,
        geometry: { type: 'Point', coordinates: [Infinity, 6.46] },
      }).length,
    ).toBeGreaterThan(0);
    expect(
      validateEdit({
        ...placeEdit,
        properties: { name: 'Test', height: 999 },
      }).join(),
    ).toContain('height');
  });
});
