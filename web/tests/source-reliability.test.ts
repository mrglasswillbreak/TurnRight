import { describe, expect, it } from 'vitest';
// @ts-expect-error Shared Node comparator deliberately uses plain JavaScript.
import {
  compareObservations,
  identityOf,
  legacyObservations,
  matchRoutingSegments,
} from '../../scripts/source-comparison.mjs';
// @ts-expect-error Shared Node verification module.
import {
  verifyMissing,
  isPublicIPv4,
} from '../../scripts/source-verification.mjs';
// @ts-expect-error Shared bounded worker.
import {
  boundedComparison,
  batches,
  runSourceCheck,
} from '../../scripts/source-check-worker.mjs';
// @ts-expect-error Shared Node hash.
import { hash, flatten } from '../../scripts/cloud.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const feature = (id: string, name = 'Path') => ({
  id: 'feature:' + id,
  source: 'osm',
  entity: 'feature',
  payload: {
    type: 'Feature',
    properties: { id, kind: 'path', name },
    geometry: {
      type: 'LineString',
      coordinates: [
        [3, 6],
        [3.1, 6],
      ],
    },
  },
  hash: hash({ id, name }),
});
const observation = (id: string, name = 'Path') => {
  const content = {
    name,
    geometry: [
      [3, 6],
      [3.1, 6],
    ],
  };
  return {
    provider: 'osm',
    collection: 'ways',
    nativeId: 'way:' + id,
    featureType: 'path',
    stable: true,
    content,
    contentHash: hash(content),
    configurationHash: 'configuration',
    records: [feature(id, name)],
    identity: identityOf({
      provider: 'osm',
      collection: 'ways',
      nativeId: 'way:' + id,
    }),
  };
};
const receipt = {
  configurationHash: 'configuration',
  collections: [{ identity: 'ways', complete: true, count: 1 }],
};
it('checkpoints independent verification and resumes without repeating completed identities', async () => {
  const accepted = Array.from({ length: 301 }, (_, i) => {
    const item = { ...observation(String(i)), provider: 'file' };
    return { ...item, identity: identityOf(item) };
  });
  const saved = new Map<string, unknown>();
  const request = {
    sourceKey: 'verification-fixture',
    runId: '11111111-1111-4111-8111-111111111111',
    token: '22222222-2222-4222-8222-222222222222',
    receipt: {
      ...receipt,
      retrievedAt: '2026-10-12T12:00:00Z',
      contentHash: 'empty',
    },
    observations: [],
    completeReplacement: true,
  };
  let calls = 0;
  const transport = async (route: string, _method: string, args: any) => {
    if (route.endsWith('source_check_begin')) return { status: 'staging' };
    if (route.endsWith('source_check_baseline'))
      return args.part === 'observations'
        ? accepted
        : args.part === 'records'
          ? accepted.flatMap((o) => o.records)
          : [...saved].map(([identity, value]) => ({ identity, value }));
    if (route.endsWith('source_check_evidence'))
      for (const entry of args.records) saved.set(entry.identity, entry.value);
    if (route.endsWith('source_check_finish')) return { status: 'complete' };
    return null;
  };
  const proof = (o: any) => ({
    status: 'verified',
    method: 'declared-complete-file',
    contentHash: o.contentHash,
    configurationHash: receipt.configurationHash,
  });
  await expect(
    runSourceCheck(request, transport, async (o: any) => {
      if (++calls === 101) throw new Error('Worker interrupted');
      return proof(o);
    }),
  ).rejects.toThrow('Worker interrupted');
  expect(saved.size).toBe(100);
  calls = 0;
  expect(
    await runSourceCheck(request, transport, async (o: any) => {
      calls++;
      return proof(o);
    }),
  ).toEqual({ status: 'complete' });
  expect(calls).toBe(201);
  expect(saved.size).toBe(301);
  expect([...saved.values()].every((v: any) => v.status === 'verified')).toBe(
    true,
  );
});
describe('source observation comparison', () => {
  it('reviews changed layer mappings as configuration even when native content is unchanged', () => {
    const before = { ...observation('schema'), layerIdentity: 'old-schema' };
    const after = {
      ...before,
      layerIdentity: 'new-schema',
      records: [feature('schema', 'New domain label')],
    };
    const result = compareObservations({
      accepted: [before],
      observations: [after],
      records: before.records,
      receipt,
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].classification).toBe('configuration_change');
    expect(result.groups[0].kind).toBe('modify');
  });
  it('retains provider timestamp attributes in upstream evidence without hashing check times', () => {
    const original: any = observation('provider-time');
    original.content.createdAt = '2026-10-01';
    const changed = {
      ...original,
      content: { ...original.content, createdAt: '2026-10-02' },
    };
    const check = (o: any, time: string) =>
      compareObservations({
        observations: [o],
        receipt: { ...receipt, retrievedAt: time },
      }).observations[0].contentHash;
    expect(check(original, 'first check')).toBe(check(original, 'later check'));
    expect(check(original, 'first check')).not.toBe(
      check(changed, 'first check'),
    );
  });
  it('groups place arrivals with their changed routing nodes and blocks missing arrivals', () => {
    const place = {
      ...observation('arrival'),
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
    const path: any = observation('linked-path');
    path.records.push({
      id: 'node:junction',
      entity: 'node',
      source: 'osm',
      hash: 'node',
      payload: { id: 'junction', coordinates: [3, 6] },
    });
    const together = compareObservations({
      observations: [place, path],
      receipt,
    });
    expect(together.groups).toHaveLength(1);
    expect(together.groups[0].features).toHaveLength(2);
    expect(together.groups[0].eligible).toBe(true);
    const missing = compareObservations({ observations: [place], receipt });
    expect(missing.groups[0].eligible).toBe(false);
    expect(missing.groups[0].blockingReasons).toContain(
      'Resulting routing graph has missing endpoints.',
    );
  });
  it('keeps record ordering and repeated receipt times out of semantic proposals', () => {
    const old = observation('sorted');
    const second = feature('second');
    old.records.push(second);
    const next = { ...old, records: [...old.records].reverse() };
    const result = compareObservations({
      accepted: [old],
      observations: [next],
      records: old.records,
      receipt: { ...receipt, retrievedAt: 'later' },
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
    const large: any = observation('huge');
    large.content.description = 'x'.repeat(400000);
    large.records[0].payload.description = 'x'.repeat(400000);
    const result = boundedComparison(
      compareObservations({
        observations: [large, observation('small')],
        receipt,
      }),
    );
    expect(
      result.groups.find((g: any) => g.source_id === 'feature:huge').eligible,
    ).toBe(false);
    expect(
      result.groups.find((g: any) => g.source_id === 'feature:small').eligible,
    ).toBe(true);
    expect(
      result.observations.find((o: any) => o.nativeId === 'way:huge')
        .evidenceUnavailable,
    ).toBe(true);
    expect(() =>
      batches(
        result.groups.map(
          ({ features: _features, members: _members, ...header }: any) =>
            header,
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
    const old = observation('1'),
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
      receipt,
    });
    expect(result.groups).toHaveLength(0);
    expect(result.diagnostics[0].classification).toBe('routing_regeneration');
  });
  it('blocks unverified removal, isolates partition loss, and never nets it against additions', () => {
    const old = observation('1'),
      added = observation('2');
    const result = compareObservations({
      accepted: [old],
      observations: [added],
      records: old.records,
      receipt,
    });
    expect(result.groups.find((g: any) => g.kind === 'remove').eligible).toBe(
      false,
    );
    expect(result.groups.find((g: any) => g.kind === 'add').eligible).toBe(
      true,
    );
    expect(
      result.diagnostics.some(
        (d: any) => d.classification === 'partition_loss',
      ),
    ).toBe(true);
  });
  it('requires evidence bound to both accepted content and query configuration', () => {
    const old = observation('1');
    const compare = (verification: unknown) =>
      compareObservations({
        accepted: [old],
        observations: [],
        records: old.records,
        receipt,
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
    expect(compare({ status: 'present' }).classification).toBe('scope_change');
  });
  it('holds failed collections without invalidating independent complete ones', () => {
    const old = observation('1'),
      added = { ...observation('2'), collection: 'other' };
    const result = compareObservations({
      accepted: [old],
      records: old.records,
      observations: [added],
      receipt: {
        ...receipt,
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
    const old = observation('1'),
      next = observation('1', 'Changed');
    expect(
      compareObservations({
        accepted: [old],
        records: old.records,
        observations: [next],
        receipt: { ...receipt, configurationHash: 'different' },
      }).groups[0].classification,
    ).toBe('configuration_change');
    expect(
      compareObservations({
        observations: [{ ...next, stable: false }],
        receipt,
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
        receipt,
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
      observation(String(i)),
    );
    const result = compareObservations({ observations, receipt });
    expect(result.groups).toHaveLength(100000);
  }, 30000);
});
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
      ...observation('7'),
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
    expect((await verifyMissing(o, receipt, get)).status).toBe('verified');
    expect(urls.find((u) => u.includes('/query?'))).toContain('objectIds=7');
    expect(urls.join('')).not.toContain('geometry=');
    expect(
      (
        await verifyMissing(o, receipt, async (url: URL | string) => ({
          status: 200,
          data: String(url).includes('/query?')
            ? { objectIds: [], exceededTransferLimit: true }
            : metadata,
        }))
      ).status,
    ).toBe('unverified');
    let calls = 0;
    expect(
      (
        await verifyMissing(o, receipt, async (url: URL | string) => ({
          status: 200,
          data: String(url).includes('/query?')
            ? { objectIds: [] }
            : { ...metadata, editingInfo: { lastEditDate: ++calls } },
        }))
      ).status,
    ).toBe('unverified');
    expect(
      (
        await verifyMissing(
          { ...o, layerIdentity: 'renamed-layer' },
          receipt,
          get,
        )
      ).status,
    ).toBe('unverified');
  });
  it('does not interpret a 404 or missing history as a deletion', async () => {
    expect(
      (
        await verifyMissing(observation('1'), receipt, async () => ({
          status: 404,
          data: null,
        }))
      ).status,
    ).toBe('unverified');
  });
  it('requires a matching invisible latest OSM version', async () => {
    const result = await verifyMissing(
      observation('1'),
      receipt,
      async (url: string) =>
        url.includes('history')
          ? {
              status: 200,
              data: {
                elements: [{ type: 'way', id: 1, version: 2, visible: false }],
              },
            }
          : { status: 410 },
    );
    expect(result.status).toBe('verified');
    expect(
      (
        await verifyMissing(observation('1'), receipt, async () => ({
          status: 200,
          data: {
            elements: [{ type: 'way', id: 1, version: 3, visible: true }],
          },
        }))
      ).status,
    ).toBe('present');
  });
  it('keeps network failures as inspectable unverified evidence', async () => {
    const result = await verifyMissing(observation('1'), receipt, async () => {
      throw new Error('timeout');
    });
    expect(result).toMatchObject({ status: 'unverified', reason: 'timeout' });
  });
});
const audit = new URL(
  '../../data/candidates/source-audit-2026-10-13/',
  import.meta.url,
);
it.skipIf(!existsSync(new URL('private-export.json', audit)))(
  'replays the candidate independently against the authorized private source export',
  () => {
    const records = JSON.parse(
      readFileSync(new URL('private-export.json', audit), 'utf8'),
    ).server.sources;
    const candidate = JSON.parse(
      readFileSync(new URL('candidate.json', audit), 'utf8'),
    );
    const observations = legacyObservations(flatten(candidate));
    const accepted = legacyObservations(records).map((o: any) => ({
      ...o,
      identity: identityOf(o),
      contentHash: hash(o.content),
      legacy: true,
    }));
    const result = compareObservations({
      records,
      accepted,
      observations,
      receipt: {
        ...receipt,
        collections: [
          ...new Set(
            [...observations, ...accepted].map((o: any) => o.collection),
          ),
        ].map((identity) => ({ identity, complete: true })),
      },
    });
    expect(
      result.groups.filter(
        (g: any) =>
          g.kind === 'remove' &&
          g.features.some(
            (f: any) => (f.observation || f.accepted).featureType === 'path',
          ),
      ),
    ).toHaveLength(0);
    expect(
      result.groups.every((g: any) =>
        g.members.every(
          (m: any) =>
            (m.after || m.before).entity !== 'edge' ||
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
        new URL('./fixtures/source-regeneration-lasu.json.gz', import.meta.url),
      ),
    ).toString('utf8'),
  );
  expect(provenance.publishedPathCount).toBe(95);
  expect(provenance.candidatePathCount).toBe(95);
  const incomingEdgeIds = new Set(candidate.graph.edges.map((e: any) => e.id));
  expect(
    published.graph.edges.filter(
      (e: any) =>
        !incomingEdgeIds.has(e.id) && e.id.startsWith(e.sourceId + ':osm:'),
    ),
  ).toHaveLength(908);
  const records = flatten(published),
    observations = legacyObservations(flatten(candidate));
  const accepted = legacyObservations(records).map((o: any) => ({
    ...o,
    identity: identityOf(o),
    contentHash: hash(o.content),
    legacy: true,
  }));
  const result = compareObservations({
    records,
    accepted,
    observations,
    receipt: {
      ...receipt,
      collections: [
        ...new Set(
          [...observations, ...accepted].map((o: any) => o.collection),
        ),
      ].map((identity) => ({ identity, complete: true })),
    },
  });
  const pathGroups = result.groups.filter((g: any) =>
    g.features.some(
      (f: any) => (f.observation || f.accepted).featureType === 'path',
    ),
  );
  expect(pathGroups.filter((g: any) => g.kind === 'remove')).toHaveLength(0);
  const geometryChanges = pathGroups
    .flatMap((g: any) => g.members)
    .filter(
      (m: any) =>
        m.before?.entity === 'feature' &&
        m.after?.entity === 'feature' &&
        hash(m.before.payload.geometry) !== hash(m.after.payload.geometry),
    );
  expect(geometryChanges).toHaveLength(20);
}, 30000);
