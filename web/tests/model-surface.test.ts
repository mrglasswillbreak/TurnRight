import { describe, expect, it } from 'vitest';
import { OrthographicCamera, Vector3 } from 'three';
import type { Feature, Polygon } from 'geojson';
import { surfaceCameraFrame, surfaceLocal } from '../src/model-surface-frame';
import type { SurfaceFrame } from '../src/model-surface';
import { modelTree, filterModelTree, treeAncestors } from '../src/model-tree';
import {
  facadeWalls,
  facadeErrors,
  detailRevision,
} from '../src/building-facades';
import {
  buildingTopology,
  resolveBuildingVisual,
} from '../src/building-surfaces';
import { emptyAuthoring, wallMetrics } from '../src/model-authoring';
import { createBuildingModel } from '../src/building-model';
import { validBuildingModel } from '../src/building-visuals';
import {
  roofTextErrors,
  validSurfaceText,
  textRecipe,
} from '../src/surface-text';
import type { FacadeElement, RoofText } from '../src/visual-types';

const feature = (): Feature<Polygon> => ({
  type: 'Feature',
  properties: { id: 'test', name: 'Library', height: 9, heightMode: 'metres' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [3.2, 6.46],
        [3.2003, 6.46],
        [3.2003, 6.4603],
        [3.2, 6.4603],
        [3.2, 6.46],
      ],
    ],
  },
});
const label: RoofText = {
  id: 'sign',
  text: 'LIBRARY',
  coordinates: [3.20015, 6.46015],
  width: 5,
  height: 1,
  rotation: 25,
  colour: '#172b36',
};
const detail: FacadeElement = {
  id: 'lettering',
  kind: 'text',
  text: 'Library',
  x: 0.5,
  bottom: 4,
  width: 4,
  height: 1,
  depth: 0,
  count: 1,
  spacing: 0,
  colour: '#ffffff',
};

describe('surface camera mapping', () => {
  for (const kind of ['wall', 'roof', 'footprint'] as const)
    for (const zoom of [1, 1.25, 1.5])
      it(`${kind} matches pointer coordinates at ${zoom} zoom with panel offsets`, () => {
        const origin = [3.2, 6.46],
          k = (Math.PI / 180) * 6371008.8,
          sx = k * Math.cos((origin[1] * Math.PI) / 180);
        const frame: SurfaceFrame = {
          key: 'test',
          kind,
          origin: [...origin, 0] as [number, number, number],
          x: [origin[0] + 1 / sx, origin[1], 0],
          y:
            kind === 'wall'
              ? [origin[0], origin[1], -1]
              : [origin[0], origin[1] - 1 / k, 0],
          screen: { a: 21 / zoom, d: 21 / zoom, e: 312 / zoom, f: 180 / zoom },
        };
        const bounds = {
          left: 260 / zoom,
          top: 140 / zoom,
          width: 780 / zoom,
          height: 550 / zoom,
        };
        const f = surfaceCameraFrame(frame, origin, bounds),
          right = new Vector3(...f.right).normalize(),
          up = new Vector3(...f.up).normalize(),
          normal = right.clone().cross(up).normalize(),
          center = new Vector3(...f.centre);
        const camera = new OrthographicCamera(
          -f.width / 2,
          f.width / 2,
          f.height / 2,
          -f.height / 2,
          0.1,
          10000,
        );
        camera.up.copy(up);
        camera.position.copy(center).addScaledVector(normal, 1000);
        camera.lookAt(center);
        camera.updateMatrixWorld();
        for (const [x, y] of [
          [0, 0],
          [5, -4],
          [12, 3],
        ]) {
          const a = surfaceLocal(frame.origin, origin),
            b = surfaceLocal(frame.x, origin),
            c = surfaceLocal(frame.y, origin);
          const point = new Vector3(
            ...a.map((v, i) => v + (b[i] - v) * x + (c[i] - v) * y),
          ).project(camera);
          expect(bounds.left + ((point.x + 1) * bounds.width) / 2).toBeCloseTo(
            frame.screen.e + x * frame.screen.a,
            5,
          );
          expect(bounds.top + ((1 - point.y) * bounds.height) / 2).toBeCloseTo(
            frame.screen.f + y * frame.screen.d,
            5,
          );
        }
      });
});

it('tree exposes references without duplicating details and reveals selected ancestors', () => {
  const f = feature(),
    walls = facadeWalls(f),
    wall = walls[0],
    authoring = emptyAuthoring();
  authoring.groups = [
    { id: 'g', wallId: wall.wallId, name: 'Windows', members: [detail.id] },
  ];
  const nodes = modelTree({
    name: 'Library',
    topology: buildingTopology(f),
    walls,
    facades: {},
    authoring,
    activeWall: wall.wallId,
    elements: [detail],
    locked: [detail.id],
    hidden: [],
    roofTexts: { [wall.partId]: [label] },
  });
  const key = `detail:${wall.wallId}:${detail.id}`;
  expect(treeAncestors(nodes, [key])).toContain(`details:${wall.wallId}`);
  expect(treeAncestors(nodes, [key])).toContain('building');
  expect(JSON.stringify(filterModelTree(nodes, 'Library'))).toContain(
    'roof-text:sign',
  );
  const matches = filterModelTree(nodes, 'lettering');
  expect(matches).toHaveLength(0);
  const filtered = filterModelTree(nodes, 'Text · Library');
  expect(JSON.stringify(filtered)).toContain(`group:g:${key}`);
  expect(detail).not.toHaveProperty('children');
});

