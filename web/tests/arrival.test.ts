import { describe, expect, it } from 'vitest';
import { campusFixture } from './fixture';
import {
  arrivalIssues,
  buildingPhotos,
  guideErrors,
  publicPhoto,
  validPhoto,
} from '../src/arrival';
import { findRoutes } from '../src/routing';
import { destinationLink, sharedDestination } from '../src/destination-sharing';
import { photoManifestMatches } from '../src/offline';
import { applyEdits } from '../src/editor-model';
import { featureEdit, geometryEdits } from '../src/editor-features';
import type { CampusPhoto, CampusPackage } from '../src/types';

export function photoFixture(): CampusPhoto {
  const sha256 = 'a'.repeat(64);
  return {
    id: 'photo-1',
    buildingId: 'building',
    caption: 'North exterior',
    alt: 'Brick library exterior with a pitched roof',
    author: 'Photographer',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attribution: 'Photographer, CC BY-SA 4.0',
    modifications: 'Resized and converted to WebP; metadata removed.',
    capturedAt: '2022-01-01',
    checkedAt: '2026-09-23',
    width: 1200,
    height: 800,
    bytes: 100,
    sha256,
    url: `/packages/photos/${sha256}.webp`,
  };
}
function fixture() {
  const d = campusFixture();
  d.places[0].buildingId = 'building';
  d.map.features.push({
    type: 'Feature',
    properties: { id: 'building', kind: 'building' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [3.202, 6.46],
          [3.203, 6.46],
          [3.203, 6.461],
          [3.202, 6.46],
        ],
      ],
    },
  });
  d.entrances = ['b', 'c'].map((node) => ({
    id: `door-${node}`,
    buildingId: 'building',
    placeId: 'library',
    name: `Door ${node}`,
    coordinates: d.graph.nodes.find((n) => n.id === node)!.coordinates,
    graphNode: node,
    walkingAccess: 'yes',
    source: 'review',
  }));
  return d;
}
describe('recorded arrivals and photographs', () => {
  it('pins every alternative and reroute to an explicit entrance', () => {
    const d = fixture();
    expect(
      findRoutes(d, 'a', { placeId: 'library' })[0].destinationEntranceId,
    ).toBe('door-b');
    const endpoint = { placeId: 'library', entranceId: 'door-c' };
    expect(
      findRoutes(d, 'a', endpoint).every(
        (r) => r.destinationEntranceId === 'door-c',
      ),
    ).toBe(true);
    expect(
      findRoutes(
        d,
        d.graph.nodes.find((n) => n.id === 'd')!.coordinates,
        endpoint,
      )[0].destinationEntranceId,
    ).toBe('door-c');
    d.entrances![1].walkingAccess = 'private';
    expect(() => findRoutes(d, 'a', endpoint)).toThrow(/selected entrance/);
    expect(() =>
      findRoutes(d, 'a', { ...endpoint, entranceId: 'missing' }),
    ).toThrow(/selected entrance/);
    d.entrances = [];
    expect(() => findRoutes(d, 'a', endpoint)).toThrow(/selected entrance/);
  });
  it('retains a missing shared entrance so the user must choose, and reads old links', () => {
    const d = fixture();
    d.placeIdAliases = { old: 'library' };
    expect(
      sharedDestination(
        d,
        destinationLink('old', 'https://example.com', 'missing'),
      ),
    ).toMatchObject({ place: { id: 'library' }, entranceId: 'missing' });
    expect(
      sharedDestination(d, destinationLink('library', 'https://example.com'))
        .entranceId,
    ).toBeUndefined();
  });
  it('shares building assets across occupants while keeping doorway associations separate', () => {
    const d = fixture();
    d.photos = [
      photoFixture(),
      { ...photoFixture(), id: 'door-photo', entranceId: 'door-c' },
    ];
    d.buildingIdAliases = { older: 'building' };
    expect(buildingPhotos(d, 'older').map((p) => p.id)).toEqual(['photo-1']);
    expect(buildingPhotos(d, 'older', 'door-c').map((p) => p.id)).toEqual([
      'door-photo',
    ]);
    expect(arrivalIssues(d)).toEqual([]);
    d.photos[1].entranceId = 'foreign';
    expect(arrivalIssues(d).join()).toMatch(/does not belong/);
  });
  it('rejects missing rights, malformed assets, and unsupported facts; strips private metadata', () => {
    const p = photoFixture();
    expect(validPhoto(p)).toBe(true);
    for (const changed of [
      { license: '' },
      { bytes: 256001 },
      { width: 1601 },
      { url: '/private/original.jpg' },
      { sourceUrl: 'javascript:alert(1)' },
    ])
      expect(validPhoto({ ...p, ...changed })).toBe(false);
    expect(
      publicPhoto({
        ...p,
        reviewerId: 'secret',
        originalPath: 'private/raw',
      } as CampusPhoto),
    ).toEqual(p);
    expect(guideErrors({ steps: 0 })).toContain(
      'Record an observation date and evidence for arrival steps.',
    );
    expect(guideErrors({ ramp: 'unknown' })).toEqual([]);
    expect(guideErrors({ doorwayWidthCm: -4 }).length).toBeGreaterThan(0);
  });
  it('preserves guide edits and flags moved entrances and photographs for review', () => {
    const d = fixture();
    d.entrances![0].arrival = { photoIds: ['p'] };
    d.photos = [{ ...photoFixture(), id: 'p', entranceId: 'door-b' }];
    const edit = featureEdit(d, 'entrance', 'door-b', [])!;
    expect(edit.properties.arrival).toEqual({ photoIds: ['p'] });
    const changes = geometryEdits(
      edit,
      { type: 'Point', coordinates: [3.2006, 6.46] },
      d,
      [],
    );
    expect(
      changes.find((e) => e.id === 'door-b')?.properties.arrival,
    ).toMatchObject({ photoIds: ['p'], needsReview: true });
    const changed = applyEdits(d, [
      {
        ...edit,
        properties: { ...edit.properties, arrival: { needsReview: true } },
      },
    ]);
    expect(
      changed.data.entrances?.find((e) => e.id === 'door-b')?.arrival
        ?.needsReview,
    ).toBe(true);
  });
  it('requires every distinct photo asset in the manifest without a photo-count or total-size cap', () => {
    const d = fixture(),
      p = photoFixture();
    d.photos = Array.from({ length: 100 }, (_, i) => ({ ...p, id: `p-${i}` }));
    const m = {
      assets: [p],
      photos: { bytes: p.bytes, assetUrls: [p.url] },
    } as CampusPackage;
    expect(photoManifestMatches(d, m)).toBe(true);
    expect(photoManifestMatches(d, { ...m, photos: undefined })).toBe(false);
    expect(photoManifestMatches(d, { ...m, assets: [] })).toBe(false);
    expect(
      photoManifestMatches(campusFixture(), {
        assets: [],
      } as unknown as CampusPackage),
    ).toBe(true);
  });
});
