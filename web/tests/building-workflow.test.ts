import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { campusFixture } from './fixture';
import {
  EditorWorkspace,
  type WorkspaceRecovery,
} from '../src/editor-workspace';
import {
  buildingTopology,
  remapBuildingSurfaces,
  resolveBuildingVisual,
  topologyFits,
  resetBuildingAssignments,
} from '../src/building-surfaces';
import { createBuildingModel } from '../src/building-model';
import { buildingRevision, validBuildingModel } from '../src/building-visuals';
import { customRoofSurface } from '../src/custom-roof';
import { mergeWorkspace } from '../src/editor-conflicts';
import { withPublishedVisuals } from '../src/editor-visuals';
import { validateEdit, applyEdits } from '../src/editor-model';
import type { MapEdit } from '../src/types';
import type {
  CustomRoof,
  VisualCatalogue,
  SectorModels,
} from '../src/visual-types';
import type { Feature, Polygon } from 'geojson';
const ring = [
  [3.2, 6.46],
  [3.2002, 6.46],
  [3.2002, 6.4602],
  [3.2, 6.4602],
  [3.2, 6.46],
];
function make(): MapEdit {
  const e: MapEdit = {
    id: 'wing-test',
    kind: 'building',
    geometry: { type: 'Polygon', coordinates: [structuredClone(ring)] },
    properties: { name: 'Test building', height: 12 },
  };
  e.properties.buildingTopology = buildingTopology({
    type: 'Feature',
    geometry: e.geometry,
    properties: { ...e.properties, id: e.id },
  });
  return e;
}
function f(e: MapEdit): Feature<Polygon> {
  return {
    type: 'Feature',
    geometry: e.geometry as Polygon,
    properties: { ...e.properties, id: e.id, kind: e.kind },
  };
}
const roof = (): CustomRoof => ({
  eaves: 8,
  points: [
    { id: 'a', coordinates: [3.2001, 6.46005], elevation: 12 },
    { id: 'b', coordinates: [3.2001, 6.46015], elevation: 12 },
  ],
  lines: [{ id: 'ridge', from: 'a', to: 'b', kind: 'ridge' }],
});

