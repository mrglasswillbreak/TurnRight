import type { GpsFix } from './types';

export type MapOrientationMode = 'travel' | 'north' | 'phone';
export type SensorCapability = 'inactive' | 'requesting' | 'available' | 'denied' | 'unavailable' | 'missing';
export type MotionActivity = 'still' | 'moving' | 'uncertain';
export interface PhoneHeading {
  degrees: number;
  reference: 'magnetic' | 'absolute';
  accuracy: number | null;
  timestamp: number;
}
export interface OrientationReading {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute?: boolean;
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}
export interface VectorReading { x: number | null; y: number | null; z: number | null }
export interface MotionReading {
  acceleration: VectorReading | null;
  accelerationIncludingGravity: VectorReading | null;
  rotationRate: { alpha: number | null; beta: number | null; gamma: number | null } | null;
}
export const MOTION_LIMITS = {
  processMs: 1000 / 30, publishMs: 100, startupMs: 5000, staleMs: 2000,
  headingStaleMs: 1500, rotationGraceMs: 350, smoothingMs: 250,
  compassAccuracy: 30, horizontalProjection: 0.2,
  stillAcceleration: 0.2, stillRotation: 3, stillMs: 3000,
  movingAcceleration: 0.8, movingMs: 1000, gravityMs: 750,
} as const;
export const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
export const wrapDegrees = (n: number) => ((n % 360) + 360) % 360;
export const angleDelta = (a: number, b: number) => ((b - a + 540) % 360) - 180;
const radians = (n: number) => n * Math.PI / 180;

/** Project the current screen's top edge through Rz(alpha) Rx(beta) Ry(gamma).
 * A screen rotation of +90 makes its top edge the device's negative X axis. */
function projectedHeading(alpha: number, beta: number, gamma: number, screen: number) {
  const a = radians(alpha), b = radians(beta), g = radians(gamma), s = radians(screen);
  const x = -Math.sin(s), y = Math.cos(s);
  const rx = Math.cos(g) * x;
  const ry = Math.cos(b) * y + Math.sin(b) * Math.sin(g) * x;
  const east = Math.cos(a) * rx - Math.sin(a) * ry;
  const north = Math.sin(a) * rx + Math.cos(a) * ry;
  return Math.hypot(east, north) < MOTION_LIMITS.horizontalProjection
    ? null : wrapDegrees(Math.atan2(east, north) * 180 / Math.PI);
}
export function normalizeHeading(e: OrientationReading, screen: number, now: number): { heading: PhoneHeading | null; reason: string } {
  if (!finite(e.beta) || !finite(e.gamma) || !finite(screen) || Math.abs(e.beta) > 180 || Math.abs(e.gamma) > 90)
    return { heading: null, reason: 'Waiting for usable orientation readings.' };
  const top = projectedHeading(0, e.beta, e.gamma, screen);
  if (top === null) return { heading: null, reason: 'Hold the phone flatter to show its direction.' };
  if (finite(e.webkitCompassHeading)) {
    const accuracy = e.webkitCompassAccuracy;
    if (accuracy !== undefined && (!finite(accuracy) || accuracy < 0 || accuracy > MOTION_LIMITS.compassAccuracy))
      return { heading: null, reason: 'Compass is unreliable. Move away from magnetic interference.' };
    const natural = projectedHeading(0, e.beta, e.gamma, 0);
    if (natural === null) return { heading: null, reason: 'Hold the phone flatter to show its direction.' };
    return { heading: { degrees: wrapDegrees(e.webkitCompassHeading + angleDelta(natural, top)), reference: 'magnetic', accuracy: accuracy ?? null, timestamp: now }, reason: '' };
  }
  if (e.absolute !== true || !finite(e.alpha))
    return { heading: null, reason: 'A north-referenced compass reading is unavailable.' };
  const degrees = projectedHeading(e.alpha, e.beta, e.gamma, screen);
  return { heading: degrees === null ? null : { degrees, reference: 'absolute', accuracy: null, timestamp: now }, reason: '' };
}
const vector = (v: VectorReading | null): [number, number, number] | null =>
  v && finite(v.x) && finite(v.y) && finite(v.z) ? [v.x, v.y, v.z] : null;

/** Advisory only. This class has no access to GPS, routing, recording or storage. */
export class MotionProcessor {
  heading: PhoneHeading | null = null;
  reason = '';
  activity: MotionActivity = 'uncertain';
  lastMotion = -Infinity;
  lastAcceleration = -Infinity;
  lastRotation = -Infinity;
  private lastTurning = -Infinity;
  private lastOrientation = -Infinity;
  private lastProcessedMotion = -Infinity;
  private orientationScreen = 0;
  private gravity: number[] | null = null;
  private gravitySince = 0;
  private activitySince: number | null = null;
  private candidate: MotionActivity = 'uncertain';
  private window: { time: number; acceleration: number; rotation: number | null }[] = [];

