import { describe, expect, it } from 'vitest';
import { campusFixture } from './fixture';
import {
  placeMatches,
  streetResults,
  editedPlaceDetails,
  detailErrors,
  publicEvidence,
} from '../src/place-details';
import { applyEdits } from '../src/editor-model';
import { featureEdit } from '../src/editor-features';
import {
  selectSourceFields,
  selectableSourceFields,
} from '../src/source-field-review';
import { findDuplicateCandidates } from '../src/duplicates';
import {
  newSurvey,
  surveyCorrections,
  reviewCommand,
  reviewUndo,
} from '../src/survey-model';
import type { MapChange } from '../src/types';
// @ts-expect-error Shared Node pipeline module.
import {
  flatten,
  compareSources,
  hash,
  preserveReviewedMetadata,
} from '../../scripts/cloud.mjs';
// @ts-expect-error Node public serialization.
import { publicCampus } from '../../scripts/public-campus.mjs';
// @ts-expect-error Node glyph packaging.
import { glyphRanges } from '../../scripts/package-glyphs.mjs';

const evidence = {
  sourceId: 'osm',
  recordId: 'osm:node:1',
  checkedAt: '2026-09-22',
  url: 'https://www.openstreetmap.org/node/1',
  license: 'ODbL-1.0',
};

