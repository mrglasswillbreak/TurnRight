import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { gisDatabase } from './gis-database-fixture';

let db: Awaited<ReturnType<typeof gisDatabase>>;
beforeAll(
  async () => {
    db = await gisDatabase();
    // PostGIS WebAssembly startup is slower on Windows; SQL time limits stay unchanged.
  },
  process.platform === 'win32' ? 180000 : 60000,
);
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
  await expect(finish()).rejects.toThrow('verified source comparison');
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
  await expect(finish()).rejects.toThrow('verified source comparison');
  expect((await db.query('select * from map_changes')).rows).toHaveLength(0);
  expect(
    (await db.query('select accepted_import_id from campus_sources')).rows[0]
      .accepted_import_id,
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
  }
}, 60000);
