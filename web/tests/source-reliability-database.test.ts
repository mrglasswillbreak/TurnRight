import { afterAll, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { gisDatabase, owner } from './gis-database-fixture';
import type { SourceOperation } from '../src/source-updates';
import type {
  SourceFixtureRecord,
  SourceFixtureObservation,
} from './source-fixture-types';
import { hash } from '../../scripts/cloud.mjs';
import { registerSnapshots } from './source-reliability-database-snapshots';
import { registerDecisions } from './source-reliability-database-decisions';
import { registerConcurrency } from './source-reliability-database-concurrency';
export interface RpcResults {
  source_decision_history: {
    decisions: Array<{ actor: string; outcome: string; group_id: string }>;
    legacyFindings: unknown[];
  };
  source_review_prepare: SourceOperation;
  source_review_control: SourceOperation & { run_token: string };
  source_review_step: SourceOperation;
  source_undo_preview: { eligible: boolean };
  source_group_eligibility: { eligible: boolean };
  source_provenance_backfill: {
    recovered: number;
    findings: Array<{ recoverable: boolean }>;
  };
}
export type RpcResult<Name extends string> = Name extends keyof RpcResults
  ? RpcResults[Name]
  : unknown;
let db: Awaited<ReturnType<typeof gisDatabase>>;
beforeAll(async () => {
  db = await gisDatabase();
}, 180000);
afterAll(async () => {
  await db?.close();
});
const rpc = async <Name extends string>(
  name: Name,
  args: Record<string, unknown>,
): Promise<RpcResult<Name>> => {
  if (
    ['team_review_source', 'review_map_fields'].includes(name) &&
    !Object.hasOwn(args, 'expected_revision')
  ) {
    const revision = (
      await db.query<{ review_revision: number }>(
        'select review_revision from map_changes where campus_id=current_campus_id() and id=$1',
        [args.change_identity || args.change_id],
      )
    ).rows[0]?.review_revision;
    args = { ...args, expected_revision: revision ?? null };
  }
  return (
    await db.query<{ result: RpcResult<Name> }>(
      `select ${name}(${Object.keys(args)
        .map((key, i) => `${key} => $${i + 1}`)
        .join(',')}) result`,
      Object.values(args).map((v) =>
        v !== null && typeof v === 'object' ? JSON.stringify(v) : v,
      ),
    )
  ).rows[0].result;
};
const database = (
  route: string,
  _method: string | undefined,
  args: Record<string, unknown>,
) => rpc(route.slice(4), args);
const input = (id: string, name = 'Library') => ({
  sourceKey: 'test-source',
  runId: randomUUID(),
  token: randomUUID(),
  receipt: {
    retrievedAt: '2026-10-12T12:00:00Z',
    contentHash: hash(name),
    configurationHash: 'config',
    collections: [{ identity: 'buildings', complete: true, count: 1 }],
  },
  observations: <SourceFixtureObservation[]>[
    {
      provider: 'file',
      collection: 'buildings',
      nativeId: id,
      stable: true,
      featureType: 'building',
      content: { name },
      records: [
        {
          id: 'feature:' + id,
          entity: 'feature',
          source: 'test-source',
          hash: hash(name),
          payload: {
            type: 'Feature',
            properties: { id, kind: 'building', name },
            geometry: { type: 'Point', coordinates: [3, 6] },
          },
        },
      ],
    },
  ],
});
async function enabledInput(key: string, name = 'First') {
  await db.query(
    "insert into source_check_policy values ('lasu',$1,true) on conflict do nothing",
    [key],
  );
  return { ...input(key, name), sourceKey: key };
}
async function pending(key: string) {
  return (
    await db.query<{
      id: string;
      before: SourceFixtureRecord;
      after: SourceFixtureRecord;
    }>(
      "select m.* from map_changes m join source_proposal_groups g using(campus_id,id) where g.source_key=$1 and m.status='pending'",
      [key],
    )
  ).rows;
}
async function decide(id: string, accept = true) {
  return rpc('team_review_source', {
    actor: owner,
    change_identity: id,
    accept,
  });
}
const fixture = () => ({
  db,
  rpc,
  database,
  input,
  enabledInput,
  pending,
  decide,
});
export type SourceReliabilityDatabaseFixture = ReturnType<typeof fixture>;
registerSnapshots(fixture);
registerDecisions(fixture);
registerConcurrency(fixture);
