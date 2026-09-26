import { Source, Texture } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { encodeModelImage } from './model-image-codec';

/** Adapter for pinned Three r180, whose image export expects worker Canvas2D.
 * Use its exporter plugin entry point and retain its geometry/material writer. */
export function workerImageExporter(
  textures: Texture[],
  bitmaps: ImageBitmap[],
) {
  const exporter = new GLTFExporter();
  if (typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined')
    return exporter;
  exporter.register((input) => {
    const writer = input as unknown as {
      json: { images?: Array<{ mimeType: string; bufferView?: number }> };
      pending: Promise<unknown>[];
      processBufferViewImage: (blob: Blob) => Promise<number>;
      processImage: (
        image: ImageBitmap,
        format: number,
        flipY: boolean,
      ) => number;
      buildMetalRoughTextureAsync: (
        metal: Texture | null,
        rough: Texture | null,
      ) => Promise<Texture | null>;
    };
    const cache = new WeakMap<ImageBitmap, Map<boolean, number>>();
    writer.processImage = (image, _format, flipY) => {
      const saved = cache.get(image)?.get(flipY);
      if (saved !== undefined) return saved;
      const definition: { mimeType: string; bufferView?: number } = {
        mimeType: 'image/png',
      };
      const index = (writer.json.images ||= []).push(definition) - 1;
      const entries = cache.get(image) || new Map<boolean, number>();
      entries.set(flipY, index);
      cache.set(image, entries);
      writer.pending.push(
        encodeModelImage({ image, flipY })
          .then((bytes) =>
            writer.processBufferViewImage(
              new Blob([bytes], { type: 'image/png' }),
            ),
          )
          .then((bufferView) => {
            definition.bufferView = bufferView;
          }),
      );
      return index;
    };
    writer.buildMetalRoughTextureAsync = async (metal, rough) => {
      if (metal === rough) return metal;
      const reference = metal || rough;
      if (!reference) return null;
      const bytes = await encodeModelImage({
        image: reference.image,
        merge: true,
        metalness: metal?.image,
        roughness: rough?.image,
      });
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: 'image/png' }),
      );
      bitmaps.push(bitmap);
      const texture = reference.clone();
      texture.source = new Source(bitmap);
      textures.push(texture);
      return texture;
    };
    return {};
  });
  return exporter;
}
