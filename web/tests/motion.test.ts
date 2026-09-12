import { describe, expect, it } from 'vitest';
import {
  MotionProcessor,
  normalizeHeading,
  angleDelta,
  cameraDirection,
  MOTION_LIMITS,
  type MotionReading,
  type OrientationReading,
} from '../src/motion-model';
import { advanceNavigation, initialNavigation } from '../src/navigation';
import { acceptSample, newSurvey, proposeGeometry } from '../src/survey-model';
import { campusFixture } from './fixture';
import { findRoutes } from '../src/routing';
import type { GpsFix } from '../src/types';

const north: OrientationReading = {
  alpha: 0,
  beta: 0,
  gamma: 0,
  absolute: true,
};
const reading = (acceleration = 0, rotation = 0): MotionReading => ({
  acceleration: { x: acceleration, y: 0, z: 0 },
  accelerationIncludingGravity: null,
  rotationRate: { alpha: rotation, beta: 0, gamma: 0 },
});
function feed(
  p: MotionProcessor,
  start: number,
  end: number,
  acceleration: number,
  rotation = 0,
) {
  for (let t = start; t <= end; t += 40)
    p.motion(reading(acceleration, rotation), t);
}
describe('phone heading normalization', () => {
  it('requires a north reference and treats zero as a valid heading', () => {
    expect(
      normalizeHeading({ ...north, absolute: false }, 0, 0).heading,
    ).toBeNull();
    expect(normalizeHeading(north, 0, 0).heading?.degrees).toBe(0);
    expect(
      normalizeHeading({ ...north, alpha: 90 }, 0, 0).heading?.degrees,
    ).toBe(270);
  });
  it('compensates portrait, landscape and upside-down screens', () => {
    for (const [screen, expected] of [
      [0, 0],
      [90, 270],
      [180, 180],
      [270, 90],
    ])
      expect(normalizeHeading(north, screen, 0).heading?.degrees).toBeCloseTo(
        expected,
      );
    expect(
      normalizeHeading({ ...north, beta: 45 }, 0, 0).heading?.degrees,
    ).toBe(0);
  });
  it('rejects tilt singularities and malformed orientation', () => {
    expect(normalizeHeading({ ...north, beta: 90 }, 0, 0).heading).toBeNull();
    expect(
      normalizeHeading({ ...north, gamma: null }, 0, 0).heading,
    ).toBeNull();
    expect(normalizeHeading({ ...north, alpha: NaN }, 0, 0).heading).toBeNull();
    expect(
      normalizeHeading({ ...north, beta: Infinity }, 0, 0).heading,
    ).toBeNull();
  });
  it('prefers valid Apple magnetic headings and never invents compass accuracy', () => {
    const apple = {
      ...north,
      webkitCompassHeading: 42,
      webkitCompassAccuracy: 8,
    };
    expect(normalizeHeading(apple, 0, 0).heading).toMatchObject({
      degrees: 42,
      reference: 'magnetic',
      accuracy: 8,
    });
    expect(normalizeHeading(apple, 90, 0).heading?.degrees).toBe(312);
    for (const accuracy of [-1, NaN, 31])
      expect(
        normalizeHeading({ ...apple, webkitCompassAccuracy: accuracy }, 0, 0)
          .heading,
      ).toBeNull();
    expect(
      normalizeHeading({ ...apple, webkitCompassAccuracy: undefined }, 0, 0)
        .heading?.accuracy,
    ).toBeNull();
  });
  it('smooths through north using the shortest angular difference', () => {
    const p = new MotionProcessor();
    p.orientation({ ...north, alpha: 1 }, 0, 0);
    p.orientation({ ...north, alpha: 359 }, 0, 100);
    expect(Math.abs(angleDelta(359, p.heading!.degrees))).toBeLessThan(2);
    expect(p.heading!.degrees).not.toBeCloseTo(180);
    p.orientation(north, 90, 200);
    expect(p.heading!.degrees).toBe(270); // screen changes reset smoothing
  });
  it('keeps a sparse unchanged heading only with fresh non-rotating evidence', () => {
    const p = new MotionProcessor();
    p.orientation(north, 0, 0);
    feed(p, 0, 5000, 0);
    p.tick(5000);
    expect(p.heading).not.toBeNull();
    p.motion(reading(0, 20), 5040);
    p.tick(5040);
    expect(p.heading).toBeNull();
    p.orientation(north, 0, 5080);
    p.tick(8000);
    expect(p.heading).toBeNull();
  });
  it('expires orientation-only readings without motion corroboration', () => {
    const p = new MotionProcessor();
    p.orientation(north, 0, 0);
    p.tick(MOTION_LIMITS.headingStaleMs + 1);
    expect(p.heading).toBeNull();
  });
});
describe('advisory motion state', () => {
  it('requires sustained evidence and resets after gaps', () => {
    const p = new MotionProcessor();
    feed(p, 0, 2960, 0);
    expect(p.activity).toBe('uncertain');
    feed(p, 3000, 3200, 0);
    expect(p.activity).toBe('still');
    feed(p, 3240, 5000, 2);
    expect(p.activity).toBe('moving');
    p.tick(8000);
    expect(p.activity).toBe('uncertain');
    p.motion(reading(0), 8040);
    expect(p.activity).toBe('uncertain');
  });
  it('does not call rotation alone walking or classify missing gyro as still', () => {
    const p = new MotionProcessor();
    feed(p, 0, 5000, 0, 45);
    expect(p.activity).toBe('uncertain');
    const partial = new MotionProcessor();
    for (let t = 0; t < 5000; t += 40)
      partial.motion({ ...reading(), rotationRate: null }, t);
    expect(partial.activity).toBe('uncertain');
    for (let t = 5000; t < 7000; t += 40)
      partial.motion({ ...reading(2), rotationRate: null }, t);
    expect(partial.activity).toBe('moving');
  });
  it('removes gravity and ignores empty/nonfinite fields', () => {
    const p = new MotionProcessor();
    for (let t = 0; t < 5000; t += 40)
      p.motion(
        {
          ...reading(),
          acceleration: null,
          accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 },
        },
        t,
      );
    expect(p.activity).toBe('still');
    expect(
      p.motion(
        {
          ...reading(),
          acceleration: { x: NaN, y: 0, z: 0 },
          rotationRate: null,
        },
        5100,
      ),
    ).toBe(false);
    expect(p.activity).toBe('uncertain');
  });
  it('throttles high-frequency callbacks', () => {
    const p = new MotionProcessor();
    let count = 0;
    for (let t = 0; t < 1000; t++) if (p.motion(reading(), t)) count++;
    expect(count).toBeLessThanOrEqual(30);
  });
});
it('keeps travel direction separate and uses explicit camera fallbacks', () => {
  const fix: GpsFix = {
    coordinates: [3.2, 6.46],
    timestamp: 1000,
    accuracy: 5,
    heading: 90,
    speed: 1,
  };
  const phone = {
    degrees: 270,
    timestamp: 0,
    reference: 'magnetic' as const,
    accuracy: null,
  };
  expect(cameraDirection('travel', phone, fix, 1000).bearing).toBe(90);
  expect(cameraDirection('phone', phone, fix, 1000).bearing).toBe(270);
  expect(cameraDirection('phone', null, fix, 1000).bearing).toBe(90);
  expect(
    cameraDirection('phone', null, { ...fix, speed: 0 }, 1000).bearing,
  ).toBeNull();
  expect(cameraDirection('phone', null, fix, 30000).bearing).toBeNull();
  expect(cameraDirection('north', phone, fix, 1000).bearing).toBe(0);
});
it('identical GPS gives identical routes, navigation and survey geometry despite motion failures', () => {
  const data = campusFixture();
  const route = findRoutes(data, 'a', 'c')[0];
  const replay = (sensors: boolean) => {
    const p = new MotionProcessor(),
      survey = newSurvey('owner', 'source');
    let nav = initialNavigation;
    for (let i = 0; i <= 8; i++) {
      const time = 10000 + i * 2000;
      const fix: GpsFix = {
        coordinates: [3.2 + i * 0.00002, 6.46],
        timestamp: time,
        accuracy: 5,
        heading: 90,
        speed: 1,
      };
      if (sensors) {
        p.motion(reading(i * 5, i * 20), time);
        p.orientation({ ...north, alpha: i % 2 ? NaN : 180 }, 0, time);
        p.tick(time + 5000);
      }
      nav = advanceNavigation(route, fix, nav, time);
      acceptSample(survey, fix, time);
    }
    return {
      nav,
      geometry: proposeGeometry(survey).map((s) =>
        s.vertices.map((v) => v.coordinates),
      ),
      samples: survey.samples.map(({ coordinates, status }) => ({
        coordinates,
        status,
      })),
    };
  };
  expect(replay(true)).toEqual(replay(false));
});
