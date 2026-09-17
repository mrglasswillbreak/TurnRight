import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { Map as MapInstance, StyleSpecification } from 'maplibre-gl';
import {
  CAMPUS_MIN_ZOOM,
  WORLD_MAX_BYTES,
  WORLD_MIN_ZOOM,
  WORLD_PROJECTION,
  WORLD_URL,
  followZoom,
  installWorldLayers,
  loadWorld,
  returnToCampus,
  validWorldData,
  type WorldData,
} from '../src/world-map';
import { mapTheme } from '../src/map-theme';

const bytes = readFileSync(
  new URL('../public/world/countries-v5.1.2.geojson', import.meta.url),
);
const data = JSON.parse(bytes.toString()) as WorldData;
afterEach(() => vi.unstubAllGlobals());

describe('offline world overview', () => {
  it('counts the desktop panel padding once when returning to campus', () => {
    const setPadding = vi.fn(),
      fitBounds = vi.fn();
    const map = {
      setPadding,
      fitBounds,
      getContainer: () => ({
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          bottom: 900,
          width: 1248,
          height: 900,
        }),
        closest: () => ({
          querySelector: () => ({
            getBoundingClientRect: () => ({ right: 464, top: 16, height: 868 }),
          }),
        }),
      }),
    } as unknown as MapInstance;
    const bounds: [[number, number], [number, number]] = [
      [3.19, 6.45],
      [3.21, 6.47],
    ];
    returnToCampus(map, bounds);
    expect(setPadding).toHaveBeenCalledWith({
      top: 76,
      right: 24,
      bottom: 32,
      left: 484,
    });
    expect(fitBounds).toHaveBeenCalledWith(bounds, {
      padding: 20,
      maxZoom: 17,
      duration: 1100,
    });
    expect(setPadding.mock.invocationCallOrder[0]).toBeLessThan(
      fitBounds.mock.invocationCallOrder[0],
    );
  });
  it('bundles valid closed geography and labels covered by the offline font within the size budget', () => {
    expect(validWorldData(data)).toBe(true);
    expect(bytes.byteLength).toBeLessThanOrEqual(WORLD_MAX_BYTES);
    expect(data.features).toHaveLength(177);
    for (const name of ['Nigeria', 'Antarctica', 'Fiji', 'Canada'])
      expect(data.features.some((f) => f.properties.name === name)).toBe(true);
    expect(
      data.features.every((f) =>
        [...f.properties.name].every((letter) => letter.codePointAt(0)! <= 255),
      ),
    ).toBe(true);
    const manifest = JSON.parse(
      readFileSync(
        new URL('../public/packages/latest.json', import.meta.url),
        'utf8',
      ),
    );
    expect(
      manifest.assets.some(
        (a: { url: string }) =>
          a.url === '/glyphs/Open%20Sans%20Semibold/0-255.pbf',
      ),
    ).toBe(true);
  });
  it('rejects malformed geometry and label positions before changing the map', () => {
    for (const invalid of [
      null,
      {},
      { type: 'FeatureCollection', features: [] },
    ])
      expect(validWorldData(invalid)).toBe(false);
    const invalid = structuredClone(data);
    invalid.features[0].properties.labelX = 181;
    expect(validWorldData(invalid)).toBe(false);
    const badRing = structuredClone(data);
    badRing.features[0].geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    };
    expect(validWorldData(badRing)).toBe(false);
  });
  it('loads only the bundled same-origin overview and rejects failed or corrupt downloads', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(bytes));
    vi.stubGlobal('fetch', fetch);
    expect(await loadWorld(new AbortController().signal)).toEqual(data);
    expect(fetch.mock.calls[0][0]).toBe(WORLD_URL);
    fetch.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    await expect(loadWorld(new AbortController().signal)).rejects.toThrow(
      'unavailable',
    );
    fetch.mockResolvedValueOnce(new Response('{}'));
    await expect(loadWorld(new AbortController().signal)).rejects.toThrow(
      'Invalid',
    );
    fetch.mockResolvedValueOnce(new Response(' '.repeat(WORLD_MAX_BYTES + 1)));
    await expect(loadWorld(new AbortController().signal)).rejects.toThrow(
      'too large',
    );
  });
  it('creates valid globe styles in both themes and fades into campus without replacing its background', () => {
    for (const dark of [false, true]) {
      const style: StyleSpecification = {
        version: 8,
        projection: WORLD_PROJECTION,
        glyphs: '/glyphs/{fontstack}/{range}.pbf',
        sources: {},
        layers: [{ id: 'background', type: 'background' }],
      };
      let minimum = CAMPUS_MIN_ZOOM;
      const map = {
        on: vi.fn(),
        getSource: (id: string) => style.sources[id],
        addSource: (
          id: string,
          source: StyleSpecification['sources'][string],
        ) => {
          style.sources[id] = source;
        },
        addLayer: (layer: StyleSpecification['layers'][number]) =>
          style.layers.push(layer),
        setMinZoom: (zoom: number) => {
          minimum = zoom;
        },
      } as unknown as MapInstance;
      installWorldLayers(map, data, [
        [3.19, 6.45],
        [3.21, 6.47],
      ]);
      const theme = mapTheme(dark);
      for (const layer of style.layers) {
        Object.assign(layer, {
          paint: { ...layer.paint, ...theme[layer.id as keyof typeof theme] },
        });
        if (layer.id.startsWith('world-'))
          expect(layer.maxzoom).toBeLessThanOrEqual(12);
      }
      expect(validateStyleMin(style)).toEqual([]);
      expect(minimum).toBe(WORLD_MIN_ZOOM);
      expect(
        style.layers.find((l) => l.id === 'world-land')?.paint,
      ).toHaveProperty('fill-opacity', [
        'interpolate',
        ['linear'],
        ['zoom'],
        10,
        1,
        12,
        0,
      ]);
      const count = style.layers.length;
      installWorldLayers(map, data, [
        [3.19, 6.45],
        [3.21, 6.47],
      ]);
      expect(style.layers).toHaveLength(count);
    }
  });
  it('restores walking zoom when resuming GPS from the world while preserving a chosen campus zoom', () => {
    expect(followZoom(2, true, true)).toBe(18);
    expect(followZoom(11.9, true, true)).toBe(18);
    expect(followZoom(16, false, true)).toBe(18);
    expect(followZoom(16, true, true)).toBeUndefined();
    expect(followZoom(12, true, true)).toBeUndefined();
    expect(followZoom(2, true, false)).toBeUndefined();
    expect(followZoom(15.3, true, false, true)).toBe(18);
    expect(followZoom(18, true, false, true)).toBeUndefined();
  });
});
