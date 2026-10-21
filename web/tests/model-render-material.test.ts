import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { DoubleSide, FrontSide, RepeatWrapping, SRGBColorSpace } from 'three';
import { createModelRenderMaterial } from '../src/model-render-material';
import type { ModelRenderMaterial } from '../src/model-render-types';

const bytes = new Uint8Array([1, 2, 3, 4]);
const hash = createHash('sha256').update(bytes).digest('hex');
const url = `/packages/model-texture-${hash}.png`;
const source: ModelRenderMaterial = {
  id: 'wall',
  name: 'Wall',
  colour: '#123456',
  opacity: 0.7,
  roughness: 0.6,
  metalness: 0.2,
  doubleSided: true,
};
const owned = new Set<ReturnType<typeof createModelRenderMaterial>>();
const release = (resource: ReturnType<typeof createModelRenderMaterial>) => {
  resource.release();
  resource.material.dispose();
  owned.delete(resource);
};
const create = (
  settings: Partial<ModelRenderMaterial> = {},
  redraw = vi.fn(),
) => {
  const resource = createModelRenderMaterial(
    { ...source, maps: { baseMap: url }, ...settings },
    redraw,
  );
  owned.add(resource);
  return resource;
};
const bitmap = () => ({ width: 8, height: 8, close: vi.fn() });
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(bytes)),
  );
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap()),
  );
});
afterEach(() => {
  for (const resource of owned) release(resource);
  vi.unstubAllGlobals();
});

it('shares verified textures until the last material closes, then releases decoded memory', async () => {
  const decoded = bitmap();
  vi.mocked(createImageBitmap).mockResolvedValue(
    decoded as unknown as ImageBitmap,
  );
  const redraw = vi.fn(),
    first = create({}, redraw),
    second = create();
  await vi.waitFor(() => expect(first.material.map).not.toBeNull());
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(first.material.map).toBe(second.material.map);
  expect(first.material.map?.colorSpace).toBe(SRGBColorSpace);
  expect(first.material.side).toBe(DoubleSide);
  expect(first.material.transparent).toBe(true);
  expect(redraw).toHaveBeenCalledOnce();
  const texture = first.material.map!;
  const disposed = vi.fn();
  texture.addEventListener('dispose', disposed);
  release(first);
  expect(decoded.close).not.toHaveBeenCalled();
  expect(disposed).not.toHaveBeenCalled();
  release(second);
  expect(decoded.close).toHaveBeenCalledOnce();
  expect(disposed).toHaveBeenCalledOnce();
  const third = create({ opacity: 1, doubleSided: false });
  await vi.waitFor(() => expect(third.material.map).not.toBeNull());
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(third.material.side).toBe(FrontSide);
  expect(third.material.transparent).toBe(false);
});

it('keeps colour and numeric texture channels distinct and applies authored UV transforms', async () => {
  const resource = create({
    maps: { baseMap: url, normalMap: url, emissiveMap: url },
    emissive: '#123456',
    alphaTest: 0.2,
    textureSettings: {
      baseMap: {
        flipY: false,
        wrapS: RepeatWrapping,
        wrapT: RepeatWrapping,
        offset: [0.2, 0.3],
        repeat: [2, 3],
        rotation: 0.5,
      },
    },
  });
  await vi.waitFor(() => expect(resource.material.normalMap).not.toBeNull());
  expect(resource.material.map?.offset.toArray()).toEqual([0.2, 0.3]);
  expect(resource.material.map?.repeat.toArray()).toEqual([2, 3]);
  expect(resource.material.map?.rotation).toBe(0.5);
  expect(resource.material.normalMap?.colorSpace).not.toBe(SRGBColorSpace);
  expect(resource.material.emissiveMap?.colorSpace).toBe(SRGBColorSpace);
  expect(resource.material.alphaTest).toBe(0.2);
  expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
    imageOrientation: 'none',
    premultiplyAlpha: 'none',
  });
});

it.each(['unavailable', 'oversized', 'tampered'] as const)(
  'rejects %s bytes before decoding a texture',
  async (failure) => {
    vi.mocked(fetch).mockResolvedValue(
      failure === 'unavailable'
        ? new Response(null, { status: 503 })
        : new Response(
            new Uint8Array(failure === 'oversized' ? 4 * 1024 * 1024 + 1 : 8),
          ),
    );
    const redraw = vi.fn(),
      resource = create({}, redraw);
    await vi.waitFor(() => expect(redraw).toHaveBeenCalledOnce());
    expect(resource.material.map).toBeNull();
    expect(createImageBitmap).not.toHaveBeenCalled();
  },
);

it('closes a late decoded bitmap when its material was released during loading', async () => {
  let finish!: (value: ImageBitmap) => void;
  vi.mocked(createImageBitmap).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const resource = create(),
    decoded = bitmap();
  await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledOnce());
  const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
  release(resource);
  expect(signal?.aborted).toBe(true);
  finish(decoded as unknown as ImageBitmap);
  await vi.waitFor(() => expect(decoded.close).toHaveBeenCalledOnce());
});

it('rejects oversized decoded images and releases the rejected bitmap', async () => {
  const decoded = { ...bitmap(), width: 4097 };
  vi.mocked(createImageBitmap).mockResolvedValue(
    decoded as unknown as ImageBitmap,
  );
  const redraw = vi.fn(),
    resource = create({}, redraw);
  await vi.waitFor(() => expect(redraw).toHaveBeenCalledOnce());
  expect(decoded.close).toHaveBeenCalledOnce();
  expect(resource.material.map).toBeNull();
});
