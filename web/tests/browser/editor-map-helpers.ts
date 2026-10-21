import type { Map as MapInstance } from 'maplibre-gl';
import { expect, type Page } from '@playwright/test';
import type { Position } from '../../src/types';

declare global {
  interface Window {
    editorTestMap: MapInstance;
    previewBuilds: string[][];
    surveyGps?: (fix: GeolocationPosition) => void;
    surveyGpsWatchCount: number;
    globeTrace?: { coordinates: [number, number]; timer: number };
    motionTest: {
      permission: 'granted' | 'denied';
      requests: { channel: string; activated: boolean; gpsWatches: number }[];
      heading: number;
      rotation: number;
      emit: boolean;
      listenerCount: () => number;
    };
  }
}

export interface RefHook {
  memoizedState?: { current?: unknown };
  next?: RefHook;
}

export interface RefFiber {
  memoizedState?: RefHook;
  return?: RefFiber;
}

export // Read the actual MapLibre instance from the mounted React ref. No map, renderer,
// geometry controller, or pointer event is mocked or replaced by this test.
async function attachMap(page: Page) {
  await page.waitForFunction(() => {
    const element = document.querySelector('.map-canvas') as HTMLElement &
      Record<string, unknown>;
    const key = Object.keys(element || {}).find((k) =>
      k.startsWith('__reactFiber'),
    );
    let fiber = (key ? element[key] : undefined) as RefFiber | undefined;
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const value = hook.memoizedState?.current as MapInstance | undefined;
        if (
          typeof value?.getCanvas === 'function' &&
          typeof value?.project === 'function'
        ) {
          window.editorTestMap = value;
          return value.loaded();
        }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return false;
  });
}

export async function position(page: Page, coordinates: Position) {
  return page.evaluate((coordinates) => {
    const map = window.editorTestMap;
    const p = map.project(coordinates),
      rect = map.getCanvas().getBoundingClientRect();
    return { x: rect.left + p.x, y: rect.top + p.y };
  }, coordinates);
}

export async function clickMap(page: Page, coordinates: Position) {
  // React pane changes and MapLibre resizing both commit on animation frames.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const map = window.editorTestMap;
        return (
          !map.isMoving() &&
          Math.abs(
            map.getCanvas().width / map.getPixelRatio() -
              map.getContainer().clientWidth,
          ) < 1 &&
          Math.abs(
            map.getCanvas().height / map.getPixelRatio() -
              map.getContainer().clientHeight,
          ) < 1
        );
      }),
    )
    .toBe(true);
  // Reframe fixture points that are outside the canvas or beneath a real
  // control (including the drawing guidance), just as a user would pan.
  await page.evaluate((coordinates) => {
    const map = window.editorTestMap;
    const point = map.project(coordinates);
    const canvas = map.getCanvas();
    const rect = canvas.getBoundingClientRect();
    if (
      point.x < 70 ||
      point.x > rect.width - 70 ||
      point.y < 70 ||
      point.y > rect.height - 150 ||
      document.elementFromPoint(rect.left + point.x, rect.top + point.y) !==
        canvas
    )
      map.panTo(coordinates, { duration: 0 });
  }, coordinates);
  // Selection queries must observe the newly rendered viewport, not tiles
  // left over from the previous pane dimensions or camera.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const map = window.editorTestMap;
        map.once('render', () => resolve());
        map.triggerRepaint();
      }),
  );
  const p = await page.evaluate((coordinates) => {
    const point = window.editorTestMap.project(coordinates);
    return { x: point.x, y: point.y };
  }, coordinates);
  await page.locator('.maplibregl-canvas').click({ position: p });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
}

export async function focusCampus(page: Page) {
  await page.evaluate(
    () =>
      void window.editorTestMap.jumpTo({
        center: [3.2003, 6.4602],
        zoom: 19,
        bearing: 0,
        pitch: 0,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
      }),
  );
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
    .toBe(false);
}