describe('building recovery and merging', () => {
  it('groups one surface field across saves and restores geometry with styles', async () => {
    const base = make(),
      wall = base.properties.buildingTopology!.parts[0].rings[0].wallIds[0];
    let recovery: WorkspaceRecovery | undefined;
    const workspace = new EditorWorkspace(
      [base],
      async (batch) =>
        batch.edits.map((item) => ({ ...item.edit, updated_at: 'saved' })),
      async (r) => {
        recovery = r;
      },
    );
    for (const colour of ['#112233', '#223344', '#334455']) {
      const next = structuredClone(base);
      next.properties.appearance = {
        walls: { [wall]: { wallColour: colour } },
      };
      workspace.commit([next], null, wall + ':wallColour');
      await workspace.flush();
    }
    expect(workspace.past).toHaveLength(1);
    workspace.undo();
    expect(workspace.edits[0].properties.appearance).toBeUndefined();
    workspace.redo();
    expect(
      workspace.edits[0].properties.appearance?.walls?.[wall].wallColour,
    ).toBe('#334455');
    await workspace.preserveRecovery();
    expect(recovery?.future).toEqual([]);
  });
  it('recovers an unfinished roof without sending it, then applies as one undo step', async () => {
    const base = make(),
      part = base.properties.buildingTopology!.parts[0].id;
    let sends = 0;
    const send = async () => {
      sends++;
      return [];
    };
    const workspace = new EditorWorkspace([base], send, async () => {});
    workspace.draftRoof({
      buildingId: base.id,
      partId: part,
      geometryRevision: JSON.stringify(base.geometry),
      roof: roof(),
    });
    await workspace.flush();
    expect(sends).toBe(0);
    expect(workspace.status).toBe('Saved locally');
    const reopened = new EditorWorkspace(
      [base],
      send,
      async () => {},
      workspace.recoveryCopy(),
    );
    expect(reopened.roofDraft?.roof).toEqual(roof());
    const next = structuredClone(base);
    next.properties.appearance = { roofs: { [part]: roof() } };
    reopened.applyRoof(next);
    expect(reopened.past).toHaveLength(1);
    expect(reopened.roofDraft).toBeNull();
    reopened.undo();
    expect(reopened.edits[0].properties.appearance).toBeUndefined();
    expect(reopened.roofDraft).toBeNull();
    reopened.redo();
    expect(reopened.edits[0].properties.appearance?.roofs?.[part]).toEqual(
      roof(),
    );
  });
  it('retains roof recovery for download when browser storage fails', async () => {
    const base = make(),
      workspace = new EditorWorkspace(
        [base],
        async () => [],
        async () => {
          throw new Error('storage unavailable');
        },
      );
    workspace.draftRoof({
      buildingId: base.id,
      partId: base.properties.buildingTopology!.parts[0].id,
      geometryRevision: JSON.stringify(base.geometry),
      roof: roof(),
    });
    expect(await workspace.preserveRecovery()).toBe(false);
    expect(workspace.localBackup('fixture').workspace.roofDraft?.roof).toEqual(
      roof(),
    );
  });
  it('merges simultaneous first-time wall overrides by stable identity', () => {
    const base = make(),
      l = structuredClone(base),
      r = structuredClone(base),
      walls = base.properties.buildingTopology!.parts[0].rings[0].wallIds;
    delete base.properties.buildingTopology;
    l.properties.appearance = {
      walls: { [walls[0]]: { wallColour: '#112233' } },
    };
    r.properties.appearance = { walls: { [walls[1]]: { windowSpacing: 2 } } };
    const result = mergeWorkspace([base], [l], [r]);
    expect(result.unresolved).toEqual([]);
    expect(result.edits[0].properties.appearance?.walls).toEqual({
      ...l.properties.appearance.walls,
      ...r.properties.appearance.walls,
    });
  });
  it('preserves nested removals without resurrecting empty wall records', () => {
    const base = make();
    base.properties.appearance = {
      walls: { front: { windows: true }, back: { windows: true } },
    };
    const local = structuredClone(base),
      remote = structuredClone(base);
    delete local.properties.appearance!.walls!.front;
    remote.properties.appearance!.walls!.back.windows = false;
    const result = mergeWorkspace([base], [local], [remote]);
    expect(result.unresolved).toEqual([]);
    expect(result.edits[0].properties.appearance!.walls).toEqual({
      back: { windows: false },
    });
  });
  it('requires a whole-wall choice when removal conflicts with new details', () => {
    const base = make();
    base.properties.appearance = { walls: { front: { windows: true } } };
    const local = structuredClone(base),
      remote = structuredClone(base);
    delete local.properties.appearance!.walls!.front;
    remote.properties.appearance!.walls!.front.windowSpacing = 3;
    const result = mergeWorkspace([base], [local], [remote]);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].field).toBe('appearance.walls.front');
    expect(result.edits[0].properties.appearance!.walls).toEqual({});
    const kept = mergeWorkspace([base], [local], [remote], {
      [result.unresolved[0].key]: 'server',
    });
    expect(kept.edits[0].properties.appearance!.walls!.front).toEqual({
      windows: true,
      windowSpacing: 3,
    });
  });
  it('chooses geometry and dependent assignments together on concurrent changes', () => {
    const b = make(),
      l = structuredClone(b),
      r = structuredClone(b),
      wall = b.properties.buildingTopology!.parts[0].rings[0].wallIds[0];
    (l.geometry as Polygon).coordinates[0][1][0] += 0.00002;
    r.properties.appearance = { walls: { [wall]: { wallColour: '#112233' } } };
    const review = mergeWorkspace([b], [l], [r]);
    expect(review.unresolved).toHaveLength(1);
    const chosen = mergeWorkspace([b], [l], [r], {
      [review.unresolved[0].key]: 'server',
    });
    expect(chosen.edits[0].geometry).toEqual(r.geometry);
    expect(chosen.edits[0].properties.appearance).toEqual(
      r.properties.appearance,
    );
  });
});
describe('roof and surface integrity', () => {
  it('moves attached and interior roof points with a translated wing', () => {
    const e = make(),
      top = e.properties.buildingTopology!;
    const r = roof();
    r.points.push({
      id: 'bound',
      vertexId: top.parts[0].rings[0].vertexIds[0],
      coordinates: [...ring[0]] as [number, number],
      elevation: 8,
    });
    e.properties.appearance = { roofs: { [top.parts[0].id]: r } };
    const moved = remapBuildingSurfaces(e, {
      type: 'Polygon',
      coordinates: [ring.map((p) => [p[0] + 0.001, p[1] + 0.002])],
    });
    const points = moved.properties.appearance!.roofs![top.parts[0].id].points;
    expect(points[0].coordinates[0]).toBeCloseTo(
      r.points[0].coordinates[0] + 0.001,
      8,
    );
    expect(points[2].coordinates).toEqual([
      ring[0][0] + 0.001,
      ring[0][1] + 0.002,
    ]);
  });
  it('retains IDs when multipart wings are reordered', () => {
    const e = make(),
      other = ring.map((p) => [p[0] + 0.001, p[1]]);
    e.geometry = { type: 'MultiPolygon', coordinates: [[ring], [other]] };
    delete e.properties.buildingTopology;
    e.properties.buildingTopology = buildingTopology(f(e));
    const parts = e.properties.buildingTopology.parts;
    const moved = remapBuildingSurfaces(e, {
      type: 'MultiPolygon',
      coordinates: [[other], [ring]],
    });
    expect(moved.properties.buildingTopology?.parts.map((p) => p.id)).toEqual([
      parts[1].id,
      parts[0].id,
    ]);
  });
  it('normalizes duplicate points and splits compatible crossings', () => {
    const r = roof();
    r.points.push(
      { id: 'c', coordinates: [3.20005, 6.4601], elevation: 12 },
      { id: 'd', coordinates: [3.20015, 6.4601], elevation: 12 },
      { id: 'duplicate', coordinates: [3.20015, 6.4601], elevation: 12 },
    );
    r.lines.push({ id: 'cross', from: 'c', to: 'd', kind: 'valley' });
    const result = customRoofSurface([ring], r, 12);
    expect(
      result.points.filter(
        (p) =>
          Math.abs(p[0] - 3.2001) < 1e-10 && Math.abs(p[1] - 6.4601) < 1e-10,
      ),
    ).toHaveLength(1);
  });
  it('clips concave roofs and rejects a line across a courtyard', () => {
    const concave = [
      ring[0],
      ring[1],
      [3.2002, 6.46008],
      [3.20008, 6.46008],
      [3.20008, 6.4602],
      ring[3],
      ring[0],
    ];
    const result = customRoofSurface(
      [concave],
      { eaves: 8, points: [], lines: [] },
      12,
    );
    for (const tri of result.triangles) {
      const p = tri.map((i) => result.points[i]);
      expect(
        p.reduce((s, p) => s + p[0], 0) / 3 > 3.20008 &&
          p.reduce((s, p) => s + p[1], 0) / 3 > 6.46008,
      ).toBe(false);
    }
    const hole = [
      [3.20008, 6.46008],
      [3.20012, 6.46008],
      [3.20012, 6.46012],
      [3.20008, 6.46012],
      [3.20008, 6.46008],
    ];
    expect(() => customRoofSurface([ring, hole], roof(), 12)).toThrow();
  });
  it('rejects stale attachments, corrupt metadata and impossible roof pitches', () => {
    const e = make(),
      part = e.properties.buildingTopology!.parts[0].id,
      r = roof();
    r.points[0].vertexId = 'removed';
    e.properties.appearance = { roofs: { [part]: r } };
    expect(validateEdit(e).join(' ')).toContain('removed outline vertex');
    const feature = f(make()),
      v = resolveBuildingVisual(feature),
      model = createBuildingModel(feature, v);
    model.meshes[0].surfaces![0].count = 1e8;
    expect(validBuildingModel(model)).toBe(false);
    feature.properties!.appearance = { roofForm: 'gable', roofPitch: 60 };
    expect(() =>
      createBuildingModel(feature, resolveBuildingVisual(feature)),
    ).toThrow('pitch');
  });
});
it('release generator matches the editor for wing, wall and custom roof edits and preserves routing', () => {
  const campus = campusFixture(),
    e = make(),
    top = e.properties.buildingTopology!,
    part = top.parts[0].id,
    wall = top.parts[0].rings[0].wallIds[0];
  campus.map.features = [f(e)];
  e.properties.appearance = {
    windows: true,
    parts: { [part]: { height: 12, roofColour: '#887766' } },
    walls: {
      [wall]: {
        windowColour: '#112233',
        windowSpacing: 2,
        wallColour: '#ab7755',
      },
    },
    roofs: { [part]: roof() },
  };
  const edited = applyEdits(campus, [e]).data;
  expect(edited.graph).toEqual(applyEdits(campus, []).data.graph);
  const feature = edited.map.features.find(
    (f) => f.properties?.id === e.id,
  )! as Feature<Polygon>;
  const temp = mkdtempSync(path.join(tmpdir(), 'turnright-building-test-'));
  try {
    const input = path.join(temp, 'campus.json'),
      output = path.join(temp, 'visuals');
    writeFileSync(input, JSON.stringify(edited));
    execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/build-campus-visuals.ts',
        input,
        output,
        '--reviewed',
      ],
      { cwd: process.cwd(), timeout: 30000, stdio: 'pipe' },
    );
    const catalogue = JSON.parse(
      readFileSync(path.join(output, 'catalogue.json'), 'utf8'),
    ) as VisualCatalogue;
    const sector = JSON.parse(
      readFileSync(
        path.join(output, path.basename(catalogue.sectors[0].url)),
        'utf8',
      ),
    ) as SectorModels;
    const visual = resolveBuildingVisual(feature);
    visual.geometryRevision = buildingRevision(feature);
    expect(sector.models[0]).toEqual(createBuildingModel(feature, visual));
    const published = { ...campus, visuals: catalogue };
    const base = withPublishedVisuals(campus, published);
    expect(base.map).toBe(campus.map);
    expect(base.graph).toBe(campus.graph);
    expect(base.visuals?.buildings).toHaveLength(1);
    const changed = structuredClone(campus);
    (changed.map.features[0].geometry as Polygon).coordinates[0][1][0] += 0.001;
    expect(
      withPublishedVisuals(changed, published).visuals?.buildings,
    ).toHaveLength(0);
  } finally {
    if (
      path.dirname(path.resolve(temp)) === path.resolve(tmpdir()) &&
      path.basename(temp).startsWith('turnright-building-test-')
    )
      rmSync(temp, { recursive: true, force: true });
  }
}, 35000);