  orientation(e: OrientationReading, screen: number, now: number) {
    if (now - this.lastOrientation < MOTION_LIMITS.processMs) return false;
    const next = normalizeHeading(e, screen, now);
    const previous = this.heading;
    this.heading = next.heading;
    this.reason = next.reason;
    if (previous && this.heading && previous.reference === this.heading.reference && screen === this.orientationScreen && now - this.lastOrientation < MOTION_LIMITS.staleMs) {
      const weight = 1 - Math.exp(-(now - this.lastOrientation) / MOTION_LIMITS.smoothingMs);
      this.heading.degrees = wrapDegrees(previous.degrees + angleDelta(previous.degrees, this.heading.degrees) * weight);
    }
    this.lastOrientation = now;
    this.orientationScreen = screen;
    return true;
  }
  motion(e: MotionReading, now: number) {
    if (now - this.lastProcessedMotion < MOTION_LIMITS.processMs) return false;
    const dt = now - this.lastProcessedMotion;
    if (dt > MOTION_LIMITS.staleMs) {
      this.window = []; this.activitySince = null; this.candidate = 'uncertain'; this.gravity = null;
    }
    this.lastProcessedMotion = now;
    let acceleration = vector(e.acceleration);
    if (!acceleration) {
      const total = vector(e.accelerationIncludingGravity);
      if (total) {
        if (!this.gravity) { this.gravity = [...total]; this.gravitySince = now; }
        const weight = 1 - Math.exp(-Math.min(dt, 200) / MOTION_LIMITS.gravityMs);
        this.gravity = this.gravity.map((v, i) => v + weight * (total[i] - v));
        if (now - this.gravitySince >= MOTION_LIMITS.gravityMs)
          acceleration = total.map((v, i) => v - this.gravity![i]) as [number, number, number];
      }
    }
    const rate = e.rotationRate;
    const rotation = rate && finite(rate.alpha) && finite(rate.beta) && finite(rate.gamma)
      ? Math.hypot(rate.alpha, rate.beta, rate.gamma) : null;
    if (rotation !== null) {
      this.lastRotation = now;
      if (rotation >= MOTION_LIMITS.stillRotation) this.lastTurning = now;
    }
    if (!acceleration && rotation === null) { this.activity = 'uncertain'; return false; }
    this.lastMotion = now;
    if (!acceleration) { this.activity = 'uncertain'; this.activitySince = null; this.window = []; return true; }
    this.lastAcceleration = now;
    this.window.push({ time: now, acceleration: Math.hypot(...acceleration), rotation });
    this.window = this.window.filter((s) => now - s.time <= 500);
    const rms = Math.sqrt(this.window.reduce((n, s) => n + s.acceleration ** 2, 0) / this.window.length);
    const rotationRms = this.window.every((s) => s.rotation !== null)
      ? Math.sqrt(this.window.reduce((n, s) => n + s.rotation! ** 2, 0) / this.window.length) : null;
    const candidate: MotionActivity = rms > MOTION_LIMITS.movingAcceleration ? 'moving'
      : rms < MOTION_LIMITS.stillAcceleration && rotationRms !== null && rotationRms < MOTION_LIMITS.stillRotation ? 'still' : 'uncertain';
    if (candidate !== this.candidate) { this.activitySince = now; this.candidate = candidate; }
    const elapsed = now - (this.activitySince ?? now);
    this.activity = candidate === 'still' && elapsed >= MOTION_LIMITS.stillMs ? 'still'
      : candidate === 'moving' && elapsed >= MOTION_LIMITS.movingMs ? 'moving' : 'uncertain';
    return true;
  }
  tick(now: number) {
    if (now - this.lastAcceleration > MOTION_LIMITS.staleMs) this.activity = 'uncertain';
    if (!this.heading) return;
    const rotatedWithoutHeading = this.lastTurning > this.lastOrientation && now - this.lastOrientation > MOTION_LIMITS.rotationGraceMs;
    const corroboratedStill = now - this.lastRotation <= MOTION_LIMITS.staleMs && this.lastTurning <= this.lastOrientation;
    if (rotatedWithoutHeading || (now - this.lastOrientation > MOTION_LIMITS.headingStaleMs && !corroboratedStill)) {
      this.heading = null;
      this.reason = 'Compass readings interrupted. Waiting for a fresh direction.';
    }
  }
}

export function usableGps(fix: GpsFix | null | undefined, now = Date.now(), accuracy = 35, age = 12000): fix is GpsFix {
  return !!fix && fix.coordinates.every(finite) && finite(fix.accuracy) && fix.accuracy > 0 && fix.accuracy <= accuracy && finite(fix.timestamp) && now - fix.timestamp >= -1000 && now - fix.timestamp <= age;
}
export function travelHeading(fix: GpsFix | null | undefined, now = Date.now()) {
  return usableGps(fix, now) && finite(fix.heading) && finite(fix.speed) && fix.speed > 0.7 ? wrapDegrees(fix.heading) : null;
}
export function cameraDirection(mode: MapOrientationMode, phone: PhoneHeading | null, fix: GpsFix | null | undefined, now = Date.now()) {
  if (mode === 'north') return { bearing: 0, fallback: '' };
  if (mode === 'phone' && phone) return { bearing: phone.degrees, fallback: '' };
  const bearing = travelHeading(fix, now);
  return { bearing, fallback: mode === 'phone' ? bearing === null ? 'Phone-up: holding map direction until compass or GPS direction returns.' : 'Phone-up: using GPS travel direction while compass is unavailable.' : '' };
}