it('wall and roof lettering survive saved JSON and produce bounded pickable textured meshes', () => {
  const f = feature(),
    wall = facadeWalls(f)[0];
  f.properties!.appearance = {
    roofTexts: { [wall.partId]: [label] },
    facades: {
      [wall.wallId]: {
        partId: wall.partId,
        wallId: wall.wallId,
        wallCoordinates: wall.coordinates,
        elements: [detail],
        confidence: 'inferred',
        notes: '',
        photoIds: [],
      },
    },
  };
  expect(facadeErrors(f)).toEqual([]);
  const saved = JSON.parse(JSON.stringify(f));
  const model = createBuildingModel(saved, resolveBuildingVisual(saved));
  expect(validBuildingModel(model)).toBe(true);
  const meshes = model.meshes.filter((m) => m.text);
  expect(meshes).toHaveLength(2);
  expect(meshes.flatMap((m) => m.surfaces!.map((s) => s.elementId))).toEqual(
    expect.arrayContaining(['lettering', 'sign']),
  );
  for (const m of meshes) {
    expect(m.uvs!.length).toBe((m.positions.length / 3) * 2);
    expect(m.indices.length).toBeLessThanOrEqual(16 * 8 * 6);
  }
  const revision = detailRevision(saved);
  saved.properties.appearance.roofTexts[wall.partId][0].text = 'NEW NAME';
  expect(detailRevision(saved)).not.toBe(revision);
});

it('roof lettering rejects boundaries, enclosed courtyards, malformed content and missing wings', () => {
  const f = feature(),
    part = buildingTopology(f).parts[0];
  const set = (t: RoofText) => {
    f.properties!.appearance = { roofTexts: { [part.id]: [t] } };
    return roofTextErrors(f);
  };
  expect(set(label)).toEqual([]);
  expect(set({ ...label, coordinates: [3.2, 6.46] }).length).toBeGreaterThan(0);
  f.geometry.coordinates.push([
    [3.200149, 6.460149],
    [3.200151, 6.460149],
    [3.200151, 6.460151],
    [3.200149, 6.460151],
    [3.200149, 6.460149],
  ]);
  expect(set(label).join(' ')).toContain('courtyard');
  expect(set({ ...label, text: '' }).length).toBeGreaterThan(0);
  expect(
    validSurfaceText(textRecipe({ ...label, text: 'x'.repeat(161) })),
  ).toBe(false);
  expect(
    validSurfaceText(textRecipe({ ...label, text: '<b>plain text</b>' })),
  ).toBe(true);
  f.properties!.appearance = { roofTexts: { missing: [label] } };
  expect(roofTextErrors(f).length).toBeGreaterThan(0);
});

it('roof lettering follows the actual roof planes on both sides of a ridge', () => {
  const f = feature(),
    part = buildingTopology(f).parts[0];
  f.properties!.appearance = {
    roofForm: 'gable',
    roofPitch: 25,
    roofTexts: { [part.id]: [{ ...label, width: 20, height: 20 }] },
  };
  const model = createBuildingModel(f, resolveBuildingVisual(f));
  const lettering = model.meshes.find((m) => m.text)!;
  expect(
    new Set(
      lettering.positions
        .filter((_, i) => i % 3 === 2)
        .map((z) => z.toFixed(4)),
    ).size,
  ).toBeGreaterThan(1);
  expect(validBuildingModel(model)).toBe(true);
});

it('draft preview renders unreviewed lettering without approving or publishing it', () => {
  const f = feature(),
    wall = facadeWalls(f)[0];
  f.properties!.appearance = {
    facades: {
      [wall.wallId]: {
        ...wall,
        wallCoordinates: wall.coordinates,
        elements: [detail],
        confidence: 'inferred',
        notes: '',
        photoIds: [],
        needsReview: true,
      },
    },
  };
  const visual = resolveBuildingVisual(f);
  expect(createBuildingModel(f, visual).meshes.some((m) => m.text)).toBe(false);
  const preview = createBuildingModel(f, visual, { previewUnreviewed: true });
  expect(preview.meshes.some((m) => m.text?.text === 'Library')).toBe(true);
  expect(f.properties!.appearance.facades[wall.wallId].needsReview).toBe(true);
});

it('front elevations face outside for either outer and courtyard ring winding', () => {
  for (const reversed of [false, true]) {
    const f = feature();
    f.geometry.coordinates.push([
      [3.2001, 6.4601],
      [3.2001, 6.4602],
      [3.2002, 6.4602],
      [3.2002, 6.4601],
      [3.2001, 6.4601],
    ]);
    if (reversed) f.geometry.coordinates.forEach((r) => r.reverse());
    for (const wall of facadeWalls(f)) {
      const metrics = wallMetrics(f, wall.wallId);
      expect(metrics.reverse).toBe(reversed);
      const ends = metrics.reverse
        ? [...wall.coordinates].reverse()
        : wall.coordinates;
      const a = ends[0],
        b = ends[1],
        mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const outward = [b[1] - a[1], a[0] - b[0]];
      const towardCentre = [3.20015 - mid[0], 6.46015 - mid[1]];
      const courtyard = wall.label.includes('courtyard');
      expect(
        outward[0] * towardCentre[0] + outward[1] * towardCentre[1] > 0,
      ).toBe(courtyard);
    }
  }
});
