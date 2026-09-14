import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Feature, Polygon } from 'geojson';
import type { CampusData, MapEdit } from '../src/types';
import { buildingReferenceProposals } from '../src/building-references';
import {
  buildingTopology,
  resolveBuildingVisual,
} from '../src/building-surfaces';
import { createBuildingModel } from '../src/building-model';
import { buildingRevision, validBuildingModel } from '../src/building-visuals';
import { EditorWorkspace } from '../src/editor-workspace';
import { applyEdits } from '../src/editor-model';
import { campusFixture } from './fixture';

const feature = (id = 'building', height = 6): Feature<Polygon> => ({
  type: 'Feature',
  properties: {
    id,
    kind: 'building',
    name: 'Teaching block',
    height,
    heightEstimated: true,
    source: 'arcgis',
  },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [3.2, 6.46],
        [3.2002, 6.46],
        [3.2002, 6.4602],
        [3.2, 6.4602],
        [3.2, 6.46],
      ],
    ],
  },
});
const campus = (features = [feature()]): CampusData => ({
  ...campusFixture(),
  map: { type: 'FeatureCollection', features },
});
describe('reviewed building reference appearances', () => {
  it('proposes illustrative facades without mutating or changing unknown heights', () => {
    const data = campus([feature(), feature('unknown', 0)]),
      before = structuredClone(data);
    const p = buildingReferenceProposals(data, []);
    expect(data).toEqual(before);
    expect(p[0].edit?.properties.appearance).toMatchObject({
      windows: true,
      windowSpacing: 4,
      confidence: 'inferred',
    });
    expect(p[1].edit).toBeUndefined();
    expect(p[1].reason).toMatch(/Height is unknown/);
    expect(p[0].edit?.geometry).toEqual(data.map.features[0].geometry);
  });
  it('preserves explicit colours, disabled windows, roofs, walls, topology and private draft evidence', () => {
    const f = feature(),
      topology = buildingTopology(f),
      part = topology.parts[0];
    const roof = { eaves: 5, points: [], lines: [] };
    const edit: MapEdit = {
      id: 'building',
      kind: 'building',
      geometry: f.geometry,
      properties: {
        ...f.properties,
        buildingTopology: topology,
        surveyEvidence: { surveyId: 'private-evidence', revisionId: null },
        appearance: {
          wallColour: '#112233',
          windows: false,
          walls: { [part.rings[0].wallIds[0]]: { wallColour: '#334455' } },
          roofs: { [part.id]: roof },
        },
      },
    };
    const p = buildingReferenceProposals(campus(), [], [edit])[0];
    expect(p.edit?.properties).toMatchObject(edit.properties);
    expect(p.edit?.geometry).toEqual(edit.geometry);
    expect(p.fields).not.toContain('wallColour');
    expect(p.fields).not.toContain('windows');
  });
  it('blocks competing models, construction and invalid surface assignments', () => {
    const a = feature('a'),
      b = feature('b'),
      c = feature('c');
    c.properties!.name = 'Building underconstruction';
    const p = buildingReferenceProposals(campus([a, b, c]), [
      {
        key: 'pair',
        kind: 'building',
        ids: ['a', 'b'],
        names: ['a', 'b'],
        exact: true,
        distance: 0,
        reason: 'overlap',
      },
    ]);
    expect(p.every((p) => !p.edit)).toBe(true);
    a.properties!.appearance = { walls: { orphan: { wallColour: '#abcdef' } } };
    expect(buildingReferenceProposals(campus([a]), [])[0].reason).toMatch(
      /surface-assignment/,
    );
  });
  it('matches photographs by footprint and refuses a reused or moved identity', () => {
    const seed = JSON.parse(
      readFileSync('../data/seed/campus.json', 'utf8'),
    ) as CampusData;
    const f = seed.map.features.find(
      (f) => f.properties?.id === 'arcgis:University_Property:44',
    )! as Feature<Polygon>;
    const data = campus([structuredClone(f)]);
    const p = buildingReferenceProposals(data, [])[0];
    expect(p.basis).toBe('photograph');
    expect(p.edit?.properties).toMatchObject({
      floors: 2,
      heightMode: 'floors',
    });
    expect(p.edit?.properties.appearance?.wallColour).toBe('#e0bd7c');
    data.map.features[0].properties!.heightMode = 'unknown';
    expect(buildingReferenceProposals(data, [])[0].edit).toBeUndefined();
    data.map.features[0].geometry = feature().geometry;
    expect(buildingReferenceProposals(data, [])[0].reason).toMatch(
      /footprint has changed/,
    );
  });
  it('applies one recoverable undo batch, preserves drawing state and leaves routing unchanged', async () => {
    const data = campus([feature(), feature('other')]);
    const batch = buildingReferenceProposals(data, []).flatMap((p) =>
      p.edit ? [p.edit] : [],
    );
    const persisted: unknown[] = [];
    const workspace = new EditorWorkspace(
      [],
      async (b) =>
        b.edits.map(({ edit }) => ({ ...edit, updated_at: '2026-09-14' })),
      async (r) => {
        persisted.push(r);
      },
    );
    const unfinished = {
      id: 'path-draft',
      kind: 'path' as const,
      geometry: { type: 'LineString' as const, coordinates: [[3.2, 6.46]] },
      properties: {},
    };
    workspace.draft(unfinished);
    workspace.commit(batch);
    expect(workspace.past).toHaveLength(1);
    expect(workspace.unfinished).toEqual(unfinished);
    expect(applyEdits(data, batch).data.graph).toEqual(
      applyEdits(data, []).data.graph,
    );
    for (const edit of batch) {
      const f = {
        type: 'Feature' as const,
        geometry: edit.geometry,
        properties: edit.properties,
      } as Feature<Polygon>;
      const v = resolveBuildingVisual(f);
      v.geometryRevision = buildingRevision(f);
      expect(validBuildingModel(createBuildingModel(f, v))).toBe(true);
    }
    expect(
      buildingReferenceProposals(
        applyEdits(data, batch).data,
        [],
        batch,
      ).filter((p) => p.edit),
    ).toHaveLength(0);
    workspace.undo();
    expect(workspace.edits).toHaveLength(0);
    workspace.redo();
    expect(workspace.edits).toEqual(batch);
    await workspace.flush();
    expect(persisted.length).toBeGreaterThan(0);
  });
});
