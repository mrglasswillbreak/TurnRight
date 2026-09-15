import { describe, it, expect } from 'vitest';
import type { MapEdit } from '../src/types';
import {
  buildingTopology,
  remapBuildingSurfaces,
  styleFor,
  resolveBuildingVisual,
} from '../src/building-surfaces';
import { customRoofSurface } from '../src/custom-roof';
import { createBuildingModel } from '../src/building-model';
import { buildingRevision, validBuildingModel } from '../src/building-visuals';
import { validateBuildingStyle } from '../src/building-style-validation';
import { mergeWorkspace } from '../src/editor-conflicts';
import type { Feature, Polygon } from 'geojson';
const ring = [
  [3.2, 6.46],
  [3.2002, 6.46],
  [3.2002, 6.4602],
  [3.2, 6.4602],
  [3.2, 6.46],
];
const feature = (): Feature<Polygon> => ({
  type: 'Feature',
  properties: { id: 'building', kind: 'building', height: 12 },
  geometry: { type: 'Polygon', coordinates: [structuredClone(ring)] },
});
const edit = (): MapEdit => {
  const f = feature();
  return {
    id: 'building',
    kind: 'building',
    properties: { ...f.properties, buildingTopology: buildingTopology(f) },
    geometry: f.geometry,
  };
};
it('previews roofs against resolved visual heights while keeping saved-height validation strict', () => {
  const e = edit();
  const partId = e.properties.buildingTopology!.parts[0].id;
  const reference = resolveBuildingVisual(feature());
  e.properties.height = 0;
  e.properties.appearance = {
    roofs: { [partId]: { eaves: 10.5, points: [], lines: [] } },
  };
  const before = structuredClone(e);
  const f = {
    type: 'Feature' as const,
    geometry: e.geometry as Polygon,
    properties: { ...e.properties, id: e.id },
  };
  const visual = resolveBuildingVisual(f, reference);
  visual.geometryRevision = buildingRevision(f);
  expect(validateBuildingStyle(e)).toContain(
    'Roof eaves must be above ground and within the building height.',
  );
  expect(validateBuildingStyle(e, visual)).toEqual([]);
  expect(validBuildingModel(createBuildingModel(f, visual))).toBe(true);
  expect(e).toEqual(before);
  expect(
    validateBuildingStyle(e, {
      height: 12,
      partHeights: [{ height: 9, kind: 'recorded' }],
    }),
  ).not.toEqual([]);
  e.properties.appearance.parts = { [partId]: { heightMode: 'unknown' } };
  expect(validateBuildingStyle(e, visual)).not.toEqual([]);
  e.properties.appearance.parts[partId] = { heightMode: 'floors', floors: 3 };
  expect(validateBuildingStyle(e, visual)).not.toEqual([]);
  e.properties.appearance.parts[partId] = { heightMode: 'metres', height: 12 };
  expect(validateBuildingStyle(e)).toEqual([]);
});
describe('stable building surfaces', () => {
  it('assigns deterministic identities without changing the source', () => {
    const f = feature(),
      before = structuredClone(f);
    expect(buildingTopology(f)).toEqual(buildingTopology(f));
    expect(f).toEqual(before);
  });
  it('retains wall settings after moving a vertex', () => {
    const e = edit(),
      wall = e.properties.buildingTopology!.parts[0].rings[0].wallIds[0];
    e.properties.appearance = { walls: { [wall]: { wallColour: '#abcdef' } } };
    const geometry = structuredClone(e.geometry) as Polygon;
    geometry.coordinates[0][1][0] += 0.00003;
    const changed = remapBuildingSurfaces(e, geometry);
    expect(
      changed.properties.buildingTopology!.parts[0].rings[0].wallIds[0],
    ).toBe(wall);
    expect(changed.properties.appearance!.walls![wall].wallColour).toBe(
      '#abcdef',
    );
  });
  it('preserves identities when reversing a ring', () => {
    const e = edit();
    const next = remapBuildingSurfaces(e, {
      type: 'Polygon',
      coordinates: [[...ring].reverse()],
    });
    expect(
      new Set(next.properties.buildingTopology!.parts[0].rings[0].wallIds),
    ).toEqual(
      new Set(e.properties.buildingTopology!.parts[0].rings[0].wallIds),
    );
  });
  it('copies a split wall style onto both resulting walls', () => {
    const e = edit(),
      wall = e.properties.buildingTopology!.parts[0].rings[0].wallIds[0];
    e.properties.appearance = { walls: { [wall]: { windowSpacing: 3 } } };
    const next = remapBuildingSurfaces(e, {
      type: 'Polygon',
      coordinates: [[ring[0], [3.2001, 6.46], ...ring.slice(1)]],
    });
    expect(Object.values(next.properties.appearance!.walls!)).toEqual([
      { windowSpacing: 3 },
      { windowSpacing: 3 },
    ]);
  });
  it('requires a choice when differently styled collinear walls are joined', () => {
    const e = edit();
    e.geometry = {
      type: 'Polygon',
      coordinates: [[ring[0], [3.2001, 6.46], ...ring.slice(1)]],
    };
    delete e.properties.buildingTopology;
    e.properties.buildingTopology = buildingTopology({
      type: 'Feature',
      geometry: e.geometry,
      properties: e.properties,
    });
    const walls = e.properties.buildingTopology.parts[0].rings[0].wallIds;
    e.properties.appearance = {
      walls: {
        [walls[0]]: { wallColour: '#ff0000' },
        [walls[1]]: { wallColour: '#0000ff' },
      },
    };
    expect(
      remapBuildingSurfaces(e, { type: 'Polygon', coordinates: [ring] })
        .properties.buildingTopology!.issues,
    ).toHaveLength(1);
  });
  it('resolves wall overrides above wing and building defaults', () => {
    expect(
      styleFor(
        {
          wallColour: '#111111',
          parts: { wing: { wallColour: '#222222' } },
          walls: { wall: { windowSpacing: 2 } },
        },
        undefined,
        'wing',
        'wall',
      ),
    ).toMatchObject({ wallColour: '#222222', windowSpacing: 2 });
  });
  it('merges independent surface fields without overwriting another session', () => {
    const b = edit();
    b.properties.appearance = { wallColour: '#111111' };
    const l = structuredClone(b),
      r = structuredClone(b);
    l.properties.appearance!.wallColour = '#222222';
    r.properties.appearance!.roofColour = '#333333';
    const result = mergeWorkspace([b], [l], [r]);
    expect(result.unresolved).toEqual([]);
    expect(result.edits[0].properties.appearance).toMatchObject({
      wallColour: '#222222',
      roofColour: '#333333',
    });
  });
});
describe('custom roof geometry', () => {
  const roof = () => ({
    eaves: 8,
    points: [
      {
        id: 'a',
        coordinates: [3.2001, 6.46005] as [number, number],
        elevation: 12,
      },
      {
        id: 'b',
        coordinates: [3.2001, 6.46015] as [number, number],
        elevation: 12,
      },
    ],
    lines: [{ id: 'ridge', from: 'a', to: 'b', kind: 'ridge' as const }],
  });
  it('builds a ridge and retains total height and footprint', () => {
    const result = customRoofSurface([ring], roof(), 12);
    expect(result.triangles.length).toBeGreaterThan(2);
    expect(Math.max(...result.points.map((p) => p[2]))).toBe(12);
    expect(result.slopes.some((s) => s > 0)).toBe(true);
  });
  it('keeps courtyard openings free of roof surfaces', () => {
    const hole = [
      [3.20008, 6.46008],
      [3.20012, 6.46008],
      [3.20012, 6.46012],
      [3.20008, 6.46012],
      [3.20008, 6.46008],
    ];
    const result = customRoofSurface(
      [ring, hole],
      { eaves: 8, points: [], lines: [] },
      12,
    );
    for (const tri of result.triangles) {
      const x = tri.reduce((s, i) => s + result.points[i][0], 0) / 3,
        y = tri.reduce((s, i) => s + result.points[i][1], 0) / 3;
      expect(x > 3.20008 && x < 3.20012 && y > 6.46008 && y < 6.46012).toBe(
        false,
      );
    }
  });
  it('rejects incompatible crossing ridge elevations', () => {
    const r = roof();
    r.points.push(
      { id: 'c', coordinates: [3.20005, 6.4601], elevation: 10 },
      { id: 'd', coordinates: [3.20015, 6.4601], elevation: 10 },
    );
    r.lines.push({ id: 'other', from: 'c', to: 'd', kind: 'ridge' });
    expect(() => customRoofSurface([ring], r, 12)).toThrow('incompatible');
  });
  it('rejects roofs outside their wing or above its height', () => {
    const r = roof();
    r.points[0].elevation = 13;
    expect(() => customRoofSurface([ring], r, 12)).toThrow('elevations');
    r.points[0].elevation = 12;
    r.points[0].coordinates = [3.21, 6.47];
    expect(() => customRoofSurface([ring], r, 12)).toThrow('outside');
  });
  it('generates selectable facade and roof surfaces with the shared renderer', () => {
    const f = feature(),
      topology = buildingTopology(f),
      wing = topology.parts[0].id;
    f.properties!.buildingTopology = topology;
    f.properties!.appearance = {
      windows: true,
      windowColour: '#123456',
      roofs: { [wing]: roof() },
    };
    const v = resolveBuildingVisual(f);
    v.geometryRevision = buildingRevision(f);
    const model = createBuildingModel(f, v);
    expect(validBuildingModel(model)).toBe(true);
    expect(model.meshes.some((m) => m.colour === '#123456')).toBe(true);
    expect(
      model.meshes
        .flatMap((m) => m.surfaces || [])
        .some((s) => s.wallId && s.role === 'wall'),
    ).toBe(true);
  });
  it('validates nested facade values before saving', () => {
    const e = edit();
    const id = e.properties.buildingTopology!.parts[0].id;
    e.properties.appearance = {
      parts: { [id]: { windowSpacing: 0, windowColour: 'bad' } },
    };
    expect(validateBuildingStyle(e)).toEqual(
      expect.arrayContaining([
        'Window spacing must be between 0.5 and 20 metres.',
        'Surface colours must be six-digit hex colours.',
      ]),
    );
  });
});
