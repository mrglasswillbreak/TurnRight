import { describe, expect, it } from 'vitest';
import type {
  SourceFixtureObservation,
  ComparisonGroup,
} from './source-fixture-types';
import {
  compareObservations,
  identityOf,
  matchRoutingSegments,
} from '../../scripts/source-comparison.mjs';
import {
  boundedComparison,
  batches,
} from '../../scripts/source-check-worker.mjs';
import type { SourceReliabilityFixture } from './source-reliability.test';
export function registerSemanticComparison(
  fixture: () => SourceReliabilityFixture,
): void {
  describe('source observation comparison', () => {
    it('reviews changed layer mappings as configuration even when native content is unchanged', () => {
      const before = {
        ...fixture().observation('schema'),
        layerIdentity: 'old-schema',
      };
      const after = {
        ...before,
        layerIdentity: 'new-schema',
        records: [fixture().feature('schema', 'New domain label')],
      };
      const result = compareObservations({
        accepted: [before],
        observations: [after],
        records: before.records,
        receipt: fixture().receipt,
      });
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].classification).toBe('configuration_change');
      expect(result.groups[0].kind).toBe('modify');
    });
    it('retains provider timestamp attributes in upstream evidence without hashing check times', () => {
      const original = fixture().observation('provider-time');
      original.content.createdAt = '2026-10-01';
      const changed = {
        ...original,
        content: { ...original.content, createdAt: '2026-10-02' },
      };
      const check = (o: SourceFixtureObservation, time: string) =>
        compareObservations({
          observations: [o],
          receipt: { ...fixture().receipt, retrievedAt: time },
        }).observations[0].contentHash;
      expect(check(original, 'first check')).toBe(
        check(original, 'later check'),
      );
      expect(check(original, 'first check')).not.toBe(
        check(changed, 'first check'),
      );
    });
    it('groups place arrivals with their changed routing nodes and blocks missing arrivals', () => {
      const place = {
        ...fixture().observation('arrival'),
        records: [
          {
            id: 'place:arrival',
            entity: 'place',
            source: 'osm',
            hash: 'arrival',
            payload: { id: 'arrival', graphNode: 'junction' },
          },
        ],
      };
      const path = fixture().observation('linked-path');
      path.records.push({
        id: 'node:junction',
        entity: 'node',
        source: 'osm',
        hash: 'node',
        payload: { id: 'junction', coordinates: [3, 6] },
      });
      const together = compareObservations({
        observations: [place, path],
        receipt: fixture().receipt,
      });
      expect(together.groups).toHaveLength(1);
      expect(together.groups[0].features).toHaveLength(2);
      expect(together.groups[0].eligible).toBe(true);
      const missing = compareObservations({
        observations: [place],
        receipt: fixture().receipt,
      });
      expect(missing.groups[0].eligible).toBe(false);
      expect(missing.groups[0].blockingReasons).toContain(
        'Resulting routing graph has missing endpoints.',
      );
    });
    it('keeps record ordering and repeated receipt times out of semantic proposals', () => {
      const old = fixture().observation('sorted');
      const second = fixture().feature('second');
      old.records.push(second);
      const next = { ...old, records: [...old.records].reverse() };
      const result = compareObservations({
        accepted: [old],
        observations: [next],
        records: old.records,
        receipt: { ...fixture().receipt, retrievedAt: 'later' },
      });
      expect(result.groups).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(0);
      expect(
        matchRoutingSegments(
          [{ entity: 'edge', id: 'old', payload: {} }],
          [{ entity: 'edge', id: 'new', payload: {} }],
        )[0].resolved,
      ).toBe(false);
    });
    it('holds oversized evidence while keeping independent groups reviewable', () => {
      const large = fixture().observation('huge');
      large.content.description = 'x'.repeat(400000);
      large.records[0].payload.description = 'x'.repeat(400000);
      const result = boundedComparison(
        compareObservations({
          observations: [large, fixture().observation('small')],
          receipt: fixture().receipt,
        }),
      );
      expect(
        result.groups.find(
          (g: ComparisonGroup) => g.source_id === 'feature:huge',
        ).eligible,
      ).toBe(false);
      expect(
        result.groups.find(
          (g: ComparisonGroup) => g.source_id === 'feature:small',
        ).eligible,
      ).toBe(true);
      expect(
        result.observations.find(
          (o: SourceFixtureObservation) => o.nativeId === 'way:huge',
        ).evidenceUnavailable,
      ).toBe(true);
      expect(() =>
        batches(
          result.groups.map(
            ({
              features: _features,
              members: _members,
              ...header
            }: ComparisonGroup) => header,
          ),
        ),
      ).not.toThrow();
    });
    it('matches regenerated segments by ancestry and endpoints, never proximity', () => {
      const old = {
        id: 'edge:old',
        entity: 'edge',
        payload: {
          id: 'old',
          sourceId: 'path',
          parentEdgeIds: ['native'],
          from: 'a',
          to: 'b',
        },
      };
      const next = {
        id: 'edge:native',
        entity: 'edge',
        payload: { id: 'native', sourceId: 'path', from: 'a', to: 'b' },
      };
      expect(matchRoutingSegments([old], [next])[0].replacementId).toBe(
        'edge:native',
      );
      expect(
        matchRoutingSegments(
          [old],
          [{ ...next, payload: { ...next.payload, to: 'nearby' } }],
        )[0].resolved,
      ).toBe(false);
    });
    it('ignores generated routing when upstream content is unchanged', () => {
      const old = fixture().observation('1'),
        next = {
          ...old,
          records: [
            ...old.records,
            {
              id: 'edge:regenerated',
              entity: 'edge',
              payload: { from: 'x', to: 'y' },
              hash: 'other',
            },
          ],
        };
      const result = compareObservations({
        accepted: [old],
        observations: [next],
        records: old.records,
        receipt: fixture().receipt,
      });
      expect(result.groups).toHaveLength(0);
      expect(result.diagnostics[0].classification).toBe('routing_regeneration');
    });
    it('blocks unverified removal, isolates partition loss, and never nets it against additions', () => {
      const old = fixture().observation('1'),
        added = fixture().observation('2');
      const result = compareObservations({
        accepted: [old],
        observations: [added],
        records: old.records,
        receipt: fixture().receipt,
      });
      expect(
        result.groups.find((g: ComparisonGroup) => g.kind === 'remove')!
          .eligible,
      ).toBe(false);
      expect(
        result.groups.find((g: ComparisonGroup) => g.kind === 'add')!.eligible,
      ).toBe(true);
      expect(
        result.diagnostics.some(
          (d: { classification: string }) =>
            d.classification === 'partition_loss',
        ),
      ).toBe(true);
    });
    it('requires evidence bound to both accepted content and query configuration', () => {
      const old = fixture().observation('1');
      const compare = (verification: unknown) =>
        compareObservations({
          accepted: [old],
          observations: [],
          records: old.records,
          receipt: fixture().receipt,
          verification: { [old.identity]: verification },
        }).groups[0];
      expect(compare({ status: 'verified' }).eligible).toBe(false);
      expect(
        compare({
          status: 'verified',
          contentHash: old.contentHash,
          configurationHash: 'configuration',
        }).eligible,
      ).toBe(true);
      expect(compare({ status: 'present' }).classification).toBe(
        'scope_change',
      );
    });
    it('holds failed collections without invalidating independent complete ones', () => {
      const old = fixture().observation('1'),
        added = { ...fixture().observation('2'), collection: 'other' };
      const result = compareObservations({
        accepted: [old],
        records: old.records,
        observations: [added],
        receipt: {
          ...fixture().receipt,
          collections: [
            { identity: 'ways', complete: false },
            { identity: 'other', complete: true },
          ],
        },
      });
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].eligible).toBe(true);
    });
    it('blocks config drift, missing stable IDs, and partial-file removals', () => {
      const old = fixture().observation('1'),
        next = fixture().observation('1', 'Changed');
      expect(
        compareObservations({
          accepted: [old],
          records: old.records,
          observations: [next],
          receipt: { ...fixture().receipt, configurationHash: 'different' },
        }).groups[0].classification,
      ).toBe('configuration_change');
      expect(
        compareObservations({
          observations: [{ ...next, stable: false }],
          receipt: fixture().receipt,
        }).groups[0].eligible,
      ).toBe(false);
      const file = {
        ...old,
        provider: 'file',
        identity: identityOf({ ...old, provider: 'file' }),
      };
      expect(
        compareObservations({
          accepted: [file],
          records: file.records,
          observations: [],
          receipt: fixture().receipt,
          verification: {
            [file.identity]: {
              status: 'verified',
              contentHash: file.contentHash,
              configurationHash: 'configuration',
            },
          },
        }).groups[0].eligible,
      ).toBe(false);
    });
    it('handles 100,000 independent upstream features without quadratic campus copies', () => {
      const observations = Array.from({ length: 100000 }, (_, i) =>
        fixture().observation(String(i)),
      );
      const result = compareObservations({
        observations,
        receipt: fixture().receipt,
      });
      expect(result.groups).toHaveLength(100000);
    }, 30000);
  });
}
