import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { gisDatabase } from './gis-database-fixture';

let db: Awaited<ReturnType<typeof gisDatabase>>;
beforeAll(async () => {
  db = await gisDatabase();
}, 60000);
afterAll(async () => {
  await db?.close();
});

it('stages bounded requests and preserves atomic, scoped, stale-preview and retry guards', async () => {
  const source = randomUUID(),
    job = randomUUID(),
    token = randomUUID();
  await db.query(
    "insert into campus_sources(id,name,kind) values($1,'Queue test','file')",
    [source],
  );
  await db.query(
    "insert into campus_imports(id,source_id,status,phase,run_token,summary,configuration) values($1,$2,'preview','preview',$3,'{\"errors\":[]}'::jsonb,'{}')",
    [job, source, token],
  );
  await db.exec(
    "insert into source_features(id,source,entity,payload,hash) values('feature:queue','fixture','feature','{\"name\":\"Original\"}','original')",
  );
  const baseline = (
    await db.query<{ record: unknown }>(
      'select to_jsonb(s) record from source_features s order by id',
    )
  ).rows.map((r) => r.record);
  const proposal = {
    id: 'queue-proposal',
    source_id: 'feature:queue',
    kind: 'modify',
    before: baseline[0],
    after: { source: 'import:' + source },
    base_hash: 'original',
    summary: 'Queue test',
  };
  const begin = (run = token) =>
    db.query('select begin_campus_import_queue($1,$2,$3,1)', [
      job,
      run,
      baseline.length,
    ]);
  const stage = (kind: string, rows: unknown[], offset = 0) =>
    db.query('select stage_campus_import_queue($1,$2,$3,$4,$5)', [
      job,
      token,
      kind,
      offset,
      JSON.stringify(rows),
    ]);
  const finish = (run = token) =>
    db.query<{ count: number }>(
      'select finish_campus_import_queue($1,$2) count',
      [job, run],
    );
  await expect(begin(randomUUID())).rejects.toThrow('no longer ready');
  await begin();
  await begin();
  await expect(finish()).rejects.toThrow('incomplete');
  await expect(stage('source', Array(101).fill(baseline[0]))).rejects.toThrow(
    'limit',
  );
  await expect(
    stage('source', [{ id: 'too-large', payload: 'x'.repeat(524288) }]),
  ).rejects.toThrow('limit');
  await stage('source', baseline);
  await stage('source', baseline);
  await expect(
    stage('source', [{ ...(baseline[0] as object), hash: 'changed' }]),
  ).rejects.toThrow('differs');
  await stage('proposal', [proposal]);
  await expect(stage('proposal', [proposal], 1)).rejects.toThrow('declared');
  await expect(finish(randomUUID())).rejects.toThrow('cancelled');
  await db.exec(
    'select set_config(\'request.headers\',\'{"x-turnright-campus":"another-campus"}\',false)',
  );
  await expect(finish()).rejects.toThrow('cancelled');
  await db.exec("select set_config('request.headers','{}',false)");
  await db.exec(
    'update source_features set payload=\'{"name":"Concurrent edit with unchanged hash"}\' where id=\'feature:queue\'',
  );
  await expect(finish()).rejects.toThrow('campus changed');
  expect((await db.query('select * from map_changes')).rows).toHaveLength(0);
  await db.exec(
    'update source_features set payload=\'{"name":"Original"}\' where id=\'feature:queue\'',
  );
  await db.exec("update campus_imports set status='cancelled'");
  await expect(finish()).rejects.toThrow('cancelled');
  await db.exec("update campus_imports set status='running'");
  expect((await finish()).rows[0].count).toBe(1);
  expect((await finish()).rows[0].count).toBe(1);
  expect(
    (await db.query('select * from campus_import_queue_records')).rows,
  ).toHaveLength(0);
  expect(
    (await db.query('select status from campus_imports')).rows[0].status,
  ).toBe('reviewed');
  expect((await db.query('select * from map_changes')).rows).toHaveLength(1);
  expect(
    (
      await db.query(
        "select to_regprocedure('queue_campus_import(uuid,uuid,jsonb,jsonb)') old",
      )
    ).rows[0].old,
  ).toBeNull();
  for (const role of ['anon', 'authenticated']) {
    expect(
      (
        await db.query(
          "select has_function_privilege($1,'finish_campus_import_queue(uuid,uuid)','EXECUTE') allowed",
          [role],
        )
      ).rows[0].allowed,
    ).toBe(false);
    expect(
      (
        await db.query(
          "select has_table_privilege($1,'campus_import_queue_records','SELECT') allowed",
          [role],
        )
      ).rows[0].allowed,
    ).toBe(false);
  }
}, 60000);
