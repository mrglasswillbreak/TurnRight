import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { Map as MapInstance, StyleSpecification } from 'maplibre-gl';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { validCampusOutline } from '../src/campus-outline.mjs';
import { lasuCampus, validCatalogue } from '../src/campus-context';
import {
  campusCenter,
  installCampusOverview,
  overviewFeatures,
} from '../src/campus-overview';
import {
  campusFlightBounds,
  campusFlightDuration,
  flyToCampus,
} from '../src/campus-flight';
import { catalogueRevision } from '../scripts/published-campus-catalogue.mjs';
import { campusFixture } from './fixture';

const outer = [
  [3, 6],
  [4, 6],
  [4, 7],
  [3, 7],
  [3, 6],
];
const hole = [
  [3.2, 6.2],
  [3.2, 6.3],
  [3.3, 6.3],
  [3.3, 6.2],
  [3.2, 6.2],
];
const outline = {
  type: 'MultiPolygon' as const,
  coordinates: [[outer, hole], [outer]],
};
const campuses = [
  { ...lasuCampus, outline },
  { ...lasuCampus, id: 'next', slug: 'next', name: 'Next' },
];
afterEach(() => vi.unstubAllGlobals());

it('preserves multipart outlines and holes while legacy campuses retain pins', () => {
  expect(validCampusOutline(outline)).toBe(true);
  expect(validCatalogue({ schemaVersion: 1, campuses })).toBe(true);
  const features = overviewFeatures(campuses, 'lasu').features;
  expect(features).toHaveLength(3);
  expect(features[1].geometry).toEqual(outline);
  expect(features.map((f) => f.id)).toEqual([
    'lasu:pin',
    'lasu:outline',
    'next:pin',
  ]);
  expect(features[2].properties?.active).toBe(false);
});

it.each([
  null,
  { type: 'Point', coordinates: [3, 6] },
  { type: 'Polygon', coordinates: [] },
  {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    ],
  },
  {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [181, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  },
  {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [NaN, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  },
  {
    type: 'Polygon',
    coordinates: [Array.from({ length: 20001 }, () => [0, 0])],
  },
])('rejects malformed or unbounded directory outlines: %j', (bad) => {
  expect(validCampusOutline(bad)).toBe(false);
  expect(
    validCatalogue({
      schemaVersion: 1,
      campuses: [{ ...lasuCampus, outline: bad }],
    }),
  ).toBe(false);
});

it('retains the legacy revision algorithm and includes new outline coordinates', () => {
  const directory = { schemaVersion: 1, campuses: [lasuCampus] };
  const legacy = createHash('sha256')
    .update(
      JSON.stringify({
        schemaVersion: 1,
        campuses: directory.campuses.map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          bounds: c.bounds,
          manifestUrl: c.manifestUrl,
        })),
      }),
    )
    .digest('hex');
  expect(catalogueRevision(directory)).toBe(legacy);
  expect(catalogueRevision({ ...directory, campuses: [campuses[0]] })).not.toBe(
    legacy,
  );
  expect(
    catalogueRevision({
      ...directory,
      campuses: [{ ...lasuCampus, outline: campusFixture().boundary.geometry }],
    }),
  ).not.toBe(catalogueRevision({ ...directory, campuses: [campuses[0]] }));
});

it('fits the nearest world copy and bounds duration by travel distance', () => {
  expect(
    campusCenter([
      [179, -2],
      [-179, 2],
    ]),
  ).toEqual([-180, 0]);
  expect(
    campusFlightBounds(
      [
        [179, -2],
        [-179, 2],
      ],
      -178,
    ),
  ).toEqual([
    [-181, -2],
    [-179, 2],
  ]);
  expect(
    campusFlightBounds(
      [
        [3, 6],
        [4, 7],
      ],
      363,
    ),
  ).toEqual([
    [363, 6],
    [364, 7],
  ]);
  expect(campusFlightDuration([3, 6], [3, 6])).toBe(1100);
  expect(campusFlightDuration([3, 6], [3.3, 6.5])).toBeGreaterThan(1100);
  expect(campusFlightDuration([3, 6], [-170, -6])).toBe(2200);
});

