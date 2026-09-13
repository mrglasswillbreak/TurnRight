import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { structuralIssues } from '../src/validation';
import { applyEdits } from '../src/editor-model';
import { campusFixture } from './fixture';
import type { CampusData, MapEdit } from '../src/types';
import {
  assembleEditorSources,
  validateWorkspace,
} from '../src/editor-validation';

const captured = (): { base: CampusData; edits: MapEdit[] } =>
  JSON.parse(
    gunzipSync(
      readFileSync(
        new URL('./fixtures/editor-2026-09-14.json.gz', import.meta.url),
      ),
    ).toString(),
  );
describe('release structural validation', () => {
  it('keeps assembly failures actionable and rejects stale connection targets', () => {
    const base = campusFixture();
    expect(
      assembleEditorSources(
        [
          {
            id: 'bad',
            entity: 'edge',
            source: 'test',
            hash: 'bad',
            payload: {},
          },
        ],
        base,
      ).issues[0].code,
    ).toBe('source-assembly');
    const result = validateWorkspace(
      base,
      [
        {
          id: 'test-path',
          kind: 'path',
          geometry: {
            type: 'LineString',
            coordinates: [
              [3.2, 6.46],
              [3.201, 6.46],
            ],
          },
          properties: {
            name: 'Test',
            vertexIds: ['new-a', 'new-b'],
            connections: [
              {
                vertexId: 'new-a',
                target: {
                  type: 'node',
                  nodeId: 'missing',
                  coordinates: [3.2, 6.46],
                },
              },
            ],
          },
        },
      ],
      7,
    );
    expect(result.failed).toBe(false);
    expect(result.revision).toBe(7);
    expect(result.issues[0].featureId).toBe('test-path');
    expect(result.errors.join(' ')).toContain('connection target changed');
  });
  it('identifies the actual broken approved edge without destroying the live drafts', () => {
    const { base, edits } = captured();
    const before = JSON.stringify({ base, edits });
    const issues = structuralIssues(base);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      phase: 'sources',
      code: 'missing-endpoint',
      featureId: 'osm:way:1534765716',
    });
    expect(issues[0].referenceIds).toHaveLength(2);
    expect(applyEdits(base, edits).errors[0]).toContain(
      'missing or invalid nodes',
    );
    expect(JSON.stringify({ base, edits })).toBe(before);
    expect(
      edits.find((e) => e.id === 'osm:way:1535732706')?.properties,
    ).toMatchObject({ access: 'private', steps: true, footDirection: 'both' });
  });
  it.each([undefined, [NaN, 6.46], [3.2, Infinity], [3.2, '6.46']])(
    'reports malformed coordinates %j before geometry work',
    (coordinates) => {
      const data = campusFixture();
      Object.assign(data.graph.nodes[0], { coordinates });
      expect(
        structuralIssues(data).some((i) => i.code === 'invalid-coordinate'),
      ).toBe(true);
      expect(() => applyEdits(data, [])).not.toThrow();
    },
  );
  it('keeps directed access, steps and closures on a valid graph', () => {
    const data = campusFixture();
    data.graph.edges[0].steps = true;
    data.graph.edges[1].accessible = false;
    data.graph.edges[1].walkingAccess = 'private';
    data.closures = [{ id: 'closed', reason: 'Review', edgeIds: ['ab'] }];
    const result = applyEdits(data, []);
    expect(result.errors).toEqual([]);
    expect(result.data.graph.edges).toEqual(data.graph.edges);
    expect(result.data.closures).toEqual(data.closures);
  });
});
