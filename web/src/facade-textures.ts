import {
  DataTexture,
  RGBAFormat,
  SRGBColorSpace,
  LinearMipmapLinearFilter,
} from 'three';
import type { CampusData } from './types';
import { surfaceTextPixels } from './surface-text-canvas';
import type { FacadeTextureRecipe, SurfaceTextRecipe } from './visual-types';
import { textureKey } from './building-facades';
import { ASSET_CACHE, hashBytes } from './offline';
export const TEXTURE_MEMORY_LIMIT = 64 * 1024 * 1024;
const cost = Math.ceil((512 * 512 * 4 * 4) / 3);
// Map and guided preview share one reservation budget, including in-flight decodes.
let reservedBytes = 0;
let activeJobs = 0;
const schedulers = new Set<() => void>();
/** Visible materials own references; three bounded jobs and disposal also cover late replies. */
export function createFacadeTextures(repaint: () => void) {
  type Entry = {
    users: number;
    texture?: DataTexture;
    controller: AbortController;
    callbacks: Set<(t: DataTexture) => void>;
    start?: () => Promise<void>;
  };
  const entries = new Map<string, Entry>();
  let running = 0,
    disposed = false;
  const pump = () => {
    if (disposed) return;
    for (const e of entries.values())
      if (activeJobs < 3 && e.start) {
        const start = e.start;
        e.start = undefined;
        running++;
        activeJobs++;
        void start().finally(() => {
          running--;
          activeJobs--;
          for (const schedule of schedulers) schedule();
        });
      }
  };
  schedulers.add(pump);
  function acquire(
    recipe: FacadeTextureRecipe | SurfaceTextRecipe,
    data: CampusData,
    onReady: (t: DataTexture) => void,
  ) {
    const key = 'text' in recipe ? JSON.stringify(recipe) : textureKey(recipe);
    let e = entries.get(key);
    if (e) {
      e.users++;
      e.callbacks.add(onReady);
      if (e.texture) onReady(e.texture);
      return () => release(key, onReady);
    }
    if (reservedBytes + cost > TEXTURE_MEMORY_LIMIT) return () => {};
    if ('text' in recipe) {
      const entry: Entry = {
        users: 1,
        controller: new AbortController(),
        callbacks: new Set([onReady]),
      };
      entries.set(key, entry);
      reservedBytes += cost;
      const paint = () => {
        if (disposed || entries.get(key) !== entry) return;
        try {
          const pixels = surfaceTextPixels(recipe);
          const texture = new DataTexture(
            pixels.data,
            pixels.width,
            pixels.height,
            RGBAFormat,
          );
          texture.flipY = true;
          texture.colorSpace = SRGBColorSpace;
          texture.generateMipmaps = true;
          texture.minFilter = LinearMipmapLinearFilter;
          texture.needsUpdate = true;
          const old = entry.texture;
          entry.texture = texture;
          for (const callback of entry.callbacks) callback(texture);
          old?.dispose();
          repaint();
        } catch {
          /* A failed local glyph render must not discard the model. */
        }
      };
      paint();
      if (document.fonts.status !== 'loaded')
        void document.fonts.ready.then(paint);
      return () => release(key, onReady);
    }
    const asset =
      data.visuals?.textures?.find((t) => t.id === key) ||
      data.photos?.find((p) => p.id === recipe.photoId);
    if (
      !asset ||
      !asset.url.startsWith('/packages/') ||
      asset.bytes > 250 * 1024
    )
      return () => {};
    const published = 'photoId' in asset;
    const controller = new AbortController();
    e = {
      users: 1,
      controller,
      callbacks: new Set([onReady]),
      start: async () => {
        let worker: Worker | undefined;
        try {
          const cache = await caches.open(ASSET_CACHE).catch(() => null);
          const response =
            (await cache?.match(asset.url)) ||
            (await fetch(asset.url, {
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(15000),
              ]),
            }));
          if (!response.ok) throw Error('Texture unavailable');
          const bytes = await response.arrayBuffer();
          if (
            bytes.byteLength !== asset.bytes ||
            (await hashBytes(bytes)) !== asset.sha256
          )
            throw Error('Texture integrity');
          if (controller.signal.aborted || disposed) return;
          worker = new Worker(
            new URL('./facade-texture.worker.ts', import.meta.url),
            { type: 'module' },
          );
          const result = await new Promise<{
            pixels: ArrayBuffer;
            size: number;
          }>((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(Error('Texture timed out')),
              10000,
            );
            const abort = () => {
              clearTimeout(timeout);
              reject(Error('Cancelled'));
            };
            controller.signal.addEventListener('abort', abort, { once: true });
            worker!.onmessage = ({ data }) => {
              clearTimeout(timeout);
              controller.signal.removeEventListener('abort', abort);
              if (data.error) reject(Error(data.error));
              else resolve(data);
            };
            worker!.onerror = () => {
              clearTimeout(timeout);
              controller.signal.removeEventListener('abort', abort);
              reject(Error('Texture worker failed'));
            };
            worker!.postMessage(
              {
                bytes,
                corners: published
                  ? [
                      [0, 0],
                      [1, 0],
                      [1, 1],
                      [0, 1],
                    ]
                  : recipe.corners,
              },
              [bytes],
            );
          });
          if (controller.signal.aborted || disposed) return;
          const texture = new DataTexture(
            new Uint8Array(result.pixels),
            result.size,
            result.size,
            RGBAFormat,
          );
          texture.flipY = true;
          texture.colorSpace = SRGBColorSpace;
          texture.generateMipmaps = true;
          texture.minFilter = LinearMipmapLinearFilter;
          texture.needsUpdate = true;
          e!.texture = texture;
          for (const callback of e!.callbacks) callback(texture);
          repaint();
        } catch {
          /* Colour geometry remains visible; corrupt bytes never reach the GPU. */
        } finally {
          worker?.terminate();
        }
      },
    };
    entries.set(key, e);
    reservedBytes += cost;
    pump();
    return () => release(key, onReady);
  }
  function release(key: string, callback: (t: DataTexture) => void) {
    const e = entries.get(key);
    if (!e) return;
    e.callbacks.delete(callback);
    if (--e.users === 0) {
      e.controller.abort();
      e.texture?.dispose();
      entries.delete(key);
      reservedBytes -= cost;
    }
  }
  return {
    acquire,
    stats: () => ({
      bytes: entries.size * cost,
      entries: entries.size,
      running,
      totalReservedBytes: reservedBytes,
    }),
    dispose() {
      disposed = true;
      schedulers.delete(pump);
      for (const e of entries.values()) {
        e.controller.abort();
        e.texture?.dispose();
      }
      reservedBytes -= entries.size * cost;
      entries.clear();
    },
  };
}
