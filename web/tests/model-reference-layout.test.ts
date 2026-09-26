import { describe, expect, it } from 'vitest';
import {
  referenceFits,
  referenceModelWidth,
} from '../src/model-reference-layout';

describe('reference layout capacity', () => {
  it('uses usable canvas dimensions, including zoom and keyboard reductions', () => {
    expect(referenceFits(720, 320)).toBe(true);
    expect(referenceFits(719, 900)).toBe(false);
    expect(referenceFits(1400, 319)).toBe(false);
  });
  it('preserves minimum model and photo space at either divider limit', () => {
    expect(referenceModelWidth(720, 0.1)).toBe(420);
    expect(referenceModelWidth(720, 0.9)).toBe(428);
    expect(referenceModelWidth(1200, 0.6)).toBe(720);
  });
});
