import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { campusFixture } from './fixture';
import { destinationLink, sharedDestination } from '../src/destination-sharing';
import { routeSteps } from '../src/route-steps';
import { sourceComparison } from '../src/source-comparison';
import { releaseImpact, releaseWalks } from '../src/release-impact';
import { validateWorkspace } from '../src/editor-validation';
import { applyEdits } from '../src/editor-model';
import type { CampusData } from '../src/types';

describe('destination links and recorded steps', () => {
  it('encodes a stable destination and resolves a published alias', () => {
    const data = campusFixture(),
      id = data.places[0].id;
    data.placeIdAliases = { 'old:id/door': id };
    const url = destinationLink('old:id/door', 'https://campus.test/admin');
    expect(new URL(url).pathname).toBe('/');
    expect(sharedDestination(data, url).place?.id).toBe(id);
  });
  it('returns a missing destination without substituting a guessed place', () => {
    expect(
      sharedDestination(campusFixture(), 'https://campus.test/?place=retired')
        .place,
    ).toBeUndefined();
  });
  it('distinguishes recorded steps from unknown and explicitly recorded absence', () => {
    const data = campusFixture(),
      [a, b] = data.graph.edges;
    a.steps = true;
    delete b.steps;
    expect(routeSteps(data, { edgeIds: [a.id, b.id] })).toMatchObject({
      steps: 1,
      unknown: 1,
    });
    a.steps = false;
    expect(routeSteps(data, { edgeIds: [a.id, b.id] }).message).toContain(
      'unknown',
    );
    b.steps = false;
    expect(routeSteps(data, { edgeIds: [a.id, b.id] }).message).toContain(
      'has not been verified',
    );
    expect(routeSteps(data, { edgeIds: ['missing-edge'] }).unknown).toBe(1);
  });
  it('keeps steps unknown on an unsurveyed new path', () => {
    const result = applyEdits(campusFixture(), [
      {
        id: 'new-path',
        kind: 'path',
        geometry: {
          type: 'LineString',
          coordinates: [
            [3.201, 6.461],
            [3.202, 6.461],
          ],
        },
        properties: { name: 'New walk', access: 'yes' },
      },
    ]);
    const edges = result.data.graph.edges.filter(
      (e) => e.sourceId === 'new-path',
    );
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.every((e) => e.steps === undefined)).toBe(true);
  });
});
describe('structured repair and review information', () => {
  it('uses feature identity even when two entrances have the same name', () => {
    const result = validateWorkspace(
      campusFixture(),
      ['door-a', 'door-b'].map((id) => ({
        id,
        kind: 'entrance' as const,
        geometry: { type: 'Point' as const, coordinates: [3.201, 6.46] },
        properties: { name: 'Same door' },
      })),
    );
    for (const id of ['door-a', 'door-b']) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          featureId: id,
          featureKind: 'entrance',
          field: 'placeId',
          repair: 'choose-place',
        }),
      );
      expect(result.issues).toContainEqual(
        expect.objectContaining({ featureId: id, repair: 'connect-path' }),
      );
    }
  });
  it('compares actual properties and flags geometry without dumping coordinates into the table', () => {
    const before = {
      payload: {
        type: 'Feature',
        properties: { name: 'Old', access: 'yes' },
        geometry: { type: 'Point', coordinates: [3.2, 6.46] },
      },
    };
    const after = structuredClone(before);
    after.payload.properties.name = 'New';
    after.payload.geometry.coordinates[0] = 3.21;
    expect(sourceComparison(before, after)).toEqual({
      fields: [{ key: 'name', before: 'Old', after: 'New' }],
      geometryChanged: true,
    });
  });
  it('reports unavailable regression endpoints explicitly on a smaller dataset', () => {
    const data = campusFixture();
    const impact = releaseImpact(data, data);
    expect(impact.changes).toEqual([]);
    expect(
      impact.walks.every((w) => w.after.status === 'Place unavailable'),
    ).toBe(true);
  });
  it('retains property names that also occur in the GeoJSON envelope', () => {
    const comparison = sourceComparison(
      {
        type: 'Feature',
        properties: { type: 'office', sourceTags: { type: 'old' } },
      },
      {
        type: 'Feature',
        properties: { type: 'library', sourceTags: { type: 'new' } },
      },
    );
    expect(comparison.fields).toEqual([
      { key: 'sourceTags.type', before: 'old', after: 'new' },
      { key: 'type', before: 'office', after: 'library' },
    ]);
  });
  it('detects a lost campus connection and reports the changed regression route', () => {
    const data: CampusData = JSON.parse(
      readFileSync(
        new URL(
          '../public/packages/lasu-4e4c8008b38b/campus.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const draft = structuredClone(data);
    const law = draft.places.find((p) => p.id === releaseWalks[1].destination)!;
    const edges = draft.graph.edges
      .filter((e) => e.sourceId === 'osm:way:591396656')
      .map((e) => e.id);
    expect(edges.length).toBeGreaterThan(0);
    draft.closures.push({
      id: 'test-closure',
      edgeIds: edges,
      reason: 'Closed for test',
    });
    const impact = releaseImpact(data, draft);
    expect(impact.newlyDisconnected.some((p) => p.id === law.id)).toBe(true);
    expect(impact.walks[1].before.status).toBe('Connected');
    expect(impact.walks[1].after.status).not.toBe('Connected');
    expect(impact.changes).toContainEqual(
      expect.objectContaining({ kind: 'closure', change: 'added' }),
    );
  });
});
