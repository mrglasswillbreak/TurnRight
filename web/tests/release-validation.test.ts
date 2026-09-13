import { describe, it, expect } from 'vitest';
import {
  publishedRecords,
  snapshotHash,
  validateReleaseSnapshot,
} from '../server/release-validation';
import { campusFixture } from './fixture';
describe('server release guards', () => {
  it('rejects source endpoint errors even when the browser is bypassed', () => {
    const publicData = campusFixture(),
      base = campusFixture();
    base.graph.nodes.shift();
    expect(() =>
      validateReleaseSnapshot(
        { features: publishedRecords(base), edits: [] },
        publicData,
      ),
    ).toThrow('missing or invalid nodes');
  });
  it('rejects an older baseline and retains directed edges when current', () => {
    const data = campusFixture();
    const snapshot = { features: publishedRecords(data), edits: [] };
    expect(validateReleaseSnapshot(snapshot, data).graph.edges).toEqual(
      data.graph.edges,
    );
    expect(() =>
      validateReleaseSnapshot(snapshot, { ...data, version: 'new-public' }),
    ).toThrow('predates');
  });
  it('detects source and edit changes but tolerates row ordering', () => {
    const features = publishedRecords(campusFixture());
    expect(snapshotHash(features)).toBe(snapshotHash([...features].reverse()));
    const changed = structuredClone(features);
    changed[0].payload.version = 'changed';
    expect(snapshotHash(features)).not.toBe(snapshotHash(changed));
    expect(
      snapshotHash(features, [
        {
          id: 'draft',
          kind: 'path',
          geometry: { type: 'LineString', coordinates: [] },
          properties: { access: 'private', steps: true },
        },
      ]),
    ).not.toBe(snapshotHash(features));
  });
});
