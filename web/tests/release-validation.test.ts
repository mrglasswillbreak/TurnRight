import { describe, it, expect } from 'vitest';
import {
  publishedRecords,
  snapshotHash,
  validateReleaseSnapshot,
} from '../server/release-validation';
import { campusFixture } from './fixture';
import { facadeWalls, campusFacadeReviewIssues } from '../src/building-facades';
import { validateWorkspace } from '../src/editor-validation';
import type { Feature, Polygon } from 'geojson';
import type { FacadeDescription } from '../src/visual-types';
describe('server release guards', () => {
  it('shares named wall blockers with the editor while preserving draft saves and targeted approval', () => {
    const data = campusFixture();
    const building: Feature<Polygon> = {
      type: 'Feature',
      properties: {
        id: 'theatre',
        name: 'Lecture theatre',
        kind: 'building',
        height: 15,
        heightMode: 'metres',
        appearance: {},
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [3.204, 6.465],
            [3.2042, 6.465],
            [3.2042, 6.4652],
            [3.204, 6.4652],
            [3.204, 6.465],
          ],
        ],
      },
    };
    const walls = facadeWalls(building).slice(0, 2);
    const facades: Record<string, FacadeDescription> = Object.fromEntries(
      walls.map((w) => [
        w.wallId,
        {
          partId: w.partId,
          wallId: w.wallId,
          wallCoordinates: w.coordinates,
          photoIds: [],
          confidence: 'inferred',
          notes: 'Estimated layout',
          elements: [],
          needsReview: true,
          reviewedAt: '2026-09-24',
        },
      ]),
    );
    building.properties!.appearance = { facades };
    data.map.features.push(building);
    expect(validateWorkspace(data, []).errors).toEqual([]);
    const messages = () =>
      campusFacadeReviewIssues(data)
        .map((i) => i.message)
        .join('\n');
    expect(campusFacadeReviewIssues(data)).toHaveLength(2);
    expect(() =>
      validateReleaseSnapshot({ features: publishedRecords(data), edits: [] }, data),
    ).toThrow(messages());
    facades[walls[0].wallId].needsReview = false;
    expect(campusFacadeReviewIssues(data)).toHaveLength(1);
    expect(messages()).toContain('Wing 1 · wall 2');
    expect(() =>
      validateReleaseSnapshot({ features: publishedRecords(data), edits: [] }, data),
    ).toThrow(messages());
    facades[walls[1].wallId].needsReview = false;
    expect(
      validateReleaseSnapshot({ features: publishedRecords(data), edits: [] }, data).map.features,
    ).toHaveLength(1);
    data.photos = [];
    facades[walls[0].wallId].photoIds = ['missing-photo'];
    expect(() =>
      validateReleaseSnapshot({ features: publishedRecords(data), edits: [] }, data),
    ).toThrow('Lecture theatre: Façade photographs must belong to this building.');
  });
  it('rejects source endpoint errors even when the browser is bypassed', () => {
    const publicData = campusFixture(),
      base = campusFixture();
    base.graph.nodes.shift();
    expect(() =>
      validateReleaseSnapshot({ features: publishedRecords(base), edits: [] }, publicData),
    ).toThrow('missing or invalid nodes');
  });
  it('publishes the approved source geometry even when its origin version differs', () => {
    const data = campusFixture();
    const snapshot = { features: publishedRecords(data), edits: [] };
    expect(validateReleaseSnapshot(snapshot, data).graph.edges).toEqual(data.graph.edges);
    const changed = structuredClone(snapshot);
    const place = changed.features.find((f) => f.entity === 'place')!;
    place.payload.name = 'Accepted source name';
    const result = validateReleaseSnapshot(changed, { ...data, version: 'new-public' });
    expect(result.places.find((p) => p.id === place.payload.id)?.name).toBe('Accepted source name');
    expect(result.graph.edges).toEqual(data.graph.edges);
    expect(snapshot.features.find((f) => f.entity === 'place')?.payload.name).not.toBe(
      'Accepted source name',
    );
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
