import { describe, expect, it } from 'vitest';
import type {
  SourceFixtureObservation,
  ComparisonGroup,
  ComparisonFeature,
  ComparisonMember,
} from './source-fixture-types';
import {
  compareObservations,
  identityOf,
  legacyObservations,
} from '../../scripts/source-comparison.mjs';
import {
  verifyMissing,
  isPublicIPv4,
} from '../../scripts/source-verification.mjs';
import { hash, flatten } from '../../scripts/cloud.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { SourceReliabilityFixture } from './source-reliability.test';
export function registerProvenance(
  fixture: () => SourceReliabilityFixture,
): void {
  describe('independent removal verification', () => {
    it('pins only public verification destinations', () => {
      for (const ip of [
        '127.0.0.1',
        '10.4.3.2',
        '172.16.1.1',
        '169.254.169.254',
        '192.0.0.8',
        '198.18.0.1',
        '224.0.0.1',
        '100.64.0.1',
        '::1',
      ])
        expect(isPublicIPv4(ip)).toBe(false);
      expect(isPublicIPv4('8.8.8.8')).toBe(true);
    });
    it('verifies ArcGIS identities outside the spatial query and blocks unstable downloads', async () => {
      const metadata = {
        id: 2,
        serviceItemId: 'item',
        objectIdField: 'OBJECTID',
        fields: [{ name: 'OBJECTID', type: 'esriFieldTypeOID' }],
        capabilities: 'Query',
        editingInfo: { lastEditDate: 1 },
      };
      const o = {
        ...fixture().observation('7'),
        provider: 'arcgis',
        nativeId: '7',
        queryUrl: 'https://example.com/FeatureServer/2',
        layerIdentity: hash({
          id: 2,
          serviceItemId: 'item',
          objectIdField: 'OBJECTID',
          fields: metadata.fields,
        }),
      };
      const urls: string[] = [];
      const get = async (url: URL | string) => {
        urls.push(String(url));
        return {
          status: 200,
          data: String(url).includes('/query?') ? { objectIds: [] } : metadata,
        };
      };
      expect((await verifyMissing(o, fixture().receipt, get)).status).toBe(
        'verified',
      );
      expect(urls.find((u) => u.includes('/query?'))).toContain('objectIds=7');
      expect(urls.join('')).not.toContain('geometry=');
      expect(
        (
          await verifyMissing(
            o,
            fixture().receipt,
            async (url: URL | string) => ({
              status: 200,
              data: String(url).includes('/query?')
                ? { objectIds: [], exceededTransferLimit: true }
                : metadata,
            }),
          )
        ).status,
      ).toBe('unverified');
      let calls = 0;
      expect(
        (
          await verifyMissing(
            o,
            fixture().receipt,
            async (url: URL | string) => ({
              status: 200,
              data: String(url).includes('/query?')
                ? { objectIds: [] }
                : { ...metadata, editingInfo: { lastEditDate: ++calls } },
            }),
          )
        ).status,
      ).toBe('unverified');
      expect(
        (
          await verifyMissing(
            { ...o, layerIdentity: 'renamed-layer' },
            fixture().receipt,
            get,
          )
        ).status,
      ).toBe('unverified');
    });
    it('does not interpret a 404 or missing history as a deletion', async () => {
      expect(
        (
          await verifyMissing(
            fixture().observation('1'),
            fixture().receipt,
            async () => ({
              status: 404,
              data: null,
            }),
          )
        ).status,
      ).toBe('unverified');
    });
    it('requires a matching invisible latest OSM version', async () => {
      const result = await verifyMissing(
        fixture().observation('1'),
        fixture().receipt,
        async (url: string) =>
          url.includes('history')
            ? {
                status: 200,
                data: {
                  elements: [
                    { type: 'way', id: 1, version: 2, visible: false },
                  ],
                },
              }
            : { status: 410 },
      );
      expect(result.status).toBe('verified');
      expect(
        (
          await verifyMissing(
            fixture().observation('1'),
            fixture().receipt,
            async () => ({
              status: 200,
              data: {
                elements: [{ type: 'way', id: 1, version: 3, visible: true }],
              },
            }),
          )
        ).status,
      ).toBe('present');
    });
    it('keeps network failures as inspectable unverified evidence', async () => {
      const result = await verifyMissing(
        fixture().observation('1'),
        fixture().receipt,
        async () => {
          throw new Error('timeout');
        },
      );
      expect(result).toMatchObject({ status: 'unverified', reason: 'timeout' });
    });
  });
  it.skipIf(!existsSync(new URL('private-export.json', fixture().audit)))(
    'replays the candidate independently against the authorized private source export',
    () => {
      const records = JSON.parse(
        readFileSync(new URL('private-export.json', fixture().audit), 'utf8'),
      ).server.sources;
      const candidate = JSON.parse(
        readFileSync(new URL('candidate.json', fixture().audit), 'utf8'),
      );
      const observations = legacyObservations(flatten(candidate));
      const accepted = legacyObservations(records).map(
        (o: SourceFixtureObservation) => ({
          ...o,
          identity: identityOf(o),
          contentHash: hash(o.content),
          legacy: true,
        }),
      );
      const result = compareObservations({
        records,
        accepted,
        observations,
        receipt: {
          ...fixture().receipt,
          collections: [
            ...new Set(
              [...observations, ...accepted].map(
                (o: SourceFixtureObservation) => o.collection,
              ),
            ),
          ].map((identity) => ({ identity, complete: true })),
        },
      });
      expect(
        result.groups.filter(
          (g: ComparisonGroup) =>
            g.kind === 'remove' &&
            g.features.some(
              (f: ComparisonFeature) =>
                (f.observation || f.accepted)!.featureType === 'path',
            ),
        ),
      ).toHaveLength(0);
      expect(
        result.groups.every((g: ComparisonGroup) =>
          g.members.every(
            (m: ComparisonMember) =>
              (m.after || m.before)!.entity !== 'edge' ||
              g.classification === 'unresolved_identity',
          ),
        ),
      ).toBe(true);
    },
    30000,
  );
  it('replays the archived LASU incident without inferring path loss from regenerated edges', () => {
    const { published, candidate, provenance } = JSON.parse(
      gunzipSync(
        readFileSync(
          new URL(
            './fixtures/source-regeneration-lasu.json.gz',
            import.meta.url,
          ),
        ),
      ).toString('utf8'),
    );
    expect(provenance.publishedPathCount).toBe(95);
    expect(provenance.candidatePathCount).toBe(95);
    const incomingEdgeIds = new Set(
      candidate.graph.edges.map((e: { id: string; sourceId: string }) => e.id),
    );
    expect(
      published.graph.edges.filter(
        (e: { id: string; sourceId: string }) =>
          !incomingEdgeIds.has(e.id) && e.id.startsWith(e.sourceId + ':osm:'),
      ),
    ).toHaveLength(908);
    const records = flatten(published),
      observations = legacyObservations(flatten(candidate));
    const accepted = legacyObservations(records).map(
      (o: SourceFixtureObservation) => ({
        ...o,
        identity: identityOf(o),
        contentHash: hash(o.content),
        legacy: true,
      }),
    );
    const result = compareObservations({
      records,
      accepted,
      observations,
      receipt: {
        ...fixture().receipt,
        collections: [
          ...new Set(
            [...observations, ...accepted].map(
              (o: SourceFixtureObservation) => o.collection,
            ),
          ),
        ].map((identity) => ({ identity, complete: true })),
      },
    });
    const pathGroups = result.groups.filter((g: ComparisonGroup) =>
      g.features.some(
        (f: ComparisonFeature) =>
          (f.observation || f.accepted)!.featureType === 'path',
      ),
    );
    expect(
      pathGroups.filter((g: ComparisonGroup) => g.kind === 'remove'),
    ).toHaveLength(0);
    const geometryChanges = pathGroups
      .flatMap((g: ComparisonGroup) => g.members)
      .filter(
        (m: ComparisonMember) =>
          m.before?.entity === 'feature' &&
          m.after?.entity === 'feature' &&
          hash(m.before.payload.geometry) !== hash(m.after.payload.geometry),
      );
    expect(geometryChanges).toHaveLength(20);
  }, 30000);
}
