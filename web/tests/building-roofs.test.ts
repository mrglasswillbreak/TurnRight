import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Feature, Polygon } from 'geojson';
import type { CampusData } from '../src/types';
import { campusFixture } from './fixture';
import { buildingRoofProposals } from '../src/building-roofs';
import {
  buildingTopology,
  resolveBuildingVisual,
} from '../src/building-surfaces';
import { createBuildingModel } from '../src/building-model';
import { validBuildingModel } from '../src/building-visuals';
import { EditorWorkspace } from '../src/editor-workspace';

const feature = (id = 'b', height = 6): Feature<Polygon> => ({
  type: 'Feature',
  properties: {
    id,
    kind: 'building',
    name: 'Teaching block',
    height,
    heightEstimated: true,
  },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [3.2, 6.46],
        [3.2003, 6.46],
        [3.2003, 6.4601],
        [3.2001, 6.4601],
        [3.2001, 6.4603],
        [3.2, 6.4603],
        [3.2, 6.46],
      ],
    ],
  },
});
const campus = (...features: Feature[]): CampusData => ({
  ...campusFixture(),
  map: { type: 'FeatureCollection', features },
});
describe('reviewed roof batches', () => {
  it('preserves geometry, routing, surfaces and source evidence while adding editable roofs', () => {
    const f = feature();
    f.properties!.appearance = {
      wallColour: '#112233',
      roofColour: '#345678',
      provenance: 'Owner note',
      walls: {
        [buildingTopology(f).parts[0].rings[0].wallIds[0]]: { windows: false },
      },
    };
    const data = campus(f),
      before = structuredClone(data);
    const proposal = buildingRoofProposals(data, [])[0];
    expect(data).toEqual(before);
    expect(proposal.basis).toBe('approximate');
    expect(proposal.edit!.geometry).toEqual(f.geometry);
    expect(proposal.edit!.properties.appearance).toMatchObject(
      f.properties!.appearance,
    );
    const changed = { ...f, properties: proposal.edit!.properties };
    const model = createBuildingModel(changed, resolveBuildingVisual(changed));
    expect(validBuildingModel(model)).toBe(true);
    const roof = model.meshes.find((m) =>
      m.surfaces?.some((s) => s.role === 'roof'),
    )!;
    const heights = roof.positions.filter((_, i) => i % 3 === 2);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(1);
    expect(buildingRoofProposals(campus(changed), [])[0].edit).toBeUndefined();
  });
  it('retains explicit roof choices and rejects unknown heights or competing models', () => {
    const a = feature('a'),
      b = feature('b', 0),
      c = feature('c');
    a.properties!.appearance = { roofForm: 'flat' };
    expect(buildingRoofProposals(campus(a, b), []).every((p) => !p.edit)).toBe(
      true,
    );
    const duplicates = [
      {
        key: 'pair',
        kind: 'building' as const,
        ids: ['a', 'c'],
        names: ['a', 'c'],
        exact: true,
        distance: 0,
        reason: 'overlap',
      },
    ];
    expect(
      buildingRoofProposals(campus(a, c), duplicates).every((p) => !p.edit),
    ).toBe(true);
  });
  it('retains a custom wing roof and adds a roof only to an eligible remaining wing', () => {
    const a = feature();
    const geometry = {
      type: 'MultiPolygon' as const,
      coordinates: [
        a.geometry.coordinates,
        a.geometry.coordinates.map((r) => r.map(([x, y]) => [x + 0.001, y])),
      ],
    };
    const f = { ...a, geometry },
      topology = buildingTopology(f);
    const existing = {
      eaves: 5,
      points: [],
      lines: [],
      provenance: 'Measured owner roof',
    };
    f.properties!.appearance = { roofs: { [topology.parts[0].id]: existing } };
    const proposal = buildingRoofProposals(campus(f), [])[0];
    expect(proposal.roofs).toHaveLength(1);
    expect(proposal.roofs[0].partId).toBe(topology.parts[1].id);
    expect(
      proposal.edit!.properties.appearance!.roofs![topology.parts[0].id],
    ).toEqual(existing);
  });
  it('groups a roof batch into one undo step and preserves it in recovery', () => {
    const data = campus(feature('a'), feature('b'));
    const batch = buildingRoofProposals(data, []).map((p) => p.edit!);
    const workspace = new EditorWorkspace(
      [],
      async (batch) => batch.edits,
      async () => {},
    );
    workspace.commit(batch);
    expect(workspace.edits).toEqual(batch);
    const recovery = workspace.recoveryCopy();
    expect(recovery.edits).toEqual(batch);
    workspace.undo();
    expect(workspace.edits).toEqual([]);
    workspace.redo();
    expect(workspace.edits).toEqual(batch);
  });
  it('keeps known flat/parapet references and flags changed reference geometry', () => {
    const data = JSON.parse(
      readFileSync('../data/seed/campus.json', 'utf8'),
    ) as CampusData;
    const library = data.map.features.find(
      (f) => f.properties?.id === 'arcgis:University_Property:3',
    )!;
    expect(buildingRoofProposals(campus(library), [])[0].reason).toMatch(
      /flat\/parapet/,
    );
    const changed = structuredClone(library) as Feature<Polygon>;
    changed.geometry.coordinates[0][0][0] += 0.001;
    expect(buildingRoofProposals(campus(changed), [])[0].reason).toMatch(
      /footprint changed/,
    );
  });
});
