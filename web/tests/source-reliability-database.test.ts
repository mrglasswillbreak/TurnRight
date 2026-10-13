import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { gisDatabase, owner, reviewer, editor } from './gis-database-fixture';
// @ts-expect-error Shared Node worker module.
import { runSourceCheck } from '../../scripts/source-check-worker.mjs';
// @ts-expect-error Shared hash module.
import { hash } from '../../scripts/cloud.mjs';
let db: Awaited<ReturnType<typeof gisDatabase>>;
beforeAll(async () => {
  db = await gisDatabase();
}, 180000);
afterAll(async () => {
  await db?.close();
});
const rpc = async (name: string, args: Record<string, unknown>) => {
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
    await db.query<{ result: any }>(
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
  _method: string,
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
  observations: [
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
it('shadows first, stages bounded data, and only advances accepted observations on acceptance', async () => {
  expect((await runSourceCheck(input('shadow'), database)).status).toBe(
    'shadow',
  );
  expect(
    (await db.query('select count(*)::int n from map_changes')).rows[0].n,
  ).toBe(0);
  await db.exec(
    "insert into source_check_policy values ('lasu','test-source',true)",
  );
  const request = input('one');
  expect((await runSourceCheck(request, database)).status).toBe('complete');
  expect((await runSourceCheck(request, database)).status).toBe('complete');
  expect(
    (await db.query('select count(*)::int n from source_accepted_observations'))
      .rows[0].n,
  ).toBe(0);
  const { id } = (await db.query<{ id: string }>('select id from map_changes'))
    .rows[0];
  await rpc('team_review_source', {
    actor: owner,
    change_identity: id,
    accept: true,
  });
  expect(
    (await db.query('select count(*)::int n from source_accepted_observations'))
      .rows[0].n,
  ).toBe(1);
  expect(
    (await db.query('select count(*)::int n from source_feature_lineage'))
      .rows[0].n,
  ).toBe(1);
  expect(
    (await db.query('select count(*)::int n from releases')).rows[0].n,
  ).toBe(0);
});
it('prevents old single, bulk, and private helper removal bypasses', async () => {
  await db.exec(
    "insert into map_changes(id,source_id,kind,before,base_hash,summary) select 'unsafe',id,'remove',to_jsonb(s),hash,'Old deletion' from source_features s limit 1",
  );
  await expect(
    rpc('review_map_change', { change_id: 'unsafe', accept_change: true }),
  ).rejects.toThrow('blocked');
  await expect(
    rpc('team_review_source', {
      actor: owner,
      change_identity: 'unsafe',
      accept: true,
    }),
  ).rejects.toThrow('blocked');
  const prepared = await rpc('source_review_prepare', {
    actor_id: owner,
    operation_id: randomUUID(),
    selection: { mode: 'filter', filters: {}, accept: true },
  });
  expect(prepared.total).toBe(0);
  expect(prepared.breakdown.excluded).toBe(1);
  await db.exec('set role service_role');
  await expect(
    rpc('_legacy_review_map_change', {
      change_id: 'unsafe',
      accept_change: true,
    }),
  ).rejects.toThrow('permission');
  await db.exec('reset role');
});
it('undo previews later edits, records idempotent reversals, and preserves editor corrections', async () => {
  await runSourceCheck(input('one', 'New name'), database);
  const { id } = (
    await db.query<{ id: string }>(
      "select id from map_changes where id<>'unsafe' and status='pending'",
    )
  ).rows[0];
  await rpc('team_review_source', {
    actor: owner,
    change_identity: id,
    accept: true,
  });
  const { id: decision } = (
    await db.query<{ id: string }>(
      'select id from source_decision_receipts where group_id=$1',
      [id],
    )
  ).rows[0];
  await db.exec(
    'insert into map_edits(id,kind,geometry,properties) values(\'one\',\'building\',\'{"type":"Point","coordinates":[3,6]}\',\'{"name":"Owner correction"}\')',
  );
  const preview = await rpc('source_undo_preview', {
    actor: owner,
    decision_id: decision,
  });
  expect(preview.eligible).toBe(true);
  await expect(
    rpc('source_undo_preview', { actor: reviewer, decision_id: decision }),
  ).rejects.toThrow('permission');
  const reversal = randomUUID();
  const result = await rpc('source_undo_confirm', {
    actor: owner,
    decision_id: decision,
    reversal_id: reversal,
  });
  expect(
    await rpc('source_undo_confirm', {
      actor: owner,
      decision_id: decision,
      reversal_id: reversal,
    }),
  ).toEqual(result);
  expect(
    (
      await db.query(
        "select properties->>'name' name from map_edits where id='one'",
      )
    ).rows[0].name,
  ).toBe('Owner correction');
  expect(
    (
      await db.query(
        "select payload#>>'{properties,name}' name from source_features where id='feature:one'",
      )
    ).rows[0].name,
  ).toBe('Library');
  expect(
    (await db.query('select count(*)::int n from releases')).rows[0].n,
  ).toBe(0);
});
it('rejects stale baseline, altered retries and cross-campus checks', async () => {
  const request = input('stale');
  await rpc('source_check_begin', {
    run_id: request.runId,
    run_token: request.token,
    source_identity: request.sourceKey,
    check_receipt: request.receipt,
  });
  await db.exec(
    "update source_features set hash='later' where id='feature:one'",
  );
  await expect(
    rpc('source_check_baseline', {
      run_id: request.runId,
      run_token: request.token,
      part: 'records',
    }),
  ).rejects.toThrow('changed');
  await expect(
    rpc('source_check_begin', {
      run_id: request.runId,
      run_token: randomUUID(),
      source_identity: request.sourceKey,
      check_receipt: request.receipt,
    }),
  ).rejects.toThrow('already used');
  await db.exec(
    `select set_config('request.headers','{"x-turnright-campus":"other"}',false)`,
  );
  await expect(
    rpc('source_check_baseline', {
      run_id: request.runId,
      run_token: request.token,
      part: 'records',
    }),
  ).rejects.toThrow('replaced');
  await db.exec("select set_config('request.headers','{}',false)");
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
    await db.query<{ id: string; before: any; after: any }>(
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

it('resumes lost staging and finalization responses without duplicate groups or decisions', async () => {
  const request = await enabledInput('resume');
  let interrupted = false;
  await expect(
    runSourceCheck(
      request,
      async (route: string, method: string, args: Record<string, unknown>) => {
        const result = await database(route, method, args);
        if (route === 'rpc/source_check_stage' && !interrupted) {
          interrupted = true;
          throw new Error('response lost');
        }
        return result;
      },
    ),
  ).rejects.toThrow('response lost');
  expect(await pending('resume')).toHaveLength(0);
  expect((await runSourceCheck(request, database)).status).toBe('complete');
  expect((await runSourceCheck(request, database)).status).toBe('complete');
  const groups = await pending('resume');
  expect(groups).toHaveLength(1);
  await decide(groups[0].id);
  await expect(decide(groups[0].id)).rejects.toThrow('revision changed');
  expect(
    (
      await db.query(
        'select count(*)::int n from source_decision_receipts where group_id=$1',
        [groups[0].id],
      )
    ).rows[0].n,
  ).toBe(1);
});
it('retains rejections, reopens recurring superseded changes, and isolates incomplete collections', async () => {
  const request = await enabledInput('history');
  await runSourceCheck(request, database);
  const rejected = (await pending('history'))[0];
  await decide(rejected.id, false);
  await runSourceCheck(
    { ...request, runId: randomUUID(), token: randomUUID() },
    database,
  );
  expect(await pending('history')).toHaveLength(0);
  const changed = { ...(await enabledInput('history', 'Changed')) };
  await runSourceCheck(changed, database);
  const recurring = (await pending('history'))[0];
  expect(recurring.id).not.toBe(rejected.id);
  await runSourceCheck(
    {
      ...changed,
      runId: randomUUID(),
      token: randomUUID(),
      observations: [],
      receipt: {
        ...changed.receipt,
        collections: [{ identity: 'buildings', complete: false, count: 0 }],
      },
    },
    database,
  );
  expect((await pending('history'))[0].id).toBe(recurring.id);
  await runSourceCheck(
    { ...changed, runId: randomUUID(), token: randomUUID(), observations: [] },
    database,
  );
  expect(await pending('history')).toHaveLength(0);
  await runSourceCheck(
    { ...changed, runId: randomUUID(), token: randomUUID() },
    database,
  );
  expect((await pending('history'))[0].id).toBe(recurring.id);
  expect(
    (
      await db.query('select status from map_changes where id=$1', [
        rejected.id,
      ])
    ).rows[0].status,
  ).toBe('rejected');
});
it('requires complete replacement evidence and preserves later overrides during removal and undo', async () => {
  const request = await enabledInput('removal');
  await runSourceCheck(request, database);
  await decide((await pending('removal'))[0].id);
  await runSourceCheck(
    { ...request, runId: randomUUID(), token: randomUUID(), observations: [] },
    database,
  );
  const blocked = (await pending('removal'))[0];
  await expect(decide(blocked.id)).rejects.toThrow('blocked');
  await runSourceCheck(
    {
      ...request,
      runId: randomUUID(),
      token: randomUUID(),
      observations: [],
      completeReplacement: true,
    },
    database,
  );
  const verified = (await pending('removal'))[0];
  expect(
    (await rpc('source_group_eligibility', { change_id: verified.id }))
      .eligible,
  ).toBe(true);
  await decide(verified.id);
  expect(
    (
      await db.query(
        "select count(*)::int n from source_features where id='feature:removal'",
      )
    ).rows[0].n,
  ).toBe(0);
  const d = (
    await db.query<{ id: string }>(
      "select id from source_decision_receipts where group_id=$1 and outcome='accepted'",
      [verified.id],
    )
  ).rows[0];
  await rpc('source_undo_confirm', {
    actor: owner,
    decision_id: d.id,
    reversal_id: randomUUID(),
  });
  expect(
    (
      await db.query(
        "select count(*)::int n from source_features where id='feature:removal'",
      )
    ).rows[0].n,
  ).toBe(1);
});
it('applies a whole routing group atomically and protects shared nodes and explicit connections', async () => {
  const request: any = await enabledInput('routing');
  const record = (entity: string, id: string, payload: any) => ({
    id: entity + ':' + id,
    entity,
    source: 'routing',
    payload,
    hash: hash(payload),
  });
  request.observations[0].records.push(
    record('node', 'start', { id: 'start', coordinates: [3, 6] }),
    record('node', 'end', { id: 'end', coordinates: [3.1, 6] }),
    record('edge', 'route', {
      id: 'route',
      sourceId: 'routing',
      from: 'start',
      to: 'end',
    }),
  );
  await runSourceCheck(request, database);
  const initial = (await pending('routing'))[0];
  await decide(initial.id);
  await db.exec(
    'insert into source_features(id,entity,source,payload,hash) values (\'edge:shared\',\'edge\',\'other\',\'{"id":"shared","from":"start","to":"end"}\',\'shared\')',
  );
  await runSourceCheck(
    {
      ...request,
      runId: randomUUID(),
      token: randomUUID(),
      observations: [],
      completeReplacement: true,
    },
    database,
  );
  const group = (await pending('routing'))[0];
  await expect(decide(group.id)).rejects.toThrow('Routing dependencies');
  expect(
    (
      await db.query(
        "select count(*)::int n from source_features where id in ('edge:route','node:start','node:end','feature:routing')",
      )
    ).rows[0].n,
  ).toBe(4);
  await db.exec(
    'delete from source_features where id=\'edge:shared\'; insert into map_edits(id,kind,geometry,properties) values(\'explicit\',\'path\',\'{"type":"LineString","coordinates":[[3,6],[3.1,6]]}\',\'{"connection":"route"}\')',
  );
  await expect(decide(group.id)).rejects.toThrow('protected connection');
  await db.exec("delete from map_edits where id='explicit'");
  await decide(group.id);
  expect(
    (
      await db.query(
        "select count(*)::int n from source_features where source='routing'",
      )
    ).rows[0].n,
  ).toBe(0);
});
it('supports descriptive-field review and audited undo without changing the raw observation', async () => {
  const request = await enabledInput('fields');
  await runSourceCheck(request, database);
  await decide((await pending('fields'))[0].id);
  await runSourceCheck(await enabledInput('fields', 'Second'), database);
  const group = (await pending('fields'))[0];
  const before = group.before,
    after = group.after;
  const reviewed = {
    ...before,
    payload: {
      ...before.payload,
      properties: { ...before.payload.properties, name: 'Second' },
    },
  };
  reviewed.hash = hash(reviewed.payload);
  await expect(
    db.query('select review_map_fields($1,$2,$3,$4,$5,$6)', [
      group.id,
      JSON.stringify(before),
      JSON.stringify(after),
      JSON.stringify(reviewed),
      '["properties.name"]',
      owner,
    ]),
  ).rejects.toThrow('revision');
  await rpc('review_map_fields', {
    change_id: group.id,
    expected_before: before,
    expected_after: after,
    reviewed_record: reviewed,
    selected_fields: ['properties.name'],
    actor_id: owner,
  });
  const accepted = (
    await db.query(
      "select o.value,a.record_overrides from source_accepted_observations a join source_observations o on o.run_id=a.run_id and o.identity=a.identity where a.source_key='fields'",
    )
  ).rows[0] as any;
  expect(accepted.value.content.name).toBe('First');
  expect(
    accepted.record_overrides['feature:fields'].payload.properties.name,
  ).toBe('Second');
  const d = (
    await db.query<{ id: string }>(
      "select id from source_decision_receipts where group_id=$1 and evidence ? 'fields'",
      [group.id],
    )
  ).rows[0];
  await rpc('source_undo_confirm', {
    actor: owner,
    decision_id: d.id,
    reversal_id: randomUUID(),
  });
  expect(
    (
      await db.query(
        "select payload#>>'{properties,name}' name from source_features where id='feature:fields'",
      )
    ).rows[0].name,
  ).toBe('First');
});
it('blocks cancelled and permission-revoked imports before finalization', async () => {
  const source = randomUUID(),
    job = randomUUID(),
    token = randomUUID(),
    run = randomUUID();
  await db.query(
    "insert into campus_sources(id,name,kind) values($1,'permission test','file')",
    [source],
  );
  await db.query(
    "insert into campus_imports(id,source_id,configuration,run_token,status,requested_by) values($1,$2,'{}',$3,'preview',$4)",
    [job, source, token, editor],
  );
  await rpc('source_check_begin', {
    run_id: run,
    run_token: token,
    source_identity: 'import:' + source,
    check_receipt: input('x').receipt,
    import_identity: job,
  });
  await db.query('delete from campus_memberships where user_id=$1', [editor]);
  await expect(
    rpc('source_check_finish', {
      run_id: run,
      run_token: token,
      counts: { observation: 0, record: 0, group: 0, member: 0 },
    }),
  ).rejects.toThrow('permission revoked');
  await db.query(
    "insert into campus_memberships values ('lasu',$1,array['editor'])",
    [editor],
  );
  await db.query("update campus_imports set status='cancelled' where id=$1", [
    job,
  ]);
  await expect(
    rpc('source_check_finish', {
      run_id: run,
      run_token: token,
      counts: { observation: 0, record: 0, group: 0, member: 0 },
    }),
  ).rejects.toThrow('cancelled');
});
it('audits legacy provenance without replacing the map or creating acceptance', async () => {
  const request = { ...input('provenance'), sourceKey: 'audit-only' };
  await runSourceCheck(request, database);
  const before = (await db.query('select count(*)::int n from source_features'))
    .rows[0].n;
  const audit = await rpc('source_provenance_backfill', {
    actor: owner,
    check_id: request.runId,
  });
  expect(audit.recovered).toBe(0);
  expect(audit.findings[0].recoverable).toBe(false);
  expect(
    (await db.query('select count(*)::int n from source_features')).rows[0].n,
  ).toBe(before);
});
it('requires the displayed revision on every group decision and rejects direct legacy writes', async () => {
  await runSourceCheck(await enabledInput('revision-guard'), database);
  const group = (await pending('revision-guard'))[0];
  const revision = (
    await db.query<{ review_revision: number }>(
      'select review_revision from map_changes where id=$1',
      [group.id],
    )
  ).rows[0].review_revision;
  await expect(
    db.query('select team_review_source($1,$2,true)', [owner, group.id]),
  ).rejects.toThrow('revision');
  await expect(
    rpc('review_map_change', { change_id: group.id, accept_change: true }),
  ).rejects.toThrow('revision');
  await expect(
    rpc('team_review_source', {
      actor: owner,
      change_identity: group.id,
      accept: true,
      expected_revision: revision + 1,
    }),
  ).rejects.toThrow('revision');
  await expect(
    db.query("update map_changes set status='accepted' where id=$1", [
      group.id,
    ]),
  ).rejects.toThrow('guarded decision');
  await expect(
    db.query("update map_changes set status='superseded' where id=$1", [
      group.id,
    ]),
  ).rejects.toThrow('finalizer');
  const operation = randomUUID();
  await rpc('source_review_prepare', {
    actor_id: owner,
    operation_id: operation,
    selection: {
      mode: 'ids',
      accept: true,
      items: [{ id: group.id, revision }],
    },
  });
  const started = await rpc('source_review_control', {
    actor_id: owner,
    operation_id: operation,
    command: 'start',
    decision: true,
  });
  const done = await rpc('source_review_step', {
    operation_id: operation,
    token: started.run_token,
  });
  expect(done).toMatchObject({ status: 'completed', applied: 1, failed: 0 });
});
it('can review a recurring change after audited undo while retaining the earlier decisions', async () => {
  await runSourceCheck(await enabledInput('undo-recurs'), database);
  await decide((await pending('undo-recurs'))[0].id);
  await runSourceCheck(await enabledInput('undo-recurs', 'Second'), database);
  const id = (await pending('undo-recurs'))[0].id;
  await decide(id);
  const decision = (
    await db.query<{ id: string }>(
      'select id from source_decision_receipts where group_id=$1',
      [id],
    )
  ).rows[0].id;
  await rpc('source_undo_confirm', {
    actor: owner,
    decision_id: decision,
    reversal_id: randomUUID(),
  });
  await runSourceCheck(await enabledInput('undo-recurs', 'Second'), database);
  expect((await pending('undo-recurs')).map((g) => g.id)).toEqual([id]);
  await decide(id);
  expect(
    (
      await db.query(
        'select id from source_decision_receipts where group_id=$1',
        [id],
      )
    ).rows,
  ).toHaveLength(3);
});
it('database graph guards roll back a missing arrival even if a worker mislabels eligibility', async () => {
  const request: any = await enabledInput('missing-arrival');
  request.observations[0].records = [
    {
      id: 'place:missing-arrival',
      entity: 'place',
      source: 'test-source',
      hash: 'missing-arrival',
      payload: {
        id: 'missing-arrival',
        name: 'Entrance',
        coordinates: [3, 6],
        graphNode: 'missing-node',
      },
    },
  ];
  await runSourceCheck(request, database);
  const group = (await pending('missing-arrival'))[0];
  await db.query(
    "update source_proposal_groups set eligible=true,blocking_reasons='[]' where id=$1",
    [group.id],
  );
  await expect(decide(group.id)).rejects.toThrow('arrival connection');
  expect(
    (
      await db.query(
        "select id from source_features where id='place:missing-arrival'",
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        'select id from source_decision_receipts where group_id=$1',
        [group.id],
      )
    ).rows,
  ).toHaveLength(0);
});
