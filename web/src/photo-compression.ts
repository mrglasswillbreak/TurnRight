import type { PhotoRecipe } from './photo-edit';

/** Bounded quality search, never silently shrinking dimensions or passing the quality floor. */
export async function compressToTarget(
  r: PhotoRecipe,
  encode: (quality: number) => Promise<Blob>,
) {
  const target = r.targetKiB * 1024;
  const high = { blob: await encode(r.quality), quality: r.quality };
  if (!target || high.blob.size <= target) return { ...high, targetMet: true };
  if (r.format === 'image/png' || (r.format === 'image/webp' && r.lossless))
    return { ...high, targetMet: false };
  let low = Math.min(r.quality, r.minQuality ?? 0.65),
    upper = r.quality;
  if (low === upper) return { ...high, targetMet: false };
  let best = { blob: await encode(low), quality: low };
  if (best.blob.size > target) return { ...best, targetMet: false };
  // At most five encodes. Keep the highest successful quality actually measured.
  for (let i = 0; i < 3 && upper - low >= 0.02; i++) {
    const quality = Math.round((low + upper) * 50) / 100;
    const blob = await encode(quality);
    if (blob.size <= target) {
      best = { blob, quality };
      low = quality;
    } else upper = quality;
  }
  return { ...best, targetMet: true };
}
