import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import {
  chooseModelLod,
  detailedAssets,
  detailedManifestMatches,
  detailedResidentBytes,
  validDetailedModel,
} from '../src/model-lod';
import {
  buildDetailedModel,
  modelMeshChunk,
} from '../scripts/build-detailed-models';
import { compileModelDocument } from '../src/model-document-compiler';
import { validBuildingModel } from '../src/building-visuals';
import { detailFixture } from './model-detail-fixture';
import { campusFixture } from './fixture';
import type { CampusPackage } from '../src/types';

it('selects one-pixel detail and uses a coarser fallback under frame pressure', () => {
  const { descriptor } = detailFixture();
  expect(chooseModelLod(descriptor, 20).level).toBe(0);
  expect(chooseModelLod(descriptor, 5).level).toBe(1);
  expect(chooseModelLod(descriptor, 0.5).level).toBe(2);
  expect(chooseModelLod(descriptor, 20, true).level).toBe(1);
  const sha256 = 'a'.repeat(64);
  descriptor.textures.push({
    url: `/packages/model-texture-${sha256}.png`,
    sha256,
    bytes: 10,
    width: 1024,
    height: 1024,
    contentType: 'image/png',
  });
  expect(
    detailedResidentBytes(descriptor, descriptor.levels[0]),
  ).toBeGreaterThan((1024 * 1024 * 4 * 4) / 3);
});
it('rejects malformed descriptors and missing or stale offline dependencies', () => {
  const { descriptor, visual } = detailFixture(),
    data = campusFixture();
  expect(validDetailedModel(descriptor)).toBe(true);
  data.visuals = {
    schemaVersion: 1,
    revision: 'r',
    bytes: 0,
    buildings: [visual],
    sectors: [],
    references: [],
    detailedModels: [descriptor],
  };
  const assets = detailedAssets([descriptor]);
  const manifest: CampusPackage = {
    version: 'detail',
    schemaVersion: 3,
    createdAt: '2026-11-01',
    summary: 'Test',
    dataUrl: '/packages/detail/campus.json',
    bytes: 300,
    assets,
    detailedModels: { bytes: 300, assetUrls: assets.map((a) => a.url) },
  };
  expect(detailedManifestMatches(data, manifest)).toBe(true);
  expect(
    detailedManifestMatches(data, { ...manifest, assets: assets.slice(1) }),
  ).toBe(false);
  expect(
    detailedManifestMatches(data, { ...manifest, detailedModels: undefined }),
  ).toBe(false);
  for (const bad of [
    null,
    { ...descriptor, levels: [null, null, null] },
    { ...descriptor, textures: [null] },
    {
      ...descriptor,
      bounds: [
        [181, 0],
        [182, 0],
      ],
    },
  ])
    expect(validDetailedModel(bad as typeof descriptor)).toBe(false);
  descriptor.geometryRevision = 'stale';
  expect(detailedManifestMatches(data, manifest)).toBe(false);
});
it('builds hashed bounded render levels while retaining editable face identities', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'turnright-details-'));
  try {
    const { feature, visual, document } = detailFixture();
    const descriptor = (await buildDetailedModel(feature, visual, directory))!;
    expect(validDetailedModel(descriptor)).toBe(true);
    expect(descriptor.levels.map((l) => l.triangles)).toEqual([36, 24, 12]);
    expect(descriptor.levels[1].geometricError).toBeGreaterThan(0);
    expect(descriptor.levels[2].geometricError).toBeGreaterThanOrEqual(
      descriptor.levels[1].geometricError,
    );
    for (const level of descriptor.levels)
      for (const asset of level.assets) {
        const bytes = await readFile(
          path.join(directory, path.basename(asset.url)),
        );
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(
          asset.sha256,
        );
        expect(
          validBuildingModel(
            JSON.parse((asset.encoding ? gunzipSync(bytes) : bytes).toString()),
          ),
        ).toBe(true);
      }
    const mesh = compileModelDocument(document, document.origin)[0];
    const chunk = modelMeshChunk(mesh, 1, 3);
    expect(chunk.indices).toHaveLength(9);
    expect(chunk.surfaces?.[0].start).toBe(0);
    expect(chunk.surfaces?.[0].faceId).toBe(
      mesh.surfaces?.find((s) => s.start <= 1 && s.start + s.count > 1)?.faceId,
    );
    expect(chunk.indices.every((i) => i < chunk.positions.length / 3)).toBe(
      true,
    );
  } finally {
    if (
      path.dirname(directory) === path.resolve(tmpdir()) &&
      path.basename(directory).startsWith('turnright-details-')
    )
      await rm(directory, { recursive: true });
  }
});
