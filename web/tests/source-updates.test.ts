import { describe, it, expect } from 'vitest';
// @ts-expect-error Shared Node pipeline module intentionally uses plain JavaScript.
import {
  compareSources,
  flatten,
  hash,
  preserveReviewedMetadata,
} from '../../scripts/cloud.mjs';
import { campusFixture } from './fixture';
import { validateReleaseSnapshot } from '../server/release-validation';
describe('source updates', () => {
  it('ignores retrieval timestamps and JSON key order', () => {
    expect(
      hash({ name: 'Library', retrievedAt: 'today', geometry: [1, 2] }),
    ).toBe(
      hash({ geometry: [1, 2], retrievedAt: 'yesterday', name: 'Library' }),
    );
  });
  it('proposes semantic changes instead of changing approved records', () => {
    const old = flatten(campusFixture());
    const updated = campusFixture();
    updated.places[0].name = 'New name';
    const changes = compareSources(old, flatten(updated));
    expect(changes).toHaveLength(1);
    expect(changes[0].status).toBe('pending');
    expect(old.find((r: any) => r.entity === 'place').payload.name).toBe(
      'Library',
    );
  });
  it('fails closed on a suspiciously incomplete source result', () => {
    const old = flatten(campusFixture());
    expect(() => compareSources(old, old.slice(0, 2))).toThrow(/20%/);
  });
  it('publishes reviewed source additions without changing the reconciled baseline anchor', () => {
    const published = campusFixture();
    const imported = campusFixture();
    imported.version = 'fresh-import-candidate';
    imported.places[0].name = 'Reviewed library name';
    const snapshot = {
      features: preserveReviewedMetadata(flatten(published), flatten(imported)),
      edits: [],
    };
    expect(validateReleaseSnapshot(snapshot, published).places[0].name).toBe(
      'Reviewed library name',
    );
    expect(() =>
      validateReleaseSnapshot(snapshot, {
        ...published,
        version: 'newer-public-release',
      }),
    ).toThrow(/predates/);
  });
});
