import { expect, it } from 'vitest';
import {
  cloudOpacity,
  globeRotationSpeed,
  mayRotateGlobe,
} from '../src/world-motion';
it('slows rotation and removes clouds before reaching the campus', () => {
  expect(globeRotationSpeed(0)).toBe(1.5);
  expect(globeRotationSpeed(3)).toBe(1.5);
  expect(globeRotationSpeed(4)).toBe(0.75);
  expect(globeRotationSpeed(5)).toBe(0);
  expect(cloudOpacity(4)).toBe(0.42);
  expect(cloudOpacity(5)).toBe(0.21);
  expect(cloudOpacity(6)).toBe(0);
});
it('gives interactions and navigation priority over rotation', () => {
  const state = {
    enabled: true,
    blocked: false,
    hidden: false,
    moving: false,
    lastInteraction: 0,
    now: 8000,
    zoom: 1,
  };
  expect(mayRotateGlobe(state)).toBe(true);
  for (const change of [
    { enabled: false },
    { blocked: true },
    { hidden: true },
    { moving: true },
    { now: 7999 },
    { zoom: 5 },
  ])
    expect(mayRotateGlobe({ ...state, ...change })).toBe(false);
});
