import { describe, expect, it } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import type { CampusPhoto, MapEdit } from '../src/types';
import {
  facadeErrors,
  facadeWalls,
  facadeMatches,
  detailRevision,
  validTextureRecipe,
  projectTexture,
  rectifyTexture,
} from '../src/building-facades';
import { createBuildingModel } from '../src/building-model';
import {
  buildingRevision,
  compatibleVisual,
  validBuildingModel,
} from '../src/building-visuals';
import {
  remapBuildingSurfaces,
  resolveBuildingVisual,
} from '../src/building-surfaces';
import type { FacadeDescription } from '../src/visual-types';
const footprint: Feature<Polygon> = {
  type: 'Feature',
  properties: { id: 'building', height: 6, heightMode: 'metres' },
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
const photo = { id: 'photo', buildingId: 'building' } as CampusPhoto;
const wall = facadeWalls(footprint)[0];
const description: FacadeDescription = {
  partId: wall.partId,
  wallId: wall.wallId,
  wallCoordinates: wall.coordinates,
  photoIds: ['photo'],
  confidence: 'observed',
  notes: 'Front elevation; dimensions estimated.',
  reviewedAt: '2026-09-24',
  elements: [
    {
      id: 'window',
      kind: 'window',
      x: 0.5,
      bottom: 1,
      width: 1.5,
      height: 1.5,
      depth: 0.1,
      count: 3,
      spacing: 0.25,
      colour: '#566677',
    },
  ],
  texture: {
    photoId: 'photo',
    corners: [
      [0.1, 0.1],
      [0.9, 0.1],
      [0.9, 0.9],
      [0.1, 0.9],
    ],
  },
};
const feature = () => ({
  ...structuredClone(footprint),
  properties: {
    ...footprint.properties,
    appearance: { facades: { [wall.wallId]: structuredClone(description) } },
  },
});
describe('photographic architecture', () => {
  it('preserves legacy geometry identity but rejects stale detail models', () => {
    const f = feature(),
      base = buildingRevision(f),
      revision = detailRevision(f);
    expect(base).toBe(buildingRevision(footprint));
    f.properties.appearance.facades[wall.wallId].elements[0].width = 2;
    expect(detailRevision(f)).not.toBe(revision);
    expect(buildingRevision(f)).toBe(base);
    const visual = {
      ...resolveBuildingVisual(f),
      geometryRevision: base,
      detailRevision: revision,
    };
    expect(compatibleVisual(f, visual)).toBe(false);
  });
  it('does not rebuild architectural detail for caption or evidence-note edits', () => {
    const f = feature(),
      revision = detailRevision(f);
    f.properties.appearance.facades[wall.wallId].notes =
      'Updated evidence explanation';
    expect(detailRevision(f)).toBe(revision);
  });
  it('builds bounded framed geometry and valid textured UVs with colour fallbacks', () => {
    const f = feature(),
      v = {
        ...resolveBuildingVisual(f),
        geometryRevision: buildingRevision(f),
        detailRevision: detailRevision(f),
      };
    const model = createBuildingModel(f, v);
    expect(validBuildingModel(model)).toBe(true);
    const textured = model.meshes.find((m) => m.texture)!;
    expect(textured.uvs).toHaveLength((textured.positions.length / 3) * 2);
    expect(textured.colour).toMatch(/^#/);
    expect(
      model.meshes.every((m) =>
        m.surfaces?.every((s) => s.partId === wall.partId),
      ),
    ).toBe(true);
    textured.uvs![0] = NaN;
    expect(validBuildingModel(model)).toBe(false);
  });
  it('renders explicit wide glazing ratios instead of retaining the legacy narrow-window cap', () => {
    const f = structuredClone(footprint);
    f.properties!.appearance = { windows: true, windowSpacing: 4, windowWidthRatio: 0.86 };
    const model = createBuildingModel(f, resolveBuildingVisual(f));
    const windows = model.meshes.find(m => m.surfaces?.some(s => s.role === 'window'))!;
    const edgeLengths = windows.indices.filter((_, i) => i % 6 === 0).map((vertex, i) => {
      const next = windows.indices[i * 6 + 1];
      return Math.hypot(...[0, 1, 2].map(axis => windows.positions[vertex * 3 + axis] - windows.positions[next * 3 + axis]));
    });
    expect(Math.max(...edgeLengths)).toBeGreaterThan(3);
    expect(validBuildingModel(model)).toBe(true);
  });
  it('keeps recipes during moved/removed-wall recovery and blocks unreviewed publication', () => {
    const f = feature();
    const edit = {
      id: 'building',
      kind: 'building',
      geometry: f.geometry,
      properties: f.properties,
    } as MapEdit;
    const geometry = structuredClone(f.geometry);
    geometry.coordinates[0][1][0] += 0.00003;
    const remapped = remapBuildingSurfaces(edit, geometry);
    const facade = Object.values(remapped.properties.appearance!.facades!)[0];
    expect(facade.needsReview).toBe(true);
    expect(facade.texture).toEqual(description.texture);
    const changed = {
      ...f,
      geometry,
      properties: { ...remapped.properties, id: 'building' },
    };
    expect(facadeMatches(facade, changed)).toBe(false);
    expect(facadeErrors(changed, [photo], true)).toContain(
      'Review the changed façade assignment before publication.',
    );
    expect(facadeErrors(f, [photo], true)).toEqual([]);
  });
  it('requires source photographs from the same building and rejects malformed dimensions', () => {
    const f = feature();
    expect(
      facadeErrors(f, [{ ...photo, buildingId: 'other' }], true),
    ).toContain('Façade photographs must belong to this building.');
    f.properties.appearance.facades[wall.wallId].elements[0].count = 10000;
    expect(facadeErrors(f, [photo])).not.toEqual([]);
  });
  it('rejects crossed, degenerate and out-of-range texture corners', () => {
    for (const corners of [
      [
        [0, 0],
        [1, 1],
        [1, 0],
        [0, 1],
      ],
      [
        [0, 0],
        [0, 0],
        [1, 1],
        [0, 1],
      ],
      [
        [0, 0],
        [2, 0],
        [1, 1],
        [0, 1],
      ],
    ])
      expect(
        validTextureRecipe({
          photoId: 'photo',
          corners: corners as [number, number][],
        }),
      ).toBe(false);
  });
  it('rectifies without mirroring or inventing pixels', () => {
    const corners: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    expect(projectTexture(corners, 0.25, 0.75)).toEqual([0.25, 0.75]);
    const pixels = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    expect([...rectifyTexture(pixels, 2, 2, corners, 2)]).toEqual([...pixels]);
  });
});
