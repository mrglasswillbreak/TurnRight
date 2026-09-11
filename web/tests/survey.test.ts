import { describe, expect, it } from 'vitest';
import {
  acceptSample,
  classifyFix,
  newSurvey,
  pauseSurvey,
  proposeGeometry,
  reviewCommand,
  reviewUndo,
  surveyCorrections,
  replacementTarget,
  type SurveyRecording,
} from '../src/survey-model';
import type { GpsFix, MapEdit, Position } from '../src/types';
import { campusFixture } from './fixture';
import { applyEdits } from '../src/editor-model';
import 'fake-indexeddb/auto';
import { loadSurveyLocal, saveSurveyLocal } from '../src/survey-storage';

const fix = (
  timestamp = 100000,
  coordinates: Position = [3.2, 6.46],
  accuracy = 5,
): GpsFix => ({ timestamp, coordinates, accuracy, heading: null, speed: null });
function walk(r: SurveyRecording, coords: Position[], start = 100000) {
  coords.forEach((p, i) =>
    acceptSample(r, fix(start + i * 5000, p), start + i * 5000),
  );
}
describe('survey recordings', () => {
  it('rejects inaccurate, stale, outside, future and out-of-order fixes', () => {
    expect(classifyFix(fix(100000, undefined, 16), undefined, 0, 100000)).toBe(
      'inaccurate',
    );
    expect(classifyFix(fix(100000, undefined, 0), undefined, 0, 100000)).toBe(
      'inaccurate',
    );
    expect(classifyFix(fix(), undefined, 0, 111000)).toBe('stale');
    expect(classifyFix(fix(), undefined, 0, 97000)).toBe('stale');
    expect(classifyFix(fix(100000, [0, 0]), undefined, 0, 100000)).toBe(
      'outside',
    );
    expect(classifyFix(fix(), undefined, 100000, 100000)).toBe('out-of-order');
  });
  it('suppresses stationary jitter and rejects jumps without invented bridges', () => {
    const r = newSurvey('owner', 'source');
    r.session.state = 'recording';
    walk(r, [
      [3.2, 6.46],
      [3.200005, 6.46],
      [3.201, 6.46],
      [3.20103, 6.46],
      [3.20106, 6.46],
    ]);
    expect(r.samples.map((s) => s.status)).toEqual([
      'accepted',
      'duplicate',
      'jump',
      'accepted',
      'accepted',
    ]);
    expect(r.session.segments).toHaveLength(2);
    expect(proposeGeometry(r)).toHaveLength(1);
    expect(proposeGeometry(r)[0].vertices[0].coordinates[0]).toBe(3.20103);
  });
  it('breaks on poor accuracy, callback gaps, manual pause and recovery', async () => {
    const r = newSurvey('owner', 'source');
    r.session.state = 'recording';
    walk(r, [
      [3.2, 6.46],
      [3.20003, 6.46],
    ]);
    acceptSample(r, fix(110000, [3.20006, 6.46], 30), 110000);
    walk(
      r,
      [
        [3.20009, 6.46],
        [3.20012, 6.46],
      ],
      115000,
    );
    walk(
      r,
      [
        [3.2003, 6.46],
        [3.20033, 6.46],
      ],
      140000,
    );
    pauseSurvey(r.session, 'manual');
    r.session.state = 'recording';
    walk(
      r,
      [
        [3.20036, 6.46],
        [3.20039, 6.46],
      ],
      150000,
    );
    expect(proposeGeometry(r)).toHaveLength(4);
    for (const sample of r.samples) await saveSurveyLocal(r.session, sample);
    const recovered = await loadSurveyLocal('owner', r.session.id);
    expect(recovered?.session.state).toBe('paused');
    expect(recovered?.session.activeSegment).toBeUndefined();
    expect(recovered?.samples).toHaveLength(r.samples.length);
    expect(await loadSurveyLocal('different-owner', r.session.id)).toBeNull();
  });
  it('does not turn regular stationary callbacks into a gap', () => {
    const r = newSurvey('owner', 'source');
    walk(
      r,
      Array.from({ length: 8 }, () => [3.2, 6.46] as Position),
    );
    walk(r, [[3.20003, 6.46]], 140000);
    expect(r.session.segments).toHaveLength(1);
  });
  it('simplifies lines while preserving entrance evidence anchors', () => {
    const r = newSurvey('owner', 'source');
    walk(r, [
      [3.2, 6.46],
      [3.20003, 6.46],
      [3.20006, 6.46],
      [3.20009, 6.46],
      [3.20012, 6.46],
    ]);
    const sample = r.samples[2];
    r.session.markers.push({
      id: 'door',
      sampleId: sample.id,
      coordinates: sample.coordinates,
      accuracy: 5,
      name: 'Door',
      placeId: 'library',
      access: 'yes',
    });
    const lines = proposeGeometry(r);
    expect(lines[0].vertices).toHaveLength(3);
    expect(lines[0].vertices[1].sampleId).toBe(sample.id);
    expect(r.samples).toHaveLength(5);
  });
  it('undoes and redoes review commands; failed edits leave history unchanged', () => {
    const r = newSurvey('owner', 'source');
    walk(r, [
      [3.2, 6.46],
      [3.20003, 6.46],
    ]);
    r.session.review = proposeGeometry(r);
    reviewCommand(r.session, (s) => {
      s.review[0].reviewed = true;
    });
    reviewUndo(r.session);
    expect(r.session.review[0].reviewed).toBe(false);
    reviewUndo(r.session, true);
    expect(r.session.review[0].reviewed).toBe(true);
    expect(() =>
      reviewCommand(r.session, (s) => {
        s.review = [];
        throw new Error('no');
      }),
    ).toThrow();
    expect(r.session.review).toHaveLength(1);
  });
  it('applies deterministic corrections and exports no raw evidence', () => {
    const r = newSurvey('owner', 'source');
    walk(r, [
      [3.2, 6.46],
      [3.20003, 6.46003],
    ]);
    r.session.review = proposeGeometry(r);
    const line = r.session.review[0];
    line.reviewed = true;
    line.vertices[0].connection = {
      type: 'node',
      nodeId: 'a',
      coordinates: [3.2, 6.46],
    };
    const a = surveyCorrections(r.session),
      b = surveyCorrections(r.session);
    expect(a).toEqual(b);
    const published = applyEdits(campusFixture(), a).data;
    expect(published.coverage.fieldVerified).toBe(false);
    expect(published.schemaVersion).toBe(1);
    expect(JSON.stringify(published)).not.toContain('surveyEvidence');
    expect(JSON.stringify(published)).not.toContain('timestamp');
    line.reviewed = false;
    expect(() => surveyCorrections(r.session)).toThrow(/Review/);
    line.reviewed = true;
    delete line.vertices[0].connection;
    expect(() => surveyCorrections(r.session)).toThrow(/Connect/);
  });
  it('pins replacement junctions and detects stale targets and restricted gaps', () => {
    const data = campusFixture();
    data.graph.edges = data.graph.edges
      .filter((e) => ['ab', 'ba', 'bc', 'cb'].includes(e.id))
      .map((e) => ({ ...e, sourceId: 'road' }));
    const edit: MapEdit = {
      id: 'road',
      kind: 'path',
      geometry: {
        type: 'LineString',
        coordinates: data.graph.nodes.slice(0, 3).map((n) => n.coordinates),
      },
      properties: {
        name: 'Road',
        vertexIds: ['a', 'b', 'c'],
        access: 'yes',
        footDirection: 'forward',
      },
    };
    const target = replacementTarget(edit, data, 0, 2);
    expect(target.anchors.map((a) => a.id)).toEqual(['a', 'c']);
    const r = newSurvey('owner', 'source');
    r.session.replacement = target;
    r.session.review = [
      { id: 'replacement', vertices: target.anchors, reviewed: true },
    ];
    expect(surveyCorrections(r.session, edit)[0].properties.footDirection).toBe(
      'forward',
    );
    expect(() =>
      surveyCorrections(r.session, { ...edit, updated_at: 'later' }),
    ).toThrow(/changed/);
    data.graph.edges = data.graph.edges.filter(
      (e) => !['bc', 'cb'].includes(e.id),
    );
    expect(() => replacementTarget(edit, data, 0, 2)).toThrow(/gap/);
  });
});
