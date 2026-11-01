import {
  DoubleSide,
  FrontSide,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from 'three';
import type { ModelRenderMaterial } from './model-render-types';
import { modelAssetRequest } from './model-asset-requests';
import { ASSET_CACHE } from './offline';

type Entry = {
  texture: Texture;
  refs: number;
  pixels: number;
  bytes?: number;
  bitmap?: ImageBitmap;
  controller: AbortController;
  listeners: Set<() => void>;
  ready: Promise<boolean>;
};
const pool = new Map<string, Entry>();
let decodedPixels = 0;
/** Verify and share textures, releasing decoded memory when their last material closes. */
function acquire(
  url: string,
  settings: NonNullable<
    ModelRenderMaterial['textureSettings']
  >[keyof NonNullable<ModelRenderMaterial['textureSettings']>],
  colour: boolean,
  redraw: () => void,
  expected?: { width: number; height: number; bytes: number },
) {
  const key = JSON.stringify([url, settings, colour]);
  let entry = pool.get(key);
  if (!entry) {
    const texture = new Texture();
    texture.flipY = false;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    if (settings) {
      texture.wrapS = settings.wrapS as typeof RepeatWrapping;
      texture.wrapT = settings.wrapT as typeof RepeatWrapping;
      texture.offset.fromArray(settings.offset);
      texture.repeat.fromArray(settings.repeat);
      texture.rotation = settings.rotation;
    }
    if (colour) texture.colorSpace = SRGBColorSpace;
    entry = {
      texture,
      refs: 0,
      pixels: 0,
      controller: new AbortController(),
      listeners: new Set(),
      ready: Promise.resolve(false),
    };
    pool.set(key, entry);
    const owned = entry;
    owned.ready = modelAssetRequest(async () => {
      owned.controller.signal.throwIfAborted();
      const cached =
        url.startsWith('/packages/') && typeof caches !== 'undefined'
          ? await caches
              .open(ASSET_CACHE)
              .then((cache) => cache.match(url))
              .catch(() => undefined)
          : undefined;
      const response =
        cached ||
        (await fetch(url, {
          signal: AbortSignal.any([
            owned.controller.signal,
            AbortSignal.timeout(20000),
          ]),
        }));
      if (!response.ok) throw new Error('Texture unavailable');
      const bytes = await response.arrayBuffer();
      owned.bytes = bytes.byteLength;
      if (bytes.byteLength > 4 * 1024 * 1024)
        throw new Error('Texture too large');
      const expectedHash = /^\/packages\/model-texture-([a-f\d]{64})\./.exec(
        url,
      )?.[1];
      if (expectedHash) {
        const hash = [
          ...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        ]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('');
        if (hash !== expectedHash)
          throw new Error('Texture integrity check failed');
      }
      const bitmap = await createImageBitmap(new Blob([bytes]), {
        imageOrientation: (settings?.flipY ?? true) ? 'flipY' : 'none',
        premultiplyAlpha: 'none',
      });
      const pixels = bitmap.width * bitmap.height;
      if (
        owned.controller.signal.aborted ||
        bitmap.width > 4096 ||
        bitmap.height > 4096 ||
        decodedPixels + pixels > 32 * 1024 * 1024
      ) {
        bitmap.close();
        throw new Error('Texture decode budget reached');
      }
      owned.bitmap = bitmap;
      owned.pixels = pixels;
      decodedPixels += pixels;
      texture.image = bitmap;
      texture.needsUpdate = true;
      owned.listeners.forEach((notify) => notify());
      return true;
    }).catch(() => {
      owned.listeners.forEach((notify) => notify());
      return false;
    });
  }
  const owned = entry;
  owned.refs++;
  owned.listeners.add(redraw);
  return {
    texture: owned.texture,
    // Metadata belongs to each consumer, not the shared immutable image.
    // A bad first descriptor must not poison later correctly declared users.
    ready: owned.ready.then(
      (ok) =>
        ok &&
        (!expected ||
          (owned.bitmap?.width === expected.width &&
            owned.bitmap?.height === expected.height &&
            owned.bytes === expected.bytes)),
    ),
    release: () => {
      owned.listeners.delete(redraw);
      if (--owned.refs === 0) {
        owned.controller.abort();
        owned.texture.dispose();
        owned.bitmap?.close();
        decodedPixels -= owned.pixels;
        pool.delete(key);
      }
    },
  };
}
export function createModelRenderMaterial(
  source: ModelRenderMaterial,
  redraw: () => void,
  expectedImages: {
    url: string;
    width: number;
    height: number;
    bytes: number;
  }[] = [],
) {
  const material = new MeshStandardMaterial({
    color: source.colour,
    opacity: source.opacity,
    transparent: source.opacity < 1,
    roughness: source.roughness,
    metalness: source.metalness,
    side: source.doubleSided ? DoubleSide : FrontSide,
    emissive: source.emissive || '#000000',
    alphaTest: source.alphaTest || 0,
  });
  const releases: Array<() => void> = [];
  const ready: Promise<boolean>[] = [];
  for (const [slot, url] of Object.entries(source.maps || {})) {
    const settings =
      source.textureSettings?.[
        slot as keyof NonNullable<typeof source.textureSettings>
      ];
    const key = slot === 'baseMap' ? 'map' : slot;
    const apply = () => {
      if (
        resource.texture.image &&
        (key === 'map' ||
          key === 'normalMap' ||
          key === 'roughnessMap' ||
          key === 'metalnessMap' ||
          key === 'emissiveMap')
      ) {
        material[key] = resource.texture;
        material.needsUpdate = true;
      }
    };
    const resource = acquire(
      url,
      settings,
      slot === 'baseMap' || slot === 'emissiveMap',
      () => {
        apply();
        redraw();
      },
      expectedImages.find((image) => image.url === url),
    );
    apply();
    releases.push(resource.release);
    ready.push(resource.ready);
  }
  return {
    material,
    ready: Promise.all(ready).then((results) => results.every(Boolean)),
    release: () => releases.forEach((release) => release()),
  };
}
