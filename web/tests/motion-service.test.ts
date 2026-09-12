import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MotionService, MOTION_PREFERENCE_KEY, type SensorEnvironment } from '../src/motion-service';

function environment(options: { permissions?: boolean; secure?: boolean; raw?: string } = {}) {
  const events = new EventTarget(), document = Object.assign(new EventTarget(), { hidden: false });
  let raw = options.raw || null;
  const orientation = vi.fn(async () => 'granted'), motion = vi.fn(async () => 'granted');
  const write = vi.fn((value: string) => { raw = value; });
  const add = vi.spyOn(events, 'addEventListener'), remove = vi.spyOn(events, 'removeEventListener');
  const env: SensorEnvironment = {
    events: events as unknown as Window, document: document as unknown as Document,
    secure: options.secure ?? true, supported: { orientation: true, motion: true },
    permissions: options.permissions ? { orientation, motion } : {},
    screenAngle: () => 0, now: () => Date.now(), read: () => raw, write,
  };
  const send = (type: string, values: object) => events.dispatchEvent(Object.assign(new Event(type), values));
  return { env, events, document, orientation, motion, write, add, remove, send };
}
const heading = { alpha: 30, beta: 0, gamma: 0, absolute: true };
const motionReading = { acceleration: { x: 0, y: 0, z: 0 }, rotationRate: { alpha: 0, beta: 0, gamma: 0 }, accelerationIncludingGravity: null };
const services: MotionService[] = [];
const make = (env: SensorEnvironment) => { const service = new MotionService(env); services.push(service); return service; };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { services.splice(0).forEach((s) => s.dispose()); vi.useRealTimers(); });
it('requests both channels synchronously, independent of active listeners', async () => {
  const h = environment({ permissions: true }), s = make(h.env);
  const promise = s.requestFromGesture();
  expect(h.orientation).toHaveBeenCalledTimes(1);
  expect(h.motion).toHaveBeenCalledTimes(1);
  expect(s.getSnapshot().active).toBe(false);
  await promise;
  const release = s.acquire();
  h.send('deviceorientationabsolute', heading); h.send('devicemotion', motionReading);
  vi.advanceTimersByTime(100);
  expect(s.getSnapshot()).toMatchObject({ active: true, orientation: 'available', motion: 'available' });
  release();
  expect(s.getSnapshot()).toMatchObject({ active: false, heading: null, activity: 'uncertain' });
});
it('retains denied permission across starts and reloads while allowing the other channel', async () => {
  const h = environment({ permissions: true }); h.orientation.mockResolvedValue('denied');
  const s = make(h.env); await s.requestFromGesture(); const release = s.acquire();
  h.send('devicemotion', motionReading); h.send('deviceorientationabsolute', heading); vi.advanceTimersByTime(100);
  expect(s.getSnapshot()).toMatchObject({ orientation: 'denied', motion: 'available', heading: null });
  release(); await s.requestFromGesture(); expect(h.orientation).toHaveBeenCalledTimes(1);
  s.dispose(); const reopened = make(h.env); await reopened.requestFromGesture();
  expect(h.orientation).toHaveBeenCalledTimes(1);
  h.orientation.mockResolvedValue('granted'); await reopened.requestFromGesture(true);
  expect(h.orientation).toHaveBeenCalledTimes(2);
});
it('does not restart after a late permission response or after opting out', async () => {
  const h = environment({ permissions: true }); let resolve!: (value: string) => void;
  h.orientation.mockImplementation(() => new Promise((r) => { resolve = r; }));
  const s = make(h.env); const release = s.acquire(); const pending = s.requestFromGesture();
  s.turnOff(); resolve('granted'); await pending;
  expect(s.getSnapshot().active).toBe(false);
  await s.requestFromGesture(); expect(h.orientation).toHaveBeenCalledTimes(1);
  release();
});
it('owns one listener set and releases it only after the last consumer', async () => {
  const h = environment(), s = make(h.env); await s.requestFromGesture();
  const a = s.acquire(), b = s.acquire();
  expect(h.add.mock.calls.filter(([name]) => name === 'devicemotion')).toHaveLength(1);
  a(); expect(s.getSnapshot().active).toBe(true);
  b(); expect(s.getSnapshot().active).toBe(false);
  expect(h.remove.mock.calls.filter(([name]) => name === 'devicemotion')).toHaveLength(1);
});
it('clears sensor history when hidden and only resumes an existing consumer', async () => {
  const h = environment(), s = make(h.env); await s.requestFromGesture(); const release = s.acquire();
  h.send('deviceorientationabsolute', heading); vi.advanceTimersByTime(100);
  expect(s.getSnapshot().heading).not.toBeNull();
  h.document.hidden = true; h.document.dispatchEvent(new Event('visibilitychange'));
  expect(s.getSnapshot()).toMatchObject({ active: false, heading: null });
  h.document.hidden = false; h.document.dispatchEvent(new Event('visibilitychange'));
  expect(s.getSnapshot()).toMatchObject({ active: true, heading: null });
  release(); h.document.dispatchEvent(new Event('visibilitychange'));
  expect(s.getSnapshot().active).toBe(false);
});
it('does not treat exposed APIs with absent data as working sensors', async () => {
  const h = environment(), s = make(h.env); await s.requestFromGesture(); s.acquire();
  vi.advanceTimersByTime(5100);
  expect(s.getSnapshot()).toMatchObject({ orientation: 'unavailable', motion: 'unavailable' });
  h.send('deviceorientationabsolute', heading); h.send('devicemotion', motionReading); vi.advanceTimersByTime(100);
  expect(s.getSnapshot()).toMatchObject({ orientation: 'available', motion: 'available' });
  vi.advanceTimersByTime(2200);
  expect(s.getSnapshot()).toMatchObject({ orientation: 'missing', motion: 'missing', heading: null });
});
it('handles unsupported/insecure contexts and thrown permission requests', async () => {
  const insecure = environment({ secure: false, permissions: true }), a = make(insecure.env);
  await a.requestFromGesture(); a.acquire(); expect(insecure.orientation).not.toHaveBeenCalled();
  expect(a.getSnapshot().active).toBe(false);
  const broken = environment({ permissions: true }); broken.orientation.mockRejectedValue(new Error('Policy blocked'));
  const b = make(broken.env); await b.requestFromGesture(); b.acquire();
  expect(b.getSnapshot().orientation).toBe('unavailable');
});
it('never persists readings and limits sensor-driven notifications to ten per second', async () => {
  const h = environment(), s = make(h.env); await s.requestFromGesture(); s.acquire();
  const notify = vi.fn(); s.subscribe(notify); h.write.mockClear();
  for (let i = 0; i < 1000; i++) { h.send('deviceorientationabsolute', heading); h.send('devicemotion', motionReading); vi.advanceTimersByTime(1); }
  expect(notify).toHaveBeenCalledTimes(10); expect(h.write).not.toHaveBeenCalled();
  s.setMode('phone');
  expect(JSON.parse(h.write.mock.calls[0][0])).toEqual({ enabled: true, asked: true, denied: [], mode: 'phone' });
});
it('handles storage failure and cross-tab opt-out without losing the active session', async () => {
  const h = environment(), s = make(h.env); h.write.mockImplementationOnce(() => { throw new Error('Quota'); });
  await s.requestFromGesture(); s.acquire(); expect(s.getSnapshot().active).toBe(true);
  expect(s.getSnapshot().storageError).toContain('could not be saved');
  h.env.write(JSON.stringify({ enabled: false, asked: true }));
  h.send('storage', { key: MOTION_PREFERENCE_KEY });
  expect(s.getSnapshot().active).toBe(false);
});
it('does not let relative orientation events starve absolute readings', async () => {
  const h = environment(), s = make(h.env); await s.requestFromGesture(); s.acquire();
  h.send('deviceorientation', { ...heading, absolute: false });
  h.send('deviceorientationabsolute', heading); vi.advanceTimersByTime(100);
  expect(s.getSnapshot().heading?.degrees).toBeCloseTo(330);
});
