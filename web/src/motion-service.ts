import {
  MOTION_LIMITS,
  MotionProcessor,
  type MapOrientationMode,
  type MotionActivity,
  type MotionReading,
  type OrientationReading,
  type PhoneHeading,
  type SensorCapability,
} from './motion-model';

export const MOTION_PREFERENCE_KEY = 'turnright:motion-assistance:v1';
type Channel = 'orientation' | 'motion';
export interface MotionPreferences {
  enabled: boolean;
  asked: boolean;
  denied: Channel[];
  mode: MapOrientationMode;
}
export interface MotionSnapshot {
  preferences: MotionPreferences;
  active: boolean;
  orientation: SensorCapability;
  motion: SensorCapability;
  heading: PhoneHeading | null;
  activity: MotionActivity;
  reason: string;
  storageError: string;
}
export interface SensorEnvironment {
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  document: Pick<
    Document,
    'addEventListener' | 'removeEventListener' | 'hidden'
  >;
  screenEvents?: Pick<
    ScreenOrientation,
    'addEventListener' | 'removeEventListener'
  >;
  secure: boolean;
  supported: Record<Channel, boolean>;
  permissions: Partial<Record<Channel, () => Promise<string>>>;
  screenAngle: () => number;
  now: () => number;
  read: () => string | null;
  write: (value: string) => void;
}
const defaults = (): MotionPreferences => ({
  enabled: false,
  asked: false,
  denied: [],
  mode: 'travel',
});
function preferences(raw: string | null): MotionPreferences {
  try {
    const p = JSON.parse(raw || '{}');
    return {
      enabled: p.enabled === true,
      asked: p.asked === true,
      denied: Array.isArray(p.denied)
        ? p.denied.filter((v: string) => v === 'orientation' || v === 'motion')
        : [],
      mode: ['travel', 'north', 'phone'].includes(p.mode) ? p.mode : 'travel',
    };
  } catch {
    return defaults();
  }
}
export class MotionService {
  private state: MotionSnapshot;
  private listeners = new Set<() => void>();
  private clients = new Set<symbol>();
  private processor = new MotionProcessor();
  private attached = false;
  private started = 0;
  private timer?: ReturnType<typeof setInterval>;
  private attempted = new Set<Channel>();
  private pending = new Set<Channel>();
  private failures = new Set<Channel>();
  private generation = 0;
  private heard: Record<Channel, boolean> = {
    orientation: false,
    motion: false,
  };
  constructor(private env: SensorEnvironment) {
    let pref = defaults();
    try {
      pref = preferences(env.read());
    } catch {
      /* session-only preference */
    }
    this.state = {
      preferences: pref,
      active: false,
      orientation: 'inactive',
      motion: 'inactive',
      heading: null,
      activity: 'uncertain',
      reason: '',
      storageError: '',
    };
    env.document.addEventListener('visibilitychange', this.visibility);
    env.events.addEventListener('pagehide', this.pagehide);
    env.events.addEventListener('pageshow', this.visibility);
    env.events.addEventListener('storage', this.storage);
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish() {
    const now = this.env.now();
    this.processor.tick(now);
    const capability = (channel: Channel): SensorCapability => {
      if (this.state.preferences.denied.includes(channel)) return 'denied';
      if (this.pending.has(channel)) return 'requesting';
      if (
        !this.env.secure ||
        !this.env.supported[channel] ||
        this.failures.has(channel)
      )
        return 'unavailable';
      if (!this.attached || !this.state.preferences.enabled) return 'inactive';
      if (this.env.permissions[channel] && !this.attempted.has(channel))
        return 'inactive';
      if (channel === 'orientation' && this.processor.heading)
        return 'available';
      if (
        channel === 'motion' &&
        now - this.processor.lastMotion <= MOTION_LIMITS.staleMs
      )
        return 'available';
      if (this.heard[channel]) return 'missing';
      return now - this.started < MOTION_LIMITS.startupMs
        ? 'requesting'
        : 'unavailable';
    };
    this.state = {
      ...this.state,
      active: this.attached,
      orientation: capability('orientation'),
      motion: capability('motion'),
      heading: this.attached
        ? this.processor.heading && { ...this.processor.heading }
        : null,
      activity: this.attached ? this.processor.activity : 'uncertain',
      reason: this.attached ? this.processor.reason : '',
    };
    this.listeners.forEach((fn) => fn());
  }
  private save(p: MotionPreferences) {
    this.state = { ...this.state, preferences: p, storageError: '' };
    try {
      this.env.write(JSON.stringify(p));
    } catch {
      this.state.storageError =
        'Sensor preference could not be saved. This session still works.';
    }
  }
  setMode(mode: MapOrientationMode) {
    this.save({ ...this.state.preferences, mode });
    this.publish();
  }
  /** Call only from the actual user gesture, never a GPS effect or auth callback.
   * Both browser calls are invoked synchronously before returning the promise. */
  requestFromGesture = (retry = false): Promise<void> => {
    const p = this.state.preferences;
    if (p.asked && !p.enabled && !retry) return Promise.resolve();
    this.save({
      ...p,
      asked: true,
      enabled: true,
      denied: retry ? [] : p.denied,
    });
    if (retry) {
      this.attempted.clear();
      this.failures.clear();
    }
    const generation = this.generation;
    const requests: Promise<void>[] = [];
    for (const channel of ['orientation', 'motion'] as const) {
      if (
        !this.env.secure ||
        !this.env.supported[channel] ||
        this.state.preferences.denied.includes(channel) ||
        this.attempted.has(channel) ||
        this.pending.has(channel)
      )
        continue;
      this.attempted.add(channel);
      const request = this.env.permissions[channel];
      if (!request) continue;
      this.pending.add(channel);
      let result: Promise<string>;
      try {
        result = request();
      } catch (error) {
        result = Promise.reject(error);
      }
      requests.push(
        result
          .then((permission) => {
            if (generation !== this.generation) return;
            if (permission !== 'granted')
              this.save({
                ...this.state.preferences,
                denied: [
                  ...new Set([...this.state.preferences.denied, channel]),
                ],
              });
          })
          .catch((error: unknown) => {
            if (generation !== this.generation) return;
            if (error instanceof Error && error.name === 'NotAllowedError')
              this.save({
                ...this.state.preferences,
                denied: [
                  ...new Set([...this.state.preferences.denied, channel]),
                ],
              });
            else this.failures.add(channel);
          })
          .finally(() => {
            if (generation !== this.generation) return;
            this.pending.delete(channel);
            this.reconcile();
          }),
      );
    }
    this.reconcile();
    return Promise.all(requests).then(() => {});
  };
  turnOff = () => {
    this.generation++;
    this.pending.clear();
    this.attempted.clear();
    this.save({ ...this.state.preferences, asked: true, enabled: false });
    this.reconcile();
  };
  acquire = () => {
    const client = Symbol('motion-consumer');
    this.clients.add(client);
    this.reconcile();
    return () => {
      this.clients.delete(client);
      this.reconcile();
    };
  };
  private permitted(channel: Channel) {
    return (
      this.env.supported[channel] &&
      !this.pending.has(channel) &&
      !this.failures.has(channel) &&
      !this.state.preferences.denied.includes(channel) &&
      (!this.env.permissions[channel] || this.attempted.has(channel))
    );
  }
  private orientation = (event: Event) => {
    if (
      !this.attached ||
      this.env.document.hidden ||
      !this.permitted('orientation')
    )
      return;
    const reading = event as unknown as OrientationReading;
    // A relative event must not replace a separately supplied absolute event.
    if (!reading.absolute && !Number.isFinite(reading.webkitCompassHeading)) {
      this.heard.orientation = true;
      if (!this.processor.heading)
        this.processor.reason =
          'A north-referenced compass reading is unavailable.';
      return;
    }
    if (
      this.processor.orientation(
        reading,
        this.env.screenAngle(),
        this.env.now(),
      )
    )
      this.heard.orientation = true;
  };
  private motion = (event: Event) => {
    if (!this.attached || this.env.document.hidden || !this.permitted('motion'))
      return;
    if (
      this.processor.motion(event as unknown as MotionReading, this.env.now())
    )
      this.heard.motion = true;
  };
  private screen = () => {
    this.processor = new MotionProcessor();
    this.publish();
  };
  private visibility = () => this.reconcile();
  private pagehide = () => {
    this.detach();
    this.publish();
  };
  private storage = (event: Event) => {
    if ((event as StorageEvent).key !== MOTION_PREFERENCE_KEY) return;
    try {
      const p = preferences(this.env.read());
      if (!p.enabled) {
        this.generation++;
        this.pending.clear();
        this.attempted.clear();
      }
      this.state = { ...this.state, preferences: p };
      this.reconcile();
    } catch {
      /* keep the active session preference */
    }
  };
  private reconcile() {
    const wanted =
      this.clients.size > 0 &&
      this.state.preferences.enabled &&
      this.env.secure &&
      !this.env.document.hidden &&
      (['orientation', 'motion'] as const).some(
        (channel) =>
          this.env.supported[channel] &&
          !this.state.preferences.denied.includes(channel) &&
          !this.failures.has(channel),
      );
    if (wanted && !this.attached) {
      this.attached = true;
      this.started = this.env.now();
      this.heard = { orientation: false, motion: false };
      this.env.events.addEventListener('deviceorientation', this.orientation);
      this.env.events.addEventListener(
        'deviceorientationabsolute',
        this.orientation,
      );
      this.env.events.addEventListener('devicemotion', this.motion);
      this.env.events.addEventListener('orientationchange', this.screen);
      this.env.screenEvents?.addEventListener('change', this.screen);
      this.timer = setInterval(() => this.publish(), MOTION_LIMITS.publishMs);
    } else if (!wanted) this.detach();
    this.publish();
  }
  private detach() {
    if (this.attached) {
      this.env.events.removeEventListener(
        'deviceorientation',
        this.orientation,
      );
      this.env.events.removeEventListener(
        'deviceorientationabsolute',
        this.orientation,
      );
      this.env.events.removeEventListener('devicemotion', this.motion);
      this.env.events.removeEventListener('orientationchange', this.screen);
      this.env.screenEvents?.removeEventListener('change', this.screen);
    }
    this.attached = false;
    clearInterval(this.timer);
    this.timer = undefined;
    this.processor = new MotionProcessor();
  }
  dispose() {
    this.generation++;
    this.pending.clear();
    this.clients.clear();
    this.detach();
    this.env.document.removeEventListener('visibilitychange', this.visibility);
    this.env.events.removeEventListener('pagehide', this.pagehide);
    this.env.events.removeEventListener('pageshow', this.visibility);
    this.env.events.removeEventListener('storage', this.storage);
    this.listeners.clear();
  }
}
let service: MotionService | undefined;
export function motionService() {
  if (!service) {
    type PermissionConstructor = {
      requestPermission?: (absolute?: boolean) => Promise<string>;
    };
    const orientation = window.DeviceOrientationEvent as
      | PermissionConstructor
      | undefined;
    const motion = window.DeviceMotionEvent as
      | PermissionConstructor
      | undefined;
    service = new MotionService({
      events: window,
      document,
      screenEvents: screen.orientation,
      secure: window.isSecureContext,
      supported: { orientation: !!orientation, motion: !!motion },
      permissions: {
        ...(orientation?.requestPermission
          ? { orientation: () => orientation.requestPermission!(true) }
          : {}),
        ...(motion?.requestPermission
          ? { motion: () => motion.requestPermission!() }
          : {}),
      },
      screenAngle: () =>
        screen.orientation?.angle ??
        (window as Window & { orientation?: number }).orientation ??
        0,
      now: () => performance.now(),
      read: () => localStorage.getItem(MOTION_PREFERENCE_KEY),
      write: (value) => localStorage.setItem(MOTION_PREFERENCE_KEY, value),
    });
  }
  return service;
}
