import { expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { decodeModelAsset } from '../src/model-detail-asset';
import { modelLodError } from '../scripts/model-lod-error';
import type { ModelMesh } from '../src/visual-types';

it('decodes immutable compressed geometry and rejects false expansion sizes and corrupt streams', async () => {
  const source = new TextEncoder().encode(
    JSON.stringify({ geometry: Array.from({ length: 500 }, (_, i) => i) }),
  );
  const bytes = new Uint8Array(gzipSync(source)),
    sha256 = createHash('sha256').update(bytes).digest('hex');
  const asset = {
    url: `/packages/detail-${sha256}.json.gz`,
    sha256,
    bytes: bytes.length,
    encoding: 'gzip' as const,
    decodedBytes: source.length,
  };
  expect(await decodeModelAsset(bytes.buffer, asset)).toEqual(source);
  await expect(
    decodeModelAsset(bytes.buffer, { ...asset, decodedBytes: 10 }),
  ).rejects.toThrow('bounds');
  await expect(
    decodeModelAsset(bytes.buffer, {
      ...asset,
      decodedBytes: source.length + 1,
    }),
  ).rejects.toThrow('size');
  await expect(
    decodeModelAsset(new Uint8Array([1, 2, 3]).buffer, asset),
  ).rejects.toThrow();
});
it('keeps the error bound conservative without treating long trim as a building-sized deviation', () => {
  const mesh = (id: string): ModelMesh => ({
    positions: [],
    indices: [],
    colour: '#cccccc',
    surfaces: [{ start: 0, count: 0, objectId: id, partId: id, role: 'trim' }],
  });
  const wall = mesh('wall'),
    trim = mesh('trim');
  const quad = (
    target: ModelMesh,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z: number,
  ) => {
    const start = target.positions.length / 3;
    target.positions.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z);
    target.indices.push(
      start,
      start + 1,
      start + 2,
      start,
      start + 2,
      start + 3,
    );
    target.surfaces![0].count += 2;
  };
  for (let x = 0; x < 80; x += 2) quad(wall, x, x + 2, 0, 1, 0);
  quad(trim, 0, 80, 0.2, 0.5, 0.2);
  const error = modelLodError([wall, trim], [wall]);
  expect(error).toBeGreaterThanOrEqual(0.2);
  expect(error).toBeLessThanOrEqual(0.251);
});