describe('appearance edge cases', () => {
  it('resolves changed floor counts before validating and rendering a roof', () => {
    const e = make();
    e.properties.heightMode = 'floors';
    e.properties.floors = 2;
    expect(resolveBuildingVisual(f(e)).height).toBe(6);
    e.properties.appearance = {
      roofs: { [e.properties.buildingTopology!.parts[0].id]: roof() },
    };
    expect(validateEdit(e).join(' ')).toContain('building height');
  });
  it('offers an explicit reset for malformed identities and orphan styles', () => {
    const e = make(),
      part = e.properties.buildingTopology!.parts[0].id;
    e.properties.appearance = {
      wallColour: '#112233',
      parts: { [part]: { windowSpacing: 2 }, removed: { windowSpacing: 3 } },
      roofs: { removed: roof() },
    };
    const reset = resetBuildingAssignments(e, true);
    expect(reset.properties.appearance).toMatchObject({
      wallColour: '#112233',
      parts: { [part]: { windowSpacing: 2 } },
      roofs: {},
    });
    expect(reset.geometry).toEqual(e.geometry);
    expect(e.properties.appearance.parts).toHaveProperty('removed');
    e.properties.buildingTopology!.parts[0].rings = [];
    expect(topologyFits(e.geometry, e.properties.buildingTopology)).toBe(false);
    expect(buildingTopology(f(e)).parts[0].rings).toHaveLength(1);
    const repaired = resetBuildingAssignments(e);
    expect(
      topologyFits(repaired.geometry, repaired.properties.buildingTopology),
    ).toBe(true);
    expect(repaired.properties.appearance).toEqual({ wallColour: '#112233' });
  });
  it('requires review when an ambiguous outline replacement would carry a wing style', () => {
    const e = make(),
      part = e.properties.buildingTopology!.parts[0].id;
    e.properties.appearance = { parts: { [part]: { wallColour: '#112233' } } };
    const changed = remapBuildingSurfaces(e, {
      type: 'Polygon',
      coordinates: [
        ring.map((p) => [
          3.201 + (p[0] - 3.2) * 1.4,
          6.461 + (p[1] - 6.46) * 1.2,
        ]),
      ],
    });
    expect(changed.properties.buildingTopology?.issues?.length).toBeGreaterThan(
      0,
    );
  });
  it('applies a wall override to the triangular gable end as well as the facade', () => {
    const e = make(),
      wall = e.properties.buildingTopology!.parts[0].rings[0].wallIds[0];
    e.properties.appearance = {
      roofForm: 'gable',
      walls: { [wall]: { wallColour: '#ff0033' } },
    };
    const feature = f(e),
      m = createBuildingModel(feature, resolveBuildingVisual(feature)),
      red = m.meshes.find((mesh) => mesh.colour === '#ff0033')!;
    expect(Math.max(...red.positions.filter((_, i) => i % 3 === 2))).toBe(12);
    expect(red.surfaces?.every((s) => s.wallId === wall)).toBe(true);
  });
});
