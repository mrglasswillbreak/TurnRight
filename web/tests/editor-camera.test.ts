import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Map as MapInstance } from 'maplibre-gl';
import type { Geometry } from 'geojson';
import { focusEditorSelection, selectionBounds } from '../src/editor-camera';

afterEach(() => vi.unstubAllGlobals());

function camera(mobile: boolean, fittedZoom = 12) {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: mobile }) });
  const easeTo = vi.fn();
  const map = {
    getContainer: () => ({
      getBoundingClientRect: () => ({
        width: 390,
        height: 844,
        top: 0,
        bottom: 844,
        left: 0,
        right: 390,
      }),
      closest: () => null,
    }),
    getZoom: () => 18,
    getCenter: () => ({ lng: 3.203, lat: 6.462 }),
    getBearing: () => 25,
    getPitch: () => 50,
    cameraForBounds: () => ({ zoom: fittedZoom }),
    easeTo,
  } as unknown as MapInstance;
  return { map, easeTo };
}

const longPath: Geometry = {
  type: 'LineString',
  coordinates: [
    [3.2, 6.46],
    [3.2, 6.48],
    [3.22, 6.48],
    [3.22, 6.46],
  ],
};

describe('mobile path selection', () => {
  it('limits zoom-out and keeps the tapped stretch in view with its current tilt', () => {
    const { map, easeTo } = camera(true);
    focusEditorSelection(map, longPath, [3.219, 6.465]);
    const next = easeTo.mock.calls[0][0];
    expect(next.zoom).toBe(17.25);
    expect(next.center[0]).toBeCloseTo(3.22);
    expect(next.center[1]).toBeCloseTo(6.465);
    expect(next).toMatchObject({ bearing: 25, pitch: 50, duration: 550 });
  });

  it('uses the stretch nearest the current view when selected from a list', () => {
    const { map, easeTo } = camera(true);
    focusEditorSelection(map, longPath);
    const next = easeTo.mock.calls[0][0];
    expect(next.zoom).toBe(17.25);
    expect(next.center[0]).toBeCloseTo(3.2);
    expect(next.center[1]).toBeCloseTo(6.462);
  });

  it('finds the tapped section across multipart paths', () => {
    const { map, easeTo } = camera(true);
    focusEditorSelection(
      map,
      {
        type: 'MultiLineString',
        coordinates: [
          [
            [3.2, 6.46],
            [3.2, 6.48],
          ],
          [
            [3.22, 6.46],
            [3.22, 6.48],
          ],
        ],
      },
      [3.221, 6.47],
    );
    expect(easeTo.mock.calls[0][0].center[0]).toBeCloseTo(3.22);
  });

  it('still fits short paths without unnecessary zoom-out', () => {
    const { map, easeTo } = camera(true, 17.6);
    focusEditorSelection(map, longPath);
    const next = easeTo.mock.calls[0][0];
    expect(next.zoom).toBe(17.6);
    expect(next.center[0]).toBeCloseTo(3.21);
    expect(next.center[1]).toBeCloseTo(6.47);
  });

  it('continues fitting entire paths on desktop and buildings on mobile', () => {
    const desktop = camera(false);
    focusEditorSelection(desktop.map, longPath);
    expect(desktop.easeTo.mock.calls[0][0].zoom).toBe(12);
    const mobile = camera(true);
    focusEditorSelection(mobile.map, {
      type: 'Polygon',
      coordinates: [
        [
          [3.2, 6.46],
          [3.2, 6.48],
          [3.22, 6.46],
          [3.2, 6.46],
        ],
      ],
    });
    expect(mobile.easeTo.mock.calls[0][0].zoom).toBe(12);
  });
});

describe('editor selection framing', () => {
  it('includes the full path, including bends beyond its endpoints', () => {
    expect(
      selectionBounds({
        type: 'LineString',
        coordinates: [
          [3.2, 6.46],
          [3.21, 6.48],
          [3.22, 6.47],
        ],
      }),
    ).toEqual([
      [3.2, 6.46],
      [3.22, 6.48],
    ]);
  });

  it('frames every part of a multipart building', () => {
    expect(
      selectionBounds({
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [3.2, 6.46],
              [3.21, 6.46],
              [3.2, 6.47],
              [3.2, 6.46],
            ],
          ],
          [
            [
              [3.23, 6.48],
              [3.24, 6.48],
              [3.23, 6.49],
              [3.23, 6.48],
            ],
          ],
        ],
      }),
    ).toEqual([
      [3.2, 6.46],
      [3.24, 6.49],
    ]);
  });

  it('handles points and ignores geometry with no usable coordinates', () => {
    expect(
      selectionBounds({ type: 'Point', coordinates: [3.2, 6.46] }),
    ).toEqual([
      [3.2, 6.46],
      [3.2, 6.46],
    ]);
    expect(selectionBounds({ type: 'LineString', coordinates: [] })).toBeNull();
  });
});
