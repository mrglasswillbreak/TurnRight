// Codec defaults adapted from Squoosh, Copyright 2020 Google Inc., Apache-2.0.
// Original modules and their licences: /photo-codecs/e8d35e0/.
import type { PhotoRecipe } from './photo-edit';
import hashes from './photo-codec-manifest.json';
const base = '/photo-codecs/e8d35e0';
export const photoCodecFiles = Object.keys(hashes) as (keyof typeof hashes)[];
type Encoder = {
  encode: (
    data: Uint8ClampedArray,
    w: number,
    h: number,
    options: Record<string, number | boolean>,
  ) => Uint8Array | null;
};
const modules = new Map<string, Promise<Encoder>>();
async function encoder(name: string) {
  if (!modules.has(name))
    modules.set(
      name,
      (async () => {
        const module = await import(/* @vite-ignore */ `${base}/${name}.js`);
        return module.default({
          noInitialRun: true,
          locateFile: (file: string) => `${base}/${file}`,
        }) as Promise<Encoder>;
      })().catch((error) => {
        modules.delete(name);
        throw error;
      }),
    );
  return modules.get(name)!;
}
let png:
  | Promise<{
      optimise: (
        data: Uint8ClampedArray,
        w: number,
        h: number,
        level: number,
        interlace: boolean,
      ) => Uint8Array;
    }>
  | undefined;
export async function encodePhotoPixels(
  pixels: ImageData,
  recipe: PhotoRecipe,
  quality: number,
) {
  const { data, width, height } = pixels;
  let result: Uint8Array | null;
  if (recipe.format === 'image/png') {
    png ||= (async () => {
      const module = await import(
        /* @vite-ignore */ `${base}/squoosh_oxipng.js`
      );
      await module.default(`${base}/squoosh_oxipng_bg.wasm`);
      return module;
    })();
    result = (await png).optimise(
      data,
      width,
      height,
      recipe.effort ?? 2,
      false,
    );
  } else if (recipe.format === 'image/jpeg') {
    result = (await encoder('mozjpeg_enc')).encode(data, width, height, {
      quality: quality * 100,
      baseline: false,
      arithmetic: false,
      progressive: recipe.progressive !== false,
      optimize_coding: true,
      smoothing: 0,
      color_space: 3,
      quant_table: 3,
      trellis_multipass: false,
      trellis_opt_zero: false,
      trellis_opt_table: false,
      trellis_loops: 1,
      auto_subsample: true,
      chroma_subsample: 2,
      separate_chroma_quality: false,
      chroma_quality: quality * 100,
    });
  } else if (recipe.format === 'image/avif') {
    result = (await encoder('avif_enc')).encode(data, width, height, {
      quality: quality * 100,
      qualityAlpha: -1,
      denoiseLevel: 0,
      tileColsLog2: 0,
      tileRowsLog2: 0,
      speed: 8 - (recipe.effort ?? 2),
      subsample: 1,
      chromaDeltaQ: false,
      sharpness: 0,
      tune: 0,
      enableSharpYUV: true,
    });
  } else {
    result = (await encoder('webp_enc')).encode(data, width, height, {
      quality: quality * 100,
      target_size: 0,
      target_PSNR: 0,
      method: recipe.effort ?? 4,
      sns_strength: 50,
      filter_strength: 60,
      filter_sharpness: 0,
      filter_type: 1,
      partitions: 0,
      segments: 4,
      pass: 1,
      show_compressed: 0,
      preprocessing: 0,
      autofilter: 0,
      partition_limit: 0,
      alpha_compression: 1,
      alpha_filtering: 1,
      alpha_quality: 100,
      lossless: recipe.lossless ? 1 : 0,
      exact: 1,
      image_hint: 0,
      emulate_jpeg_size: 0,
      thread_level: 0,
      low_memory: 0,
      near_lossless: 100,
      use_delta_palette: 0,
      use_sharp_yuv: 1,
    });
  }
  if (!result?.length)
    throw Error('The image encoder failed. The original is retained.');
  return new Blob([new Uint8Array(result)], { type: recipe.format });
}

/** Download codecs only on demand; public-map startup does not fetch them. */
export async function preparePhotoCodecs(signal?: AbortSignal) {
  const cache = await caches.open('turnright-assets-v1');
  for (const file of photoCodecFiles) {
    signal?.throwIfAborted();
    const url = `${base}/${file}`;
    if (await cache.match(url)) continue;
    const response = await fetch(url, { signal });
    if (!response.ok)
      throw Error('Image codec download failed. Retry while online.');
    const digest = await crypto.subtle.digest(
      'SHA-256',
      await response.clone().arrayBuffer(),
    );
    if (
      Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('') !== hashes[file]
    )
      throw Error(
        'Image codec verification failed. Reload the app before preparing offline tools.',
      );
    await cache.put(url, response);
  }
}
