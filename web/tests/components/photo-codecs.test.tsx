import { afterEach, expect, it, vi } from 'vitest';
import {
  encodePhotoPixels,
  preparePhotoCodecs,
  photoCodecFiles,
} from '../../src/photo-codecs';
import { defaultPhotoRecipe } from '../../src/photo-edit';

const base = '/photo-codecs/e8d35e0/';
afterEach(() => vi.restoreAllMocks());

it('rejects a corrupted cached encoder, evicts it, and retries with verified encoder bytes', async () => {
  const cache = await caches.open('turnright-assets-v1');
  await cache.put(
    base + 'mozjpeg_enc.js',
    new Response('corrupted cached encoder'),
  );
  const pixels = new ImageData(8, 8);
  const recipe = { ...defaultPhotoRecipe(), format: 'image/jpeg' as const };
  await expect(encodePhotoPixels(pixels, recipe, 0.8)).rejects.toThrow(
    /verification failed/,
  );
  expect(await cache.match(base + 'mozjpeg_enc.js')).toBeUndefined();
  const result = await encodePhotoPixels(pixels, recipe, 0.8);
  const bitmap = await createImageBitmap(result);
  expect([bitmap.width, bitmap.height, result.type]).toEqual([
    8,
    8,
    'image/jpeg',
  ]);
  bitmap.close();
});

it('encodes actual PNG, WebP and AVIF pixels with the pinned local codecs', async () => {
  const pixels = new ImageData(8, 8);
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i] = 200;
    pixels.data[i + 3] = 255;
  }
  for (const format of ['image/png', 'image/webp', 'image/avif'] as const) {
    const result = await encodePhotoPixels(
      pixels,
      { ...defaultPhotoRecipe(), format, effort: 1, lossless: true },
      0.7,
    );
    const bitmap = await createImageBitmap(result);
    expect([bitmap.width, bitmap.height, result.type]).toEqual([8, 8, format]);
    bitmap.close();
  }
});

it('prepares every verified offline asset, reuses the cache, and honors cancellation', async () => {
  await caches.delete('turnright-assets-v1');
  await preparePhotoCodecs();
  const cache = await caches.open('turnright-assets-v1');
  for (const file of photoCodecFiles)
    expect((await cache.match(base + file))?.ok).toBe(true);
  const fetch = vi.spyOn(globalThis, 'fetch');
  await preparePhotoCodecs();
  expect(fetch).not.toHaveBeenCalled();
  const controller = new AbortController();
  controller.abort();
  await expect(preparePhotoCodecs(controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});

it('does not cache a failed or tampered codec download', async () => {
  await caches.delete('turnright-assets-v1');
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('unavailable', { status: 503 }));
  await expect(preparePhotoCodecs()).rejects.toThrow(/download failed/);
  fetch.mockResolvedValue(new Response('untrusted binary'));
  await expect(preparePhotoCodecs()).rejects.toThrow(/verification failed/);
  expect(await (await caches.open('turnright-assets-v1')).keys()).toEqual([]);
});
