import { type Page } from '@playwright/test';
import type { Position } from '../../src/types';

export // Controlled hardware/permissions only. MapLibre and its pointer/camera behavior
// are real in both Chromium and WebKit.
async function sensorHardware(
  page: Page,
  permission: 'granted' | 'denied' = 'granted',
) {
  await page.addInitScript((permission) => {
    // A phone-sized WebKit viewport can retain the host's landscape screen
    // angle. Make the simulated hardware orientation match the portrait trace.
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: Object.assign(new EventTarget(), {
        angle: 0,
        type: 'portrait-primary',
      }),
    });
    Object.defineProperty(window, 'orientation', {
      configurable: true,
      value: 0,
    });
    const listeners = new Set<EventListenerOrEventListenerObject>();
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: AddEventListenerOptions,
    ) => {
      if (type === 'devicemotion') listeners.add(listener);
      add(type, listener, options);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: EventListenerOptions,
    ) => {
      if (type === 'devicemotion') listeners.delete(listener);
      remove(type, listener, options);
    }) as typeof window.removeEventListener;
    window.motionTest = {
      permission,
      requests: [],
      heading: 270,
      rotation: 0,
      emit: true,
      listenerCount: () => listeners.size,
    };
    for (const [name, channel] of [
      ['DeviceOrientationEvent', 'orientation'],
      ['DeviceMotionEvent', 'motion'],
    ] as const) {
      Object.defineProperty(window, name, {
        configurable: true,
        value: class extends Event {
          static requestPermission() {
            window.motionTest.requests.push({
              channel,
              activated: navigator.userActivation.isActive,
              gpsWatches: window.surveyGpsWatchCount,
            });
            return Promise.resolve(window.motionTest.permission);
          }
        },
      });
    }
    setInterval(() => {
      const state = window.motionTest;
      if (!state.emit) return;
      window.dispatchEvent(
        Object.assign(new Event('deviceorientation'), {
          alpha: 90,
          beta: 20,
          gamma: 0,
          absolute: false,
          webkitCompassHeading: state.heading,
          webkitCompassAccuracy: 5,
        }),
      );
      window.dispatchEvent(
        Object.assign(new Event('devicemotion'), {
          acceleration: { x: 0, y: 0, z: 0 },
          accelerationIncludingGravity: null,
          rotationRate: { alpha: state.rotation, beta: 0, gamma: 0 },
        }),
      );
    }, 50);
  }, permission);
}

export async function setPageHidden(page: Page, hidden: boolean) {
  await page.evaluate((hidden) => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: hidden,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

export async function surveyGps(page: Page) {
  await page.addInitScript(() => {
    window.surveyGpsWatchCount = 0;
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition(callback: (p: GeolocationPosition) => void) {
          window.surveyGps = callback;
          window.surveyGpsWatchCount++;
          return 1;
        },
        clearWatch() {
          window.surveyGps = undefined;
        },
      },
    });
  });
}

export async function pushSurveyFix(
  page: Page,
  coordinates: Position,
  accuracy = 5,
) {
  await page.waitForFunction(() => typeof window.surveyGps === 'function');
  await page.evaluate(
    ({ coordinates, accuracy }) => {
      window.surveyGps?.({
        coords: {
          longitude: coordinates[0],
          latitude: coordinates[1],
          accuracy,
          heading: null,
          speed: null,
          altitude: null,
          altitudeAccuracy: null,
          toJSON() {
            return {};
          },
        },
        timestamp: Date.now(),
        toJSON() {
          return {};
        },
      });
    },
    { coordinates, accuracy },
  );
}

export async function aimCrosshair(page: Page, coordinates: Position) {
  await page.evaluate((coordinates) => {
    const map = window.editorTestMap;
    map.stop();
    map.easeTo({
      center: coordinates,
      offset: [
        0,
        map.getCanvas().clientHeight * (innerWidth < 700 ? -0.18 : 0),
      ],
      zoom: 20,
      duration: 0,
    });
  }, coordinates);
}
