export type PhotoFormat = 'image/webp' | 'image/jpeg' | 'image/png';
export interface PhotoRecipe {
  version: 1;
  crop: { x: number; y: number; width: number; height: number };
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  width: number;
  quality: number;
  format: PhotoFormat;
  targetKiB: number;
  masks: {
    x: number;
    y: number;
    width: number;
    height: number;
    mode: 'blur' | 'pixelate' | 'redact';
  }[];
}
export const defaultPhotoRecipe = (): PhotoRecipe => ({
  version: 1,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0,
  flipX: false,
  flipY: false,
  exposure: 0,
  contrast: 1,
  saturation: 1,
  temperature: 0,
  width: 1600,
  quality: 0.84,
  format: 'image/webp',
  targetKiB: 250,
  masks: [],
});
export function validatePhotoRecipe(r: PhotoRecipe) {
  const bounded = (n: number, min: number, max: number) =>
    Number.isFinite(n) && n >= min && n <= max;
  const rect = (v: PhotoRecipe['crop']) =>
    v &&
    bounded(v.x, 0, 1) &&
    bounded(v.y, 0, 1) &&
    bounded(v.width, 0.001, 1) &&
    bounded(v.height, 0.001, 1) &&
    v.x + v.width <= 1.00001 &&
    v.y + v.height <= 1.00001;
  if (
    r.version !== 1 ||
    !rect(r.crop) ||
    !bounded(r.rotation, -180, 180) ||
    !bounded(r.exposure, -2, 2) ||
    !bounded(r.contrast, 0, 2) ||
    !bounded(r.saturation, 0, 2) ||
    !bounded(r.temperature, -1, 1) ||
    !bounded(r.width, 64, 4096) ||
    !bounded(r.quality, 0.1, 1) ||
    !bounded(r.targetKiB, 0, 10240) ||
    !['image/webp', 'image/jpeg', 'image/png'].includes(r.format) ||
    r.masks.length > 50 ||
    r.masks.some(
      (m) => !rect(m) || !['blur', 'pixelate', 'redact'].includes(m.mode),
    )
  )
    throw Error('Invalid image settings. Reset the image controls.');
}
export function photoModifications(r: PhotoRecipe) {
  return [
    r.crop.width < 1 || r.crop.height < 1 ? 'Cropped' : null,
    r.rotation || r.flipX || r.flipY ? 'Rotated/flipped' : null,
    r.exposure || r.contrast !== 1 || r.saturation !== 1 || r.temperature
      ? 'Colour adjusted'
      : null,
    r.masks.length ? 'Privacy areas flattened' : null,
    `Resized and compressed as ${r.format.split('/')[1]}; source metadata removed.`,
  ]
    .filter(Boolean)
    .join('; ');
}
