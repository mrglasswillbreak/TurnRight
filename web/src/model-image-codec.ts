/** Only raster encoding uses a DOM bridge on engines without worker canvases.
 * Geometry parsing, topology and file packing stay in the cancellable worker. */
export type ModelImageJob = {
  image: ImageBitmap;
  flipY?: boolean;
  metalness?: ImageBitmap;
  roughness?: ImageBitmap;
  merge?: boolean;
};
const waiting = new Map<
  number,
  { resolve: (b: ArrayBuffer) => void; reject: (e: Error) => void }
>();
let nextId = 0;
export function handleModelImageReply(data: {
  imageReply?: number;
  bytes?: ArrayBuffer;
  error?: string;
}) {
  if (data.imageReply === undefined) return false;
  const entry = waiting.get(data.imageReply);
  waiting.delete(data.imageReply);
  if (data.error) entry?.reject(new Error(data.error));
  else if (data.bytes) entry?.resolve(data.bytes);
  return true;
}
export async function encodeModelImage(
  job: ModelImageJob,
): Promise<ArrayBuffer> {
  if (
    typeof OffscreenCanvas === 'undefined' &&
    typeof document === 'undefined'
  ) {
    const imageWork = ++nextId;
    return new Promise((resolve, reject) => {
      waiting.set(imageWork, { resolve, reject });
      postMessage({ imageWork, job });
    });
  }
  const width = Math.max(
    job.image.width,
    job.metalness?.width || 0,
    job.roughness?.width || 0,
  );
  const height = Math.max(
    job.image.height,
    job.metalness?.height || 0,
    job.roughness?.height || 0,
  );
  if (width > 4096 || height > 4096 || width * height > 16 * 1024 * 1024)
    throw new Error('Reduce textures to the model image limits.');
  const canvas =
    typeof document === 'undefined'
      ? new OffscreenCanvas(width, height)
      : document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('This browser cannot encode model textures.');
  if (job.flipY) {
    ctx.translate(0, height);
    ctx.scale(1, -1);
  }
  if (job.merge) {
    const pixels = ctx.createImageData(width, height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i + 1] = 255;
      pixels.data[i + 2] = 255;
      pixels.data[i + 3] = 255;
    }
    for (const [map, channel] of [
      [job.roughness, 1],
      [job.metalness, 2],
    ] as const) {
      if (!map) continue;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(map, 0, 0, width, height);
      const source = ctx.getImageData(0, 0, width, height).data;
      for (let i = channel; i < source.length; i += 4)
        pixels.data[i] = source[i];
    }
    ctx.putImageData(pixels, 0, 0);
  } else ctx.drawImage(job.image, 0, 0, width, height);
  const blob =
    'convertToBlob' in canvas
      ? await canvas.convertToBlob({ type: 'image/png' })
      : await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) =>
              b ? resolve(b) : reject(new Error('Texture encoding failed.')),
            'image/png',
          ),
        );
  canvas.width = canvas.height = 1;
  return blob.arrayBuffer();
}
