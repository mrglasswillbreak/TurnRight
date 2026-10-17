import { describe, expect, it } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import { emptyCampus, lasuCampus } from '../src/campus-context';
import {
  ALL_VISITOR_LAYERS,
  validVisitorLayers,
  visitorPresentation,
} from '../src/visitor-layers';
import {
  generateScenery,
  sceneryContains,
  sceneryRevision,
  validScenery,
} from '../src/campus-scenery';
import {
  constructPoint,
  bearing,
  constrainPoint,
  DEFAULT_PRECISION,
  ReferenceSnapIndex,
  squareRing,
} from '../src/editor-precision';
import { distance } from '../src/geo';
import { runGeometry } from '../src/layer-geometry-engine';
import { presetEdit } from '../src/building-presets';
import { resolveBuildingVisual } from '../src/building-surfaces';
import { buildingRevision, validBuildingModel } from '../src/building-visuals';
import { validateBuildingStyle } from '../src/building-style-validation';
import { createBuildingModel } from '../src/building-model';
import { applyEdits } from '../src/editor-model';

const box = (x = 3.2, y = 6.47, size = 0.002): Polygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y],
    ],
  ],
});
function fixture() {
  const data = emptyCampus(lasuCampus);
  data.map.features = [
    {
      type: 'Feature',
      properties: { id: 'green', kind: 'land', landClass: 'green' },
      geometry: box(),
    },
    {
      type: 'Feature',
      properties: { id: 'building', kind: 'building', name: 'Library' },
      geometry: box(3.2006, 6.4706, 0.0005),
    },
    {
      type: 'Feature',
      properties: { id: 'water', kind: 'land', landClass: 'water' },
      geometry: box(3.2014, 6.4701, 0.0004),
    },
    {
      type: 'Feature',
      properties: { id: 'road', kind: 'land', landClass: 'road' },
      geometry: box(3.2, 6.4714, 0.0005),
    },
  ];
  data.visuals = {
    schemaVersion: 1,
    revision: 'test',
    bytes: 0,
    buildings: [],
    sectors: [],
    references: [],
    scenery: {
      version: 1,
      classification: 'illustrative',
      seed: 7,
      spacing: 12,
      maxInstances: 100,
      regions: [
        {
          featureId: 'green',
          geometryRevision: sceneryRevision(data.map.features[0].geometry),
          reviewedAt: '2026-10-17',
        },
      ],
    },
  };
  return data;
}
describe('campus scenery and visitor presentation', () => {
  it('retains older package defaults and ignores malformed optional recipes', () => {
    expect(validVisitorLayers({ buildings: false, greenery: 'no' })).toEqual({
      ...ALL_VISITOR_LAYERS,
      buildings: false,
    });
    expect(generateScenery(emptyCampus(lasuCampus))).toEqual([]);
    expect(validScenery({ version: 8 })).toBe(false);
  });
  it('is deterministic, bounded, avoids holes, buildings, water and surfaces without mutating source data', () => {
    const data = fixture();
    (data.map.features[0].geometry as Polygon).coordinates.push(
      box(3.2, 6.47, 0.0003).coordinates[0],
    );
    data.visuals!.scenery!.regions[0].geometryRevision = sceneryRevision(
      data.map.features[0].geometry,
    );
    const before = JSON.stringify(data),
      trees = generateScenery(data);
    expect(trees.length).toBeGreaterThan(10);
    expect(trees.length).toBeLessThanOrEqual(100);
    expect(generateScenery(data)).toEqual(trees);
    expect(JSON.stringify(data)).toBe(before);
    for (const tree of trees) {
      expect(
        sceneryContains(tree.coordinates, data.map.features[0].geometry),
      ).toBe(true);
      for (const obstacle of data.map.features.slice(1))
        expect(sceneryContains(tree.coordinates, obstacle.geometry)).toBe(
          false,
        );
    }
  });
  it('rejects stale region geometry and never silently plants elsewhere', () => {
    const data = fixture();
    data.visuals!.scenery!.regions[0].geometryRevision = 'stale';
    expect(generateScenery(data)).toEqual([]);
  });
  it('layer preferences change presentation but retain routing, entrances and selection', () => {
    const data = fixture();
    data.places = [
      {
        id: 'selected',
        name: 'Selected',
        coordinates: [3.2, 6.47],
        category: 'other',
        source: 'test',
      },
      {
        id: 'landmark',
        name: 'Library',
        landmark: true,
        coordinates: [3.2, 6.47],
        category: 'library',
        source: 'test',
      },
    ];
    const next = visitorPresentation(
      data,
      { ...ALL_VISITOR_LAYERS, buildings: false, amenities: false },
      'selected',
    );
    expect(next.graph).toBe(data.graph);
    expect(next.entrances).toBe(data.entrances);
    expect(next.places).toHaveLength(2);
    expect(next.map.features).toHaveLength(3);
    expect(data.map.features).toHaveLength(4);
    expect(visitorPresentation(data, ALL_VISITOR_LAYERS)).toBe(data);
  });
});
describe('precision tools', () => {
  it('constructs metre/bearing input and applies orthogonal constraints', () => {
    const a: [number, number] = [3.2, 6.47],
      b = constructPoint(a, 25, 90);
    expect(distance(a, b)).toBeCloseTo(25, 3);
    expect(bearing(a, b)).toBeCloseTo(90, 3);
    const point = constrainPoint(constructPoint(b, 10, 174), [a, b], {
      ...DEFAULT_PRECISION,
      constraint: 'right-angle',
    });
    expect(bearing(b, point)).toBeCloseTo(180, 2);
    expect(() => constructPoint(a, NaN, 90)).toThrow();
  });
  it('offers endpoint, midpoint and edge snaps without a routing target', () => {
    const feature: Feature = {
      type: 'Feature',
      properties: { id: 'reference' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [3.2, 6.47],
          [3.201, 6.47],
        ],
      },
    };
    const index = new ReferenceSnapIndex([feature]);
    const project = ([x, y]: [number, number]) => ({
      x: x * 100000,
      y: y * 100000,
    });
    for (const [point, kind] of [
      [[3.2, 6.47001], 'endpoint'],
      [[3.2005, 6.47001], 'midpoint'],
      [[3.2003, 6.47001], 'edge'],
    ] as const) {
      const snap = index.snap([...point], project, {
        ...DEFAULT_PRECISION,
        kinds: [kind],
      });
      expect(snap?.kind).toBe(kind);
      expect(snap).not.toHaveProperty('target');
    }
    expect(
      index.snap([3.2, 6.47], project, {
        ...DEFAULT_PRECISION,
        enabled: false,
      }),
    ).toBeUndefined();
    expect(
      index.snap([3.2, 6.47], project, DEFAULT_PRECISION, 'reference'),
    ).toBeUndefined();
  });
  it('squares a ring with the same vertex identities and rejects collapsed shapes', () => {
    const ring = squareRing([
      [0, 0],
      [20, 1],
      [19, 11],
      [1, 10],
      [0, 0],
    ]);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    for (let i = 0; i < 4; i++) {
      const a = ring[i],
        b = ring[(i + 1) % 4],
        c = ring[(i + 2) % 4];
      expect(
        (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]),
      ).toBeCloseTo(0, 6);
    }
  });
  it('snaps only within the reference layer visible zoom range', () => {
    const feature: Feature = {
      type: 'Feature',
      properties: { id: 'zoomed', renderStyle: { minZoom: 17, maxZoom: 21 } },
      geometry: { type: 'Point', coordinates: [3.2, 6.47] },
    };
    const index = new ReferenceSnapIndex([feature]);
    const project = ([x, y]: [number, number]) => ({
      x: x * 100000,
      y: y * 100000,
    });
    expect(
      index.snap([3.2, 6.47], project, DEFAULT_PRECISION, '', 16),
    ).toBeUndefined();
    expect(
      index.snap([3.2, 6.47], project, DEFAULT_PRECISION, '', 18)?.featureId,
    ).toBe('zoomed');
    expect(
      index.snap([3.2, 6.47], project, DEFAULT_PRECISION, '', 21),
    ).toBeUndefined();
  });
  it('previews square and align without changing unrelated multipart rings or the original', () => {
    const data = fixture();
    const hole = box(3.20072, 6.47072, 0.0001).coordinates[0];
    data.map.features[1].geometry = {
      type: 'MultiPolygon',
      coordinates: [
        [...box(3.2006, 6.4706, 0.0005).coordinates, hole],
        box(3.2013, 6.471, 0.0002).coordinates,
      ],
    };
    const before = JSON.stringify(data);
    const result = runGeometry(data, [], {
      operation: 'square',
      keys: ['building:building'],
      part: 0,
      ring: 0,
    });
    expect(JSON.stringify(data)).toBe(before);
    expect(result.edits[0].geometry.type).toBe('MultiPolygon');
    const g = result.edits[0].geometry as GeoJSON.MultiPolygon;
    expect(g.coordinates).toHaveLength(2);
    expect(g.coordinates[0]).toHaveLength(2);
    const applied = applyEdits(data, result.edits);
    expect(
      applied.data.map.features.find((f) => f.properties?.id === 'building')
        ?.geometry.type,
    ).toBe('MultiPolygon');
    expect(
      runGeometry(data, [], {
        operation: 'align',
        keys: ['building:building'],
        bearing: 30,
      }).edits.length,
    ).toBeGreaterThan(0);
  });
  it('rejects offsets that erase a hole', () => {
    const data = fixture();
    (data.map.features[1].geometry as Polygon).coordinates.push(
      box(3.20072, 6.47072, 0.00005).coordinates[0],
    );
    expect(() =>
      runGeometry(data, [], {
        operation: 'offset',
        keys: ['building:building'],
        distance: 10,
      }),
    ).toThrow(/hole/);
  });
});
describe('building appearance authoring', () => {
  it('preserves source dimensions and specific surface assignments across a palette edit', () => {
    const edit = {
      id: 'a',
      kind: 'building' as const,
      geometry: box(),
      properties: {
        height: 10,
        appearance: {
          roofForm: 'flat' as const,
          walls: { side: { wallColour: '#aabbcc' } },
        },
      },
    };
    const next = presetEdit(edit, 'limestone');
    expect(next.properties.height).toBe(10);
    expect(next.geometry).toBe(edit.geometry);
    expect(next.properties.appearance?.walls).toEqual(
      edit.properties.appearance.walls,
    );
    expect(() =>
      presetEdit(
        { ...edit, properties: { authoredModelRevision: 'authored' } },
        'cool',
      ),
    ).toThrow(/Authored/);
  });
  it('changes roof axis, invalidates previous models and checks the resulting pitch', () => {
    const feature: Feature<Polygon> = {
      type: 'Feature',
      geometry: box(3.2, 6.47, 0.0001),
      properties: {
        id: 'roof',
        height: 12,
        appearance: { roofForm: 'gable', roofPitch: 15 },
      },
    };
    feature.geometry.coordinates[0] = feature.geometry.coordinates[0].map(
      ([x, y]) => [3.2 + (x - 3.2) * 2, y],
    );
    const revision = buildingRevision(feature),
      first = createBuildingModel(feature, resolveBuildingVisual(feature));
    feature.properties!.appearance.roofOrientation = 'short';
    expect(buildingRevision(feature)).not.toBe(revision);
    const second = createBuildingModel(feature, resolveBuildingVisual(feature));
    expect(validBuildingModel(second)).toBe(true);
    expect(second.meshes).not.toEqual(first.meshes);
    feature.properties!.appearance.roofPitch = 60;
    expect(
      validateBuildingStyle({
        id: 'roof',
        kind: 'building',
        geometry: feature.geometry,
        properties: feature.properties!,
      }).length,
    ).toBeGreaterThan(0);
  });
});
