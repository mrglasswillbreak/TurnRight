import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { gisDatabase, owner, reviewer } from './gis-database-fixture';
let db: Awaited<ReturnType<typeof gisDatabase>>;
beforeAll(async () => {
  db = await gisDatabase();
}, 60000);
afterAll(async () => {
  await db?.close();
});
const rpc = async (sql: string, args: unknown[] = []) =>
  (await db.query<{ result: any }>(`select ${sql} result`, args)).rows[0]
    .result;
const prepare = (id: string, filters = {}) =>
  rpc('source_review_prepare($1,$2,$3)', [
    owner,
    id,
    JSON.stringify({ mode: 'filter', filters }),
  ]);
const start = (id: string, accept = true, acknowledge = false) =>
  rpc("source_review_control($1,$2,'start',$3,$4)", [
    owner,
    id,
    accept,
    acknowledge,
  ]);

it('reviews 10,000 frozen proposals in bounded batches, preserves corrections and never publishes', async () => {
  await db.exec(`insert into map_changes(id,source_id,kind,after,summary)
    select 'bulk-'||lpad(n::text,5,'0'),'feature:bulk-'||n,'add',jsonb_build_object('id','feature:bulk-'||n,'entity','feature','source','fixture','hash','new-'||n,
      'payload',jsonb_build_object('type','Feature','properties',jsonb_build_object('id','bulk-'||n,'kind','building','name','Building '||n),'geometry',jsonb_build_object('type','Point','coordinates',jsonb_build_array(3.2,6.4)))), 'Imported building'
    from generate_series(1,10000) n;
    insert into map_edits(id,kind,geometry,properties) values('bulk-1','building','{"type":"Point","coordinates":[3.2,6.4]}','{"name":"Editor name"}');`);
  const first = await rpc('source_review_list($1)', [owner]);
  expect(first.rows).toHaveLength(50);
  expect(first.total).toBe(10000);
  expect(JSON.stringify(first)).not.toContain('coordinates');
  const second = await rpc('source_review_list($1,$2,$3)', [
    owner,
    '{}',
    JSON.stringify(first.nextCursor),
  ]);
  expect(
    new Set([...first.rows, ...second.rows].map((r: any) => r.id)).size,
  ).toBe(100);
  const id = randomUUID();
  const frozen = await prepare(id);
  expect(frozen.total).toBe(10000);
  expect(await prepare(id)).toEqual(frozen);
  await db.exec(
    "update map_changes set after=jsonb_set(after,'{payload,properties,name}','\"Newer proposal\"') where id='bulk-00001'; update map_changes set status='superseded' where id='bulk-00002';",
  );
  let operation = await start(id);
  await expect(start(randomUUID())).rejects.toThrow('not found');
  const token = operation.run_token;
  let previous = 0,
    steps = 0;
  while (['queued', 'running'].includes(operation.status)) {
    operation = await rpc('source_review_step($1,$2)', [id, token]);
    const processed = operation.applied + operation.skipped + operation.failed;
    expect(processed - previous).toBeLessThanOrEqual(25);
    expect(processed).toBeGreaterThan(previous);
    previous = processed;
    steps++;
    // Light read requests remain bounded during processing.
    if (steps % 50 === 0)
      expect(
        (await rpc('source_review_list($1)', [owner])).rows.length,
      ).toBeLessThanOrEqual(50);
  }
  expect(steps).toBe(400);
  expect(operation).toMatchObject({
    applied: 9998,
    skipped: 2,
    failed: 0,
    status: 'completed',
  });
  expect(await rpc('source_review_step($1,$2)', [id, token])).toEqual(
    operation,
  );
  expect(
    (
      await db.query(
        "select properties->>'name' name from map_edits where id='bulk-1'",
      )
    ).rows[0].name,
  ).toBe('Editor name');
  expect(
    (
      await db.query(
        "select count(*)::integer n from workspace_audit where action='source-review'",
      )
    ).rows[0].n,
  ).toBe(9998);
  expect(
    (await db.query('select count(*)::integer n from releases')).rows[0].n,
  ).toBe(0);
}, 180000);

it('requires removal acknowledgement, enforces one active job, and resumes only unfinished decisions', async () => {
  await db.exec(
    "insert into map_changes(id,source_id,kind,before,base_hash,summary) select 'remove-'||row_number() over(order by id),id,'remove',to_jsonb(s),hash,'Removal' from source_features s order by id limit 30",
  );
  const id = randomUUID();
  const frozen = await prepare(id, { kind: 'remove' });
  await expect(start(id)).rejects.toThrow('Acknowledge');
  const op = await start(id, true, true);
  const nextId = randomUUID();
  await prepare(nextId, { kind: 'remove' });
  await expect(start(nextId, false)).rejects.toThrow('already running');
  await rpc('source_review_step($1,$2)', [id, op.run_token]);
  await rpc("source_review_control($1,$2,'cancel')", [owner, id]);
  await expect(
    rpc('source_review_step($1,$2)', [id, op.run_token]),
  ).rejects.toThrow('replaced');
  const resumed = await rpc("source_review_control($1,$2,'retry')", [
    owner,
    id,
  ]);
  const done = await rpc('source_review_step($1,$2)', [id, resumed.run_token]);
  expect(done.applied).toBe(frozen.total);
  await expect(
    rpc('source_review_prepare($1,$2,$3)', [
      reviewer,
      randomUUID(),
      '{"mode":"filter","filters":{}}',
    ]),
  ).rejects.toThrow('permission');
  await db.exec(
    `select set_config('request.headers','{"x-turnright-campus":"another-campus"}',false)`,
  );
  await expect(
    rpc('source_review_step($1,$2)', [id, resumed.run_token]),
  ).rejects.toThrow('replaced');
  await db.exec("select set_config('request.headers','{}',false)");
  for (const role of ['anon', 'authenticated'])
    expect(
      (
        await db.query(
          "select has_function_privilege($1,'source_review_step(uuid,uuid)','EXECUTE') allowed",
          [role],
        )
      ).rows[0].allowed,
    ).toBe(false);
});

it('expires temporary selection data while retaining operation receipts and audit records', async () => {
  const receiptId = randomUUID();
  await db.query(
    `insert into source_review_operations(id,campus_id,actor,request,status,total,applied,updated_at)
     values($1,'lasu',$2,'{"mode":"ids","items":[{"id":"old-proposal","revision":1}]}','completed',1,1,now()-interval '31 days')`,
    [receiptId, owner],
  );
  const id = randomUUID();
  await prepare(id);
  await db.query(
    "update source_review_operations set created_at=now()-interval '2 days' where id=$1",
    [id],
  );
  await expect(start(id, false)).rejects.toThrow('expired');
  await rpc('cleanup_source_reviews()');
  expect(
    (
      await db.query(
        'select request,total,applied from source_review_operations where id=$1',
        [receiptId],
      )
    ).rows,
  ).toEqual([{ request: {}, total: 1, applied: 1 }]);
  expect(
    (
      await db.query('select id from source_review_operations where id=$1', [
        id,
      ])
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        "select count(*)::integer n from workspace_audit where action='source-review'",
      )
    ).rows[0].n,
  ).toBeGreaterThan(9998);
});
