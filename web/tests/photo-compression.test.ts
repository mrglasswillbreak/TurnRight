import { it, expect } from 'vitest';
import { compressToTarget } from '../src/photo-compression';
import { defaultPhotoRecipe } from '../src/photo-edit';
it('finds the highest measured quality under the target without changing pixels or crossing the floor', async () => {
  const calls: number[] = [];
  const result = await compressToTarget(
    { ...defaultPhotoRecipe(), targetKiB: 72, quality: 0.95, minQuality: 0.6 },
    async (q) => {
      calls.push(q);
      return new Blob([new Uint8Array(Math.round(q * 100 * 1024))]);
    },
  );
  expect(result.targetMet).toBe(true);
  expect(0.72 - result.quality).toBeLessThan(0.05);
  expect(result.blob.size).toBeLessThanOrEqual(72 * 1024);
  expect(calls.length).toBeLessThanOrEqual(5);
  expect(Math.min(...calls)).toBeGreaterThanOrEqual(0.6);
});
it('reports impossible targets and does not lower lossless quality or increase a chosen low quality', async () => {
  for (const patch of [
    { format: 'image/png' as const },
    { lossless: true },
    { quality: 0.4 },
  ]) {
    const calls: number[] = [];
    const result = await compressToTarget(
      { ...defaultPhotoRecipe(), ...patch, targetKiB: 1 },
      async (q) => {
        calls.push(q);
        return new Blob([new Uint8Array(10000)]);
      },
    );
    expect(result.targetMet).toBe(false);
    expect(calls).toHaveLength(1);
  }
});