it.each([false, true])(
  'validates overview styles, overlap selection and cleanup in dark=%s',
  (dark) => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const style: StyleSpecification = {
      version: 8,
      glyphs: '/glyphs/{fontstack}/{range}.pbf',
      sources: {},
      layers: [],
    };
    const handlers = new Map<
      string,
      (event: {
        point: { x: number; y: number };
        originalEvent: { pointerType?: string };
      }) => void
    >();
    let zoom = 11;
    const canvas = {
      style: { cursor: '' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const query = vi.fn(() => [
      { properties: { id: 'lasu', active: true } },
      { properties: { id: 'next', active: false } },
      { properties: { id: 'next', active: false } },
    ]);
    const map = {
      addSource: (id: string, s: StyleSpecification['sources'][string]) => {
        style.sources[id] = s;
      },
      addLayer: (l: StyleSpecification['layers'][number]) =>
        style.layers.push(l),
      getLayer: (id: string) => style.layers.find((l) => l.id === id),
      getSource: (id: string) => style.sources[id],
      removeSource: (id: string) => {
        delete style.sources[id];
      },
      removeLayer: (id: string) => {
        style.layers = style.layers.filter((l) => l.id !== id);
      },
      on: (
        event: string,
        handler: (event: {
          point: { x: number; y: number };
          originalEvent: { pointerType?: string };
        }) => void,
      ) => handlers.set(event, handler),
      off: vi.fn(),
      getCanvas: () => canvas,
      getZoom: () => zoom,
      setFeatureState: vi.fn(),
      queryRenderedFeatures: query,
    } as unknown as MapInstance;
    const choose = vi.fn();
    const dispose = installCampusOverview(map, campuses, 'lasu', dark, choose);
    expect(validateStyleMin(style)).toEqual([]);
    handlers.get('click')!({
      point: { x: 40, y: 40 },
      originalEvent: { pointerType: 'touch' },
    });
    expect(query.mock.calls[0][0]).toEqual([
      [18, 18],
      [62, 62],
    ]);
    expect(choose).toHaveBeenLastCalledWith(campuses);
    zoom = 13;
    handlers.get('click')!({ point: { x: 40, y: 40 }, originalEvent: {} });
    expect(choose).toHaveBeenLastCalledWith([campuses[1]]);
    dispose();
    expect(style.layers).toHaveLength(0);
    expect(style.sources).toEqual({});
  },
);

it.each([false, true])(
  'keeps the chosen view and north-up, reduced motion=%s',
  (reduced) => {
    vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
    vi.stubGlobal('innerWidth', 1280);
    const flyTo = vi.fn();
    const map = {
      stop: vi.fn(),
      setPadding: vi.fn(),
      getContainer: () => ({
        getBoundingClientRect: () => ({ width: 1280, height: 720 }),
        closest: () => null,
      }),
      getCenter: () => ({ toArray: () => [3, 6] }),
      cameraForBounds: () => ({ center: { lng: 3.4, lat: 6.5 }, zoom: 15 }),
      once: vi.fn(),
      off: vi.fn(),
      flyTo,
    } as unknown as MapInstance;
    const dispose = flyToCampus(
      map,
      [
        [3.3, 6.4],
        [3.5, 6.6],
      ],
      true,
      vi.fn(),
    );
    expect(flyTo.mock.calls[0][0]).toMatchObject({
      bearing: 0,
      roll: 0,
      pitch: 45,
    });
    expect(flyTo.mock.calls[0][0].duration).toBe(
      reduced ? 0 : campusFlightDuration([3, 6], [3.4, 6.5]),
    );
    dispose();
    expect(map.stop).toHaveBeenCalledTimes(2);
  },
);
