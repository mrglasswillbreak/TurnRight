import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Feature, Polygon } from 'geojson';
import type {
  BuildingVisual,
  VisualCatalogue,
  SectorModels,
} from '../src/visual-types';
import {
  createBuildingModel,
  footprintAssessment,
} from '../scripts/building-model';
import {
  buildingRevision,
  compatibleVisual,
  detailAtZoom,
  validBuildingModel,
  visibleSectors,
} from '../src/building-visuals';
import { repairArcGisParts } from '../src/arcgis-rings';
import { displayGeometry } from '../src/map-display';

const footprint: Feature<Polygon> = {
  type: 'Feature',
  properties: { id: 'building', floors: 2 },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [3.2, 6.46],
        [3.2002, 6.46],
        [3.2002, 6.4601],
        [3.2, 6.4601],
        [3.2, 6.46],
      ],
    ],
  },
};
const visual: BuildingVisual = {
  id: 'building',
  name: 'Building',
  geometryRevision: buildingRevision(footprint),
  level: 'detailed',
  height: 6,
  heightKind: 'floor-derived',
  floors: 2,
  roofForm: 'flat',
  wallColour: '#eeddbb',
  roofColour: '#886655',
  confidence: 'observed',
  sources: [],
  observed: [],
  inferred: [],
  needed: [],
};
describe('campus architecture', () => {
  it('does not apply the main block height to an undocumented auxiliary part', () => {
    const geometry = {
      type: 'MultiPolygon' as const,
      coordinates: [
        footprint.geometry.coordinates,
        footprint.geometry.coordinates.map((r) =>
          r.map(([x, y]) => [x + 0.001, y]),
        ),
      ],
    };
    const f = { ...footprint, geometry },
      record = {
        ...visual,
        geometryRevision: buildingRevision(f),
        height: 21,
        floors: 7,
        partHeights: [
          { height: 21, kind: 'observed-floors' as const, floors: 7 },
          { height: 6, kind: 'illustrative' as const },
        ],
      };
    const model = createBuildingModel(f, record);
    expect(validBuildingModel(model)).toBe(true);
    const unknown = model.meshes.find((m) => m.colour === '#d4d5c3')!;
    expect(Math.max(...unknown.positions.filter((_, i) => i % 3 === 2))).toBe(
      6,
    );
    const c = {
      schemaVersion: 1 as const,
      revision: 'test',
      bytes: 0,
      buildings: [record],
      sectors: [],
      references: [],
    };
    expect(
      displayGeometry(
        {
          type: 'FeatureCollection',
          features: [
            { ...f, properties: { ...f.properties, kind: 'building' } },
          ],
        },
        c,
      ).features.map((f) => f.properties?.displayHeight),
    ).toEqual([21, 6]);
  });
  it('proposes separate wings without moving vertices or converting real courtyards', () => {
    const f = structuredClone(footprint);
    f.properties!.source = 'arcgis';
    const second = f.geometry.coordinates[0].map(([x, y]) => [x + 0.001, y]);
    f.geometry.coordinates.push(second);
    expect(repairArcGisParts(f)?.coordinates).toEqual([
      [f.geometry.coordinates[0]],
      [second],
    ]);
    f.geometry.coordinates[1] = [
      [3.20005, 6.460025],
      [3.20005, 6.460075],
      [3.20015, 6.460075],
      [3.20015, 6.460025],
      [3.20005, 6.460025],
    ];
    expect(repairArcGisParts(f)).toBeUndefined();
  });
  it.each(['flat', 'hip', 'gable'] as const)(
    'keeps %s roofs within the supported total height and source dimensions',
    (roofForm) => {
      const model = createBuildingModel(footprint, { ...visual, roofForm });
      expect(validBuildingModel(model)).toBe(true);
      const positions = model.meshes.flatMap((m) => m.positions),
        z = positions.filter((_, i) => i % 3 === 2);
      expect(Math.min(...z)).toBe(0);
      expect(Math.max(...z)).toBe(6);
      const walls = model.meshes[0].positions,
        x = walls.filter((_, i) => i % 3 === 0),
        y = walls.filter((_, i) => i % 3 === 1),
        assessment = footprintAssessment(footprint);
      expect(Math.max(...x) - Math.min(...x)).toBeCloseTo(
        assessment.widthMetres,
        2,
      );
      expect(Math.max(...y) - Math.min(...y)).toBeCloseTo(
        assessment.depthMetres,
        2,
      );
    },
  );
  it('triangulates courtyard holes without filling them', () => {
    const f = structuredClone(footprint);
    f.geometry.coordinates.push([
      [3.20005, 6.460025],
      [3.20005, 6.460075],
      [3.20015, 6.460075],
      [3.20015, 6.460025],
      [3.20005, 6.460025],
    ]);
    const roof = createBuildingModel(f, visual).meshes[1];
    let area = 0;
    for (let i = 0; i < roof.indices.length; i += 3) {
      const [a, b, c] = roof.indices
        .slice(i, i + 3)
        .map((n) => roof.positions.slice(n * 3, n * 3 + 3));
      area +=
        Math.abs(
          (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]),
        ) / 2;
    }
    expect(area).toBeCloseTo(footprintAssessment(f).areaSquareMetres, 1);
    expect(footprintAssessment(f).courtyards).toBe(1);
  });
  it('handles clockwise rings and repeated vertices without invalid detail', () => {
    const f = structuredClone(footprint);
    f.geometry.coordinates[0].reverse();
    f.geometry.coordinates[0].splice(1, 0, f.geometry.coordinates[0][0]);
    expect(validBuildingModel(createBuildingModel(f, visual))).toBe(true);
  });
  it('invalidates geometry, height and appearance changes but keeps identity and metadata edits compatible', () => {
    expect(compatibleVisual(footprint, visual)).toBe(true);
    for (const change of [
      { floors: 3 },
      { appearance: { wallColour: '#abcdef' } },
      { height: 20 },
    ])
      expect(
        compatibleVisual(
          { ...footprint, properties: { ...footprint.properties, ...change } },
          visual,
        ),
      ).toBe(false);
    expect(
      compatibleVisual(
        {
          ...footprint,
          properties: { ...footprint.properties, name: 'New name' },
        },
        visual,
      ),
    ).toBe(true);
    const moved = structuredClone(footprint);
    moved.geometry.coordinates[0][0][0] += 0.00001;
    expect(compatibleVisual(moved, visual)).toBe(false);
    const model = createBuildingModel(footprint, visual);
    model.meshes[0].indices[0] = 999999;
    expect(validBuildingModel(model)).toBe(false);
    expect(validBuildingModel({ ...model, origin: [NaN, 0] })).toBe(false);
  });
  it('reduces detail and selects only intersecting sectors', () => {
    const c = JSON.parse(
      readFileSync(
        new URL('../../data/visuals/catalogue.json', import.meta.url),
        'utf8',
      ),
    ) as VisualCatalogue;
    expect(detailAtZoom(14)).toBe('extrusion');
    expect(detailAtZoom(16)).toBe('simplified');
    expect(detailAtZoom(17)).toBe('detailed');
    expect(detailAtZoom(17, true)).toBe('simplified');
    expect(
      visibleSectors(c.sectors, [
        [0, 0],
        [1, 1],
      ]),
    ).toEqual([]);
    expect(visibleSectors(c.sectors, c.sectors[0].bounds)).toContain(
      c.sectors[0],
    );
  });
  it('assesses every building and verifies all published model geometry and hashes', () => {
    const c = JSON.parse(
      readFileSync(
        new URL('../../data/visuals/catalogue.json', import.meta.url),
        'utf8',
      ),
    ) as VisualCatalogue;
    expect(c.buildings).toHaveLength(379);
    expect(new Set(c.buildings.map((b) => b.id)).size).toBe(379);
    let total = 0;
    const ids = new Set<string>();
    for (const sector of c.sectors) {
      const bytes = readFileSync(
        new URL(
          `../../data/visuals/${sector.url.split('/').at(-1)}`,
          import.meta.url,
        ),
      );
      expect(bytes.length).toBe(sector.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        sector.sha256,
      );
      total += bytes.length;
      const payload = JSON.parse(bytes.toString()) as SectorModels;
      for (const model of payload.models) {
        expect(validBuildingModel(model), model.id).toBe(true);
        expect(ids.has(model.id)).toBe(false);
        ids.add(model.id);
        expect(model.geometryRevision).toBe(
          c.buildings.find((b) => b.id === model.id)?.geometryRevision,
        );
      }
    }
    expect(total).toBe(c.bytes);
    expect(total).toBeLessThan(12 * 1024 * 1024);
    expect([...ids].sort()).toEqual(
      c.buildings
        .filter((b) => b.level !== 'extrusion')
        .map((b) => b.id)
        .sort(),
    );
    for (const b of c.buildings) {
      expect(b.footprint?.areaSquareMetres).toBeGreaterThan(0);
      expect(b.observed.length).toBeGreaterThan(0);
      if (b.level !== 'detailed') expect(b.needed.length).toBeGreaterThan(0);
    }
  });
});
