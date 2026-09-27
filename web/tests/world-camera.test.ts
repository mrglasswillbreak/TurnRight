import { describe, expect, it } from 'vitest';
import { globeFitZoom } from '../src/world-camera';


describe('responsive globe silhouette', () => {
  for (const [width, height] of [
    [667, 375],
    [844, 390],
    [390, 844],
    [1024, 768],
    [1440, 900],
  ]) {
    it(`fits the exposed ${width}×${height} viewport, including polar views`, () => {
      const padding = {
        top: height < 500 ? 12 : 76,
        bottom: 132,
        left: 24,
        right: 24,
      };
      for (const latitude of [0, 6.5, 60, 80, -80]) {
        const zoom = globeFitZoom(width, height, latitude, padding);
        const radius =
          (512 * 2 ** zoom) /
          (2 * Math.PI * Math.cos((latitude * Math.PI) / 180));
        const focal = 1.5 * height;
        const silhouette =
          (2 * focal * radius) / Math.sqrt(focal * focal + 2 * focal * radius);
        expect(silhouette).toBeLessThanOrEqual(
          Math.min(width - 48, height - padding.top - padding.bottom) * 0.881,
        );
        expect(Number.isFinite(zoom)).toBe(true);
      }
    });
  }
});

