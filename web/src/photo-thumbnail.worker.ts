/// <reference lib="webworker" />
import { thumbnailSize } from './photo-thumbnail';
self.onmessage = async ({
  data,
}: MessageEvent<{ key: string; file: File }>) => {
  let image: ImageBitmap | undefined;
  try {
    const size = await thumbnailSize(data.file);
    if (!size) throw Error('No bounded preview available');
    image = await createImageBitmap(data.file, {
      resizeWidth: size.width,
      resizeHeight: size.height,
      resizeQuality: 'medium',
    });
    const scale = Math.min(1, 640 / Math.max(image.width, image.height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(image.width * scale)),
      Math.max(1, Math.round(image.height * scale)),
    );
    canvas
      .getContext('2d')!
      .drawImage(image, 0, 0, canvas.width, canvas.height);
    self.postMessage({
      key: data.key,
      blob: await canvas.convertToBlob({ type: 'image/webp', quality: 0.75 }),
    });
  } catch {
    self.postMessage({ key: data.key });
  } finally {
    image?.close();
  }
};
