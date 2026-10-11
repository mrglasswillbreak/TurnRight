import { afterAll, beforeAll, expect, it } from 'vitest';
import { gisDatabase, owner } from './gis-database-fixture';
let db: Awaited<ReturnType<typeof gisDatabase>>;
beforeAll(async () => {
  db = await gisDatabase();
}, 60000);
afterAll(async () => {
  await db?.close();
});
it('captures correction data when releases are created and snapshots change', async () => {
  const snapshot = {
    features: [{ payload: { geometry: 'large source record' } }],
    edits: [{ id: 'retained correction' }],
  };
  const row = (
    await db.query<any>(
      "insert into releases(summary,snapshot) values('summary',$1) returning id,editor_edits",
      [JSON.stringify(snapshot)],
    )
  ).rows[0];
  expect(row.editor_edits).toEqual(snapshot.edits);
  await db.query("update releases set snapshot=jsonb_set(snapshot,'{edits}','[]') where id=$1", [
    row.id,
  ]);
  expect(
    (await db.query<any>('select editor_edits from releases where id=$1', [row.id])).rows[0]
      .editor_edits,
  ).toEqual([]);
});
it('backfills one latest summary without rewriting historical snapshots', async () => {
  const ids = [];
  for (const [version, date] of [
    ['old', '2026-01-01'],
    ['latest', '2026-01-02'],
  ]) {
    const rows = (
      await db.query<any>(
        "insert into releases(summary,snapshot,status,version,published_at) values($1,$2,'published',$1,$3) returning id",
        [version, JSON.stringify({ features: [1, 2, 3], edits: [{ id: version }] }), date],
      )
    ).rows;
    ids.push(rows[0].id);
  }
  await db.query('update releases set editor_edits=null where id=any($1::uuid[])', [ids]);
  const result = (await db.query<any>('select backfill_release_editor_edits() result')).rows[0]
    .result;
  expect(result).toEqual({ updated: ids[1], complete: true });
  const rows = (
    await db.query<any>(
      'select id,editor_edits,snapshot from releases where id=any($1::uuid[]) order by published_at',
      [ids],
    )
  ).rows;
  expect(rows[0].editor_edits).toBeNull();
  expect(rows[1].editor_edits).toEqual([{ id: 'latest' }]);
  expect(rows[1].snapshot.features).toEqual([1, 2, 3]);
  expect(
    (await db.query<any>('select backfill_release_editor_edits() result')).rows[0].result,
  ).toEqual({ updated: null, complete: true });
});
it('refuses old replacement calls without applying data or exposing maintenance', async () => {
  const before = (await db.query<any>('select count(*)::integer n from source_features')).rows[0].n;
  await expect(
    db.query("select reconcile_published_baseline($1,'old','[]','[]')", [owner]),
  ).rejects.toThrow('retired');
  expect((await db.query<any>('select count(*)::integer n from source_features')).rows[0].n).toBe(
    before,
  );
  expect(
    (await db.query<any>('select count(*)::integer n from baseline_reconciliations')).rows[0].n,
  ).toBe(0);
  const rights = (
    await db.query<any>(
      "select has_function_privilege('anon','backfill_release_editor_edits()','execute') anon, has_function_privilege('authenticated','reconcile_published_baseline(uuid,text,jsonb,jsonb)','execute') authenticated",
    )
  ).rows[0];
  expect(rights).toEqual({ anon: false, authenticated: false });
});
