import type { DetailedModelAsset } from './model-lod-types';
import { DETAIL_MODEL_LIMITS } from './model-lod-types';

/** Bound decompression as well as transfer size before parsing immutable geometry. */
export async function decodeModelAsset(
  bytes: ArrayBuffer,
  asset: DetailedModelAsset,
): Promise<Uint8Array> {
  if (!asset.encoding) return new Uint8Array(bytes);
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (
        length > DETAIL_MODEL_LIMITS.assetBytes ||
        length > (asset.decodedBytes || 0)
      )
        throw new Error('Detailed model expands beyond its declared bounds.');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (length !== asset.decodedBytes)
    throw new Error('Detailed model decoded size mismatch.');
  const decoded = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    decoded.set(chunk, offset);
    offset += chunk.length;
  }
  return decoded;
}
