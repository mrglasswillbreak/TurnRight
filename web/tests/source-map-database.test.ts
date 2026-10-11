import { afterAll, beforeAll, expect, it } from 'vitest';
import { gisDatabase, owner } from './gis-database-fixture';
let db: Awaited<ReturnType<typeof gisDatabase>>;
beforeAll(async () => {
  db = await gisDatabase();
}, 60000);
afterAll(async () => {
  await db?.close();
});
const preview = async (
  filters = {},
  cursor: unknown = null,
  asOf: string | null = null,
  actor = owner,
) =>
  (
    await db.query<any>('select source_review_map($1,$2,$3,$4) result', [
      actor,
      JSON.stringify(filters),
      cursor && JSON.stringify(cursor),
      asOf,
    ])
  ).rows[0].result;

it('previews 10,000 updates in bounded pages without reviewing or changing corrections', async () => {
  await db.exec(`insert into map_changes(id,source_id,kind,after,summary)
    select 'preview-'||lpad(n::text,5,'0'),'feature:preview-'||n,'add',jsonb_build_object('id','feature:preview-'||n,'entity','feature','source','fixture','hash','new-'||n,
      'payload',jsonb_build_object('type','Feature','properties',jsonb_build_object('id','preview-'||n,'kind','building','name','Building '||n),'geometry',jsonb_build_object('type','Point','coordinates',jsonb_build_array(3.2,6.4)))), 'Imported building'
    from generate_series(1,10000) n;
    insert into map_edits(id,kind,geometry,properties) values('preview-1','building','{"type":"Point","coordinates":[3.2,6.4]}','{"name":"Editor name"}');`);
  let cursor = null,
    asOf = null;
  const ids = new Set<string>();
  let pages = 0;
  do {
    const page = await preview({}, cursor, asOf);
    expect(page.rows.length).toBeLessThanOrEqual(50);
    expect(JSON.stringify(page).length).toBeLessThan(30000);
    for (const row of page.rows) {
      expect(ids.has(row.id)).toBe(false);
      ids.add(row.id);
    }
    cursor = page.nextCursor;
    asOf = page.asOf;
    pages++;
  } while (cursor);
  expect(ids.size).toBe(10000);
  expect(pages).toBe(200);
  expect((await preview({ query: 'Building 10000' })).rows).toHaveLength(1);
  expect(
    (
      await db.query<any>(
        "select count(*)::int n from map_changes where status='pending'",
      )
    ).rows[0].n,
  ).toBe(10000);
  expect(
    (await db.query<any>('select count(*)::int n from releases')).rows[0].n,
  ).toBe(0);
  expect(
    (
      await db.query<any>(
        "select properties->>'name' name from map_edits where id='preview-1'",
      )
    ).rows[0].name,
  ).toBe('Editor name');
  await expect(
    preview({}, null, null, '99999999-9999-4999-8999-999999999999'),
  ).rejects.toThrow('Campus access');
}, 120000);

it('limits complex shapes, tolerates non-spatial records, and excludes later imports', async () => {
  const first = await preview({ query: 'New later' });
  await db.exec(
    `insert into map_changes(id,source_id,kind,after,summary) values('later','feature:later','add','{"entity":"feature","payload":{"properties":{"name":"New later"}}}','Later');`,
  );
  expect(
    (await preview({ query: 'New later' }, null, first.asOf)).rows,
  ).toHaveLength(0);
  const complex = {
    payload: {
      geometry: {
        type: 'MultiPoint',
        coordinates: Array.from({ length: 1000 }, (_, n) => [
          3 + n / 10000,
          6 + (n % 2) / 1000,
        ]),
      },
    },
  };
  const result = (
    await db.query<any>('select source_preview_geometry($1) result', [
      JSON.stringify(complex),
    ])
  ).rows[0].result;
  expect(result.simplified).toBe(true);
  expect(result.geometry.type).toBe('Polygon');
  expect(JSON.stringify(result).length).toBeLessThan(1000);
  const missing = (await preview({ query: 'New later' })).rows[0];
  expect(missing.before).toBeNull();
  expect(missing.after).toBeNull();
  expect(
    (
      await db.query<any>(
        "select has_function_privilege('authenticated','source_review_map(uuid,jsonb,jsonb,timestamptz)','execute') allowed",
      )
    ).rows[0].allowed,
  ).toBe(false);
});
