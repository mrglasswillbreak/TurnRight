/// <reference lib="webworker" />
import { rectifyTexture } from './building-facades';
self.onmessage = async ({
  data,
}: MessageEvent<{ bytes: ArrayBuffer; corners: [number, number][] }>) => {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(new Blob([data.bytes]));
    if (bitmap.width > 1600 || bitmap.height > 1600)
      throw new Error('Texture source exceeds image limits');
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height),
      context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const pixels = rectifyTexture(
      context.getImageData(0, 0, bitmap.width, bitmap.height).data,
      bitmap.width,
      bitmap.height,
      data.corners,
    );
    self.postMessage({ pixels: pixels.buffer, size: 512 }, [pixels.buffer]);
  } catch {
    self.postMessage({ error: 'Texture processing unavailable' });
  } finally {
    bitmap?.close();
  }
};
