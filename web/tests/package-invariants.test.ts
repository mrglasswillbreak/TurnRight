import { describe, expect, it } from 'vitest';
// @ts-expect-error Node-only release verification module.
import { packageInvariants } from '../scripts/package-invariants.mjs';

const fixture = () => ({
  map: {
    features: [
      {
        id: 'building:2',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [3, 6],
              [3.01, 6],
              [3.01, 6.01],
              [3, 6],
            ],
            [
              [3.001, 6.001],
              [3.002, 6.001],
              [3.001, 6.002],
              [3.001, 6.001],
            ],
          ],
        },
        properties: { height: 6, appearance: { colour: '#dddddd' } },
      },
      {
        properties: { id: 'building:1' },
        geometry: { type: 'Point', coordinates: [3.02, 6.02] },
      },
    ],
  },
  boundary: {
    type: 'Polygon',
    coordinates: [
      [
        [3, 6],
        [4, 6],
        [4, 7],
        [3, 6],
      ],
    ],
  },
  graph: {
    version: 1,
    nodes: [
      { id: 'b', lat: 6.01, lon: 3.01 },
      { id: 'a', lat: 6, lon: 3 },
    ],
    edges: [
      { id: 'ba', from: 'b', to: 'a', distance: 10 },
      { id: 'ab', from: 'a', to: 'b', distance: 10 },
    ],
  },
  entrances: [
    { id: 'entry:1', buildingId: 'building:2', nodeId: 'a', verified: false },
  ],
  photos: [
    {
      id: 'photo:1',
      buildingId: 'building:2',
      sha256: 'original',
      attribution: 'Original author',
    },
  ],
  closures: [{ id: 'closure:1', edgeIds: ['ab'], reason: 'Works' }],
  driving: { parking: [{ id: 'park:1', nodeId: 'b' }] },
  accessPolicy: { mode: 'student', verified: false },
  places: [
    {
      id: 'place:1',
      buildingId: 'building:2',
      name: 'Library',
      landmark: { title: 'Library' },
    },
  ],
});

describe('campus publication preservation fingerprints', () => {
  it('ignores presentation and curated landmark metadata without hiding place associations', () => {
    const baseline = fixture();
    const updated = structuredClone(baseline);
    updated.map.features[0].properties.appearance = { colour: '#c0ffee' };
    updated.places[0].landmark = { title: 'Campus landmark' };
    expect(packageInvariants(updated)).toEqual(packageInvariants(baseline));
    updated.places[0].buildingId = 'building:1';
    expect(packageInvariants(updated).places).not.toBe(
      packageInvariants(baseline).places,
    );
  });

  it('ignores record and object-key ordering while retaining stable feature identities', () => {
    const baseline = fixture();
    const reordered = structuredClone(baseline);
    reordered.map.features.reverse();
    reordered.graph.nodes.reverse();
    reordered.graph.edges.reverse();
    reordered.accessPolicy = { verified: false, mode: 'student' };
    expect(packageInvariants(reordered)).toEqual(packageInvariants(baseline));
    reordered.map.features[0].properties.id = 'renamed';
    expect(packageInvariants(reordered).geometry).not.toBe(
      packageInvariants(baseline).geometry,
    );
  });

  it('detects removal of a courtyard and changes to coordinate order', () => {
    const baseline = fixture();
    const updated = structuredClone(baseline);
    updated.map.features[0].geometry.coordinates.pop();
    expect(packageInvariants(updated).geometry).not.toBe(
      packageInvariants(baseline).geometry,
    );
    const reversed = structuredClone(baseline);
    reversed.map.features[0].geometry.coordinates.reverse();
    expect(packageInvariants(reversed).geometry).not.toBe(
      packageInvariants(baseline).geometry,
    );
  });

  it.each([
    [
      'boundary',
      (data: ReturnType<typeof fixture>) => {
        data.boundary.coordinates[0][1][0] += 0.01;
      },
    ],
    [
      'graph',
      (data: ReturnType<typeof fixture>) => {
        data.graph.edges[0].to = 'b';
      },
    ],
    [
      'entrances',
      (data: ReturnType<typeof fixture>) => {
        data.entrances[0].verified = true;
      },
    ],
    [
      'photos',
      (data: ReturnType<typeof fixture>) => {
        data.photos[0].attribution = 'Different author';
      },
    ],
    [
      'closures',
      (data: ReturnType<typeof fixture>) => {
        data.closures[0].edgeIds = ['ba'];
      },
    ],
    [
      'driving',
      (data: ReturnType<typeof fixture>) => {
        data.driving.parking[0].nodeId = 'a';
      },
    ],
    [
      'accessPolicy',
      (data: ReturnType<typeof fixture>) => {
        data.accessPolicy.verified = true;
      },
    ],
    [
      'places',
      (data: ReturnType<typeof fixture>) => {
        data.places[0].name = 'Different destination';
      },
    ],
  ] as const)(
    'detects changed %s in the release comparison',
    (field, mutate) => {
      const baseline = fixture();
      const updated = structuredClone(baseline);
      mutate(updated);
      const before = packageInvariants(baseline);
      const after = packageInvariants(updated);
      expect(after[field]).not.toBe(before[field]);
      expect(Object.keys(after)).toHaveLength(9);
    },
  );
});
