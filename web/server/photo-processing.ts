import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { HttpError } from './backend.js';

export const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
/** Decode, orient, resize and re-encode. Sharp discards source EXIF/GPS/XMP by default. */
export async function photoDerivative(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_ORIGINAL_BYTES)
    throw new HttpError(400, 'Upload a JPEG, PNG or WebP up to 10 MiB.');
  try {
    const input = sharp(bytes, {
      limitInputPixels: 40_000_000,
      failOn: 'warning',
      animated: false,
    });
    const info = await input.metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(info.format || '') ||
      (info.pages || 1) !== 1
    )
      throw Error('Unsupported image');
    for (const size of [1600, 1400, 1200, 1000, 800]) {
      for (const quality of [84, 74, 64]) {
        const result = await input
          .clone()
          .rotate()
          .resize({
            width: size,
            height: size,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality, effort: 5 })
          .toBuffer({ resolveWithObject: true });
        if (result.data.length <= 250 * 1024)
          return {
            bytes: result.data,
            width: result.info.width,
            height: result.info.height,
            sha256: createHash('sha256').update(result.data).digest('hex'),
            originalSha256: createHash('sha256').update(bytes).digest('hex'),
          };
      }
    }
    throw Error('Derivative too large');
  } catch {
    throw new HttpError(
      400,
      'This image could not be safely decoded and optimized. Use a single-frame JPEG, PNG or WebP under 40 megapixels.',
    );
  }
}
