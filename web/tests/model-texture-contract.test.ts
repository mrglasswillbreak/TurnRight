import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Scene } from 'three';
import { MercatorCoordinate, type Map as CampusMap } from 'maplibre-gl';
import { detailedAssets } from '../src/model-lod';
import { verifyOfflineModels } from '../src/model-offline-verification';
import { createCampusModelMeshes } from '../src/campus-model-meshes';
import { compileModelDocument } from '../src/model-document-compiler';
import { packageDetailedModels } from '../../scripts/detailed-package.mjs';
import { campusFixture } from './fixture';
import { detailFixture } from './model-detail-fixture';

const imageBytes = new Uint8Array([1, 2, 3, 4]);
const hash = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const image = {
  url: `/packages/model-texture-${hash(imageBytes)}.png`,
  sha256: hash(imageBytes),
  bytes: imageBytes.length,
  width: 8,
  height: 8,
  contentType: 'image/png',
};
const bitmap = { width: 8, height: 8, close: vi.fn() };

function sharedTextureFixture() {
  const { descriptor, document, visual } = detailFixture();
  const data = campusFixture();
  const files = new Map<string, Uint8Array<ArrayBuffer>>([
    [image.url, imageBytes],
  ]);
  const payloads = ['first', 'second'].map((id) => ({
    id,
    geometryRevision: descriptor.geometryRevision,
    origin: descriptor.origin,
    meshes: compileModelDocument(document, document.origin).map((mesh) => ({
      ...mesh,
      material: {
        id: 'paint',
        name: 'Paint',
        colour: mesh.colour,
        opacity: 1,
        roughness: 0.7,
        metalness: 0,
        doubleSided: false,
        maps: { baseMap: image.url },
      },
    })),
  }));
  const models = payloads.map((payload) => {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const sha256 = hash(bytes);
    const asset = {
      url: `/packages/detail-${sha256}.json`,
      sha256,
      bytes: bytes.length,
    };
    files.set(asset.url, bytes);
    return {
      ...descriptor,
      id: payload.id,
      textures: [{ ...image, instances: 1 }],
      levels: descriptor.levels.map((level) => ({
        ...level,
        triangles: 36,
        geometryBytes: bytes.length,
        assets: [asset],
      })),
    };
  });
  data.visuals = {
    schemaVersion: 1,
    revision: 'shared-texture',
    bytes: 0,
    sectors: [],
    references: [],
    buildings: models.map((model) => ({ ...visual, id: model.id })),
    detailedModels: models,
  };
  const cache = {
    match: vi.fn(async (url: RequestInfo | URL) => {
      const bytes = files.get(String(url));
      return bytes ? new Response(bytes) : undefined;
    }),
  };
  return { data, models, payloads, cache };
}

beforeEach(() => {
  bitmap.close.mockClear();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap),
  );
});
afterEach(() => vi.unstubAllGlobals());

it('deduplicates shared immutable images while retaining per-model sampler counts', async () => {
  const { data, models, cache } = sharedTextureFixture();
  models[1].textures[0].instances = 2;
  expect(detailedAssets(models)).toHaveLength(3);
  await verifyOfflineModels(data, cache);
  expect(createImageBitmap).toHaveBeenCalledOnce();
  expect(bitmap.close).toHaveBeenCalledOnce();
});

it.each([{ width: 4 }, { height: 16 }, { contentType: 'image/jpeg' }])(
  'rejects conflicting shared image metadata %j before publication or offline readiness',
  async (change) => {
    const { data, models, cache } = sharedTextureFixture();
    Object.assign(models[1].textures[0], change);
    expect(() => detailedAssets(models)).toThrow('texture metadata');
    const write = vi.fn();
    await expect(
      packageDetailedModels(data.visuals, 'unused', write),
    ).rejects.toThrow('texture metadata');
    expect(write).not.toHaveBeenCalled();
    await expect(verifyOfflineModels(data, cache)).rejects.toThrow(
      'dimensions or format',
    );
    expect(createImageBitmap).toHaveBeenCalledOnce();
    expect(bitmap.close).toHaveBeenCalledOnce();
  },
);

it.each([false, true])(
  'checks shared material metadata per consumer, malformed descriptor first: %s',
  async (malformedFirst) => {
    const { models, payloads } = sharedTextureFixture();
    vi.stubGlobal('caches', {
      open: async () => ({ match: async () => undefined }),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(imageBytes)),
    );
    const origin = MercatorCoordinate.fromLngLat(models[0].origin);
    const meshes = createCampusModelMeshes(
      new Scene(),
      { triggerRepaint: vi.fn() } as unknown as CampusMap,
      origin,
      origin.meterInMercatorCoordinateUnits(),
    );
    models[1].textures[0].width = 4;
    const ordered = (malformedFirst ? [1, 0] : [0, 1]).map((index) =>
      meshes.building(payloads[index], models[index].textures),
    );
    const correct = ordered[malformedFirst ? 1 : 0];
    const incorrect = ordered[malformedFirst ? 0 : 1];
    let correctReleased = false;
    try {
      expect(await correct.userData.ready).toBe(true);
      expect(await incorrect.userData.ready).toBe(false);
      expect(fetch).toHaveBeenCalledOnce();
      expect(createImageBitmap).toHaveBeenCalledOnce();
      meshes.release(correct);
      correctReleased = true;
      expect(bitmap.close).not.toHaveBeenCalled();
    } finally {
      if (!correctReleased) meshes.release(correct);
      meshes.release(incorrect);
    }
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(meshes.materials.size).toBe(0);
  },
);