describe('campus enrichment', () => {
  it('includes offline glyph ranges for Yoruba names and uppercase street labels', () => {
    const data = campusFixture();
    data.places[0].name = 'Ọ̀nà';
    expect(glyphRanges(data)).toContain('7680-7935');
    expect(glyphRanges(data)).toContain('768-1023');
    expect(glyphRanges(data)).toContain('0-255');
  });
  it('searches multilingual aliases, subtypes and addresses, with streets separate from destinations', () => {
    const data = campusFixture();
    Object.assign(data.places[0], {
      name: 'Ọ̀nà Cafe',
      subtype: 'fast_food',
      address: '12 Faculty Road',
      aliases: ['Café'],
    });
    expect(placeMatches(data.places[0], 'ona')).toBe(true);
    expect(placeMatches(data.places[0], 'fast food')).toBe(true);
    expect(placeMatches(data.places[0], '12 faculty')).toBe(true);
    data.map.features.push({
      type: 'Feature',
      properties: { id: 'road', kind: 'path', name: 'Faculty Road' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [3.2, 6.46],
          [3.201, 6.46],
        ],
      },
    });
    expect(streetResults(data, 'faculty')).toHaveLength(1);
    expect(data.places).toHaveLength(1);
  });
  it('retains metadata and connection identities through owner editor round trips', () => {
    const data = campusFixture();
    Object.assign(data.places[0], {
      subtype: 'cafe',
      website: 'https://cafe.example/',
      evidence: { website: [evidence] },
    });
    const edit = featureEdit(data, 'place', 'library', [])!;
    edit.properties.address = '1 Campus Road';
    edit.properties.detailSource = 'Campus business notice';
    edit.properties.detailCheckedAt = '2026-09-22';
    const result = applyEdits(data, [edit]);
    expect(result.errors).toEqual([]);
    expect(result.data.places[0]).toMatchObject({
      id: 'library',
      graphNode: 'c',
      subtype: 'cafe',
      website: 'https://cafe.example/',
      address: '1 Campus Road',
      evidence: {
        website: [evidence],
        address: [{ sourceId: 'campus-review' }],
      },
    });
  });
  it('removes stale evidence for changed details and strips private survey metadata', () => {
    const p = {
      ...campusFixture().places[0],
      website: 'https://old.example/',
      evidence: { website: [evidence] },
    };
    expect(
      editedPlaceDetails(
        { website: 'https://new.example/', evidence: p.evidence },
        p,
      ).evidence?.website,
    ).toBeUndefined();
    const input = {
      evidence: {
        name: [{ ...evidence, reviewerId: 'secret', rawSamples: [1] }],
      },
      surveyEvidence: { surveyId: 'private' },
      name: 'Cafe',
    };
    expect(JSON.stringify(publicCampus(input))).not.toMatch(
      /secret|private|rawSamples|reviewerId/,
    );
    expect(publicEvidence(input.evidence)?.name).toEqual([evidence]);
    expect(detailErrors({ website: 'javascript:alert(1)' })).not.toEqual([]);
  });
  it('accepts selected source fields while withholding geometry and its evidence', () => {
    const before = flatten(campusFixture()).find(
      (r: { entity: string }) => r.entity === 'place',
    );
    const after = structuredClone(before);
    Object.assign(after.payload, {
      name: 'New Library',
      coordinates: [3.202, 6.462],
      website: 'https://library.example/',
      evidence: {
        name: [evidence],
        coordinates: [evidence],
        website: [evidence],
      },
    });
    const change: MapChange = {
      id: 'change',
      source_id: before.id,
      kind: 'modify',
      before,
      after,
      status: 'pending',
      summary: 'Name and coordinates',
    };
    expect(selectableSourceFields(change)).not.toContain('coordinates');
    const result = selectSourceFields(change, ['website']);
    expect(result.payload.name).toBe('Library');
    expect(result.payload.coordinates).toEqual(before.payload.coordinates);
    expect(result.payload.evidence.coordinates).toBeUndefined();
    expect(result.payload.website).toBe('https://library.example/');
    expect(() => selectSourceFields(change, ['__proto__'])).toThrow();
  });
  it('keeps business tenants separate and flags shared source identities without merging', () => {
    const data = campusFixture();
    data.places.push({
      ...data.places[0],
      id: 'other',
      sourceId: 'other',
      name: 'Bookshop',
    });
    expect(findDuplicateCandidates(data)).toHaveLength(0);
    data.places[1].sourceRefs = [data.places[0].sourceId];
    expect(findDuplicateCandidates(data)[0].reason).toBe(
      'Shared source identity',
    );
    expect(data.places).toHaveLength(2);
  });
  it('preserves parking and owner metadata and only proposes source disappearance', () => {
    const data = campusFixture();
    data.schemaVersion = 2;
    data.driving = {
      version: 1,
      parking: [
        {
          id: 'park',
          name: 'Parking',
          kind: 'parking',
          vehicleNodeId: 'a',
          walkingNodeId: 'a',
          access: 'private',
        },
      ],
      restrictions: [],
    };
    data.closures = [{ id: 'closed', edgeIds: ['ab'], reason: 'Closed' }];
    const old = flatten(data),
      updated = campusFixture();
    updated.places = [];
    const candidate = preserveReviewedMetadata(old, flatten(updated));
    expect(
      candidate.find((r: { entity: string }) => r.entity === 'meta').payload
        .driving.parking,
    ).toEqual(data.driving.parking);
    expect(
      compareSources(old, candidate).find(
        (r: { kind: string }) => r.kind === 'remove',
      ).status,
    ).toBe('pending');
    expect(hash({ evidence: { name: [evidence] } })).toBe(
      hash({ evidence: { name: [{ ...evidence, checkedAt: '2026-09-23' }] } }),
    );
  });
  it('records a business without making an entrance, with survey undo and recovery data', () => {
    const s = newSurvey('owner', 'fixture').session;
    reviewCommand(s, (state) =>
      state.markers.push({
        id: 'cafe',
        kind: 'place',
        category: 'food',
        subtype: 'cafe',
        sampleId: 'sample',
        coordinates: [3.2, 6.46],
        accuracy: 4,
        name: 'Cafe',
        placeId: '',
        access: 'yes',
        observedAt: '2026-09-22',
      }),
    );
    expect(surveyCorrections(s)[0]).toMatchObject({
      kind: 'place',
      properties: {
        category: 'food',
        evidence: { name: [{ accuracyMetres: 4 }] },
      },
    });
    expect(surveyCorrections(s)[0].properties.connection).toBeUndefined();
    reviewUndo(s);
    expect(s.markers).toHaveLength(0);
    reviewUndo(s, true);
    const data = applyEdits(campusFixture(), surveyCorrections(s)).data;
    expect(
      data.places.find((p) => p.name === 'Cafe')?.evidence?.subtype,
    ).toBeDefined();
  });
  it('retains unpublished owner-created graph records during upstream reconciliation', () => {
    const data = campusFixture();
    data.map.features.push({
      type: 'Feature',
      properties: { id: 'owner-path', source: 'campus-review', kind: 'path' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [3.2, 6.46],
          [3.201, 6.46],
        ],
      },
    });
    data.graph.nodes.push({ id: 'owner-node', coordinates: [3.201, 6.46] });
    data.graph.edges.push({
      ...data.graph.edges[0],
      id: 'owner-edge',
      sourceId: 'owner-path',
      to: 'owner-node',
    });
    const next = preserveReviewedMetadata(
      flatten(data),
      flatten(campusFixture()),
    );
    expect(
      next.some((r: { id: string }) => r.id === 'feature:owner-path'),
    ).toBe(true);
    expect(next.some((r: { id: string }) => r.id === 'node:owner-node')).toBe(
      true,
    );
    expect(next.some((r: { id: string }) => r.id === 'edge:owner-edge')).toBe(
      true,
    );
  });
});
