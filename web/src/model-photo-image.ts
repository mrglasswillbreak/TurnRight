import type { CampusPhoto } from './types';
import { rectifyTexture, validTextureRecipe } from './building-facades';
import { modelId, type ModelImage } from './model-document';
import { hashBytes } from './offline';

export async function modelPhotoImage(
  photo: CampusPhoto,
  corners: [number, number][],
  signal: AbortSignal,
): Promise<ModelImage> {
  if (!validTextureRecipe({ photoId: photo.id, corners }))
    throw new Error('Choose a valid four-corner photo crop.');
  const response = await fetch(photo.url, { signal });
  if (!response.ok) throw new Error('The photograph is unavailable.');
  const bytes = await response.arrayBuffer();
  if (
    bytes.byteLength !== photo.bytes ||
    (await hashBytes(bytes)) !== photo.sha256
  )
    throw new Error('The photograph failed verification.');
  const bitmap = await createImageBitmap(new Blob([bytes]));
  try {
    if (bitmap.width > 4096 || bitmap.height > 4096)
      throw new Error('The photograph exceeds the texture source limit.');
    const source = document.createElement('canvas');
    source.width = bitmap.width;
    source.height = bitmap.height;
    const context = source.getContext('2d');
    if (!context) throw new Error('Photo processing requires Canvas2D.');
    context.drawImage(bitmap, 0, 0);
    const pixels = rectifyTexture(
      context.getImageData(0, 0, source.width, source.height).data,
      source.width,
      source.height,
      corners,
      1024,
    );
    signal.throwIfAborted();
    const target = document.createElement('canvas');
    target.width = target.height = 1024;
    target
      .getContext('2d')!
      .putImageData(
        new ImageData(new Uint8ClampedArray(pixels), 1024, 1024),
        0,
        0,
      );
    const encoded = target.toDataURL('image/png').split(',')[1];
    return {
      id: modelId(),
      name: photo.caption || 'Photographic surface',
      mime: 'image/png',
      data: encoded,
      evidence: {
        photoId: photo.id,
        corners,
        modifications:
          'Four-corner perspective rectification and resampling to 1024 px; metadata removed.',
      },
    };
  } finally {
    bitmap.close();
  }
}
