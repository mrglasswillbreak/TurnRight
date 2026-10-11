import { afterAll, beforeAll, expect, it } from 'vitest';
import { gisDatabase, owner } from './gis-database-fixture';

let db: Awaited<ReturnType<typeof gisDatabase>>;
beforeAll(async () => {
  db = await gisDatabase();
}, 60000);
afterAll(async () => db?.close());

const node = (id: string, coordinates: number[]) => ({
  id: `node:${id}`,
  entity: 'node',
  source: 'routing-test',
  hash: id,
  payload: { id, coordinates },
});
const edge = (from = 'a', to = 'b') => ({
  entity: 'edge',
  payload: { id: 'link', name: 'Campus link', from, to },
});
const shape = async (
  record: unknown,
  side = 'after',
  cutoff: string | null = null,
) =>
  (
    await db.query<any>(
      'select source_preview_record($1,$2,coalesce($3::timestamptz,clock_timestamp())) result',
      [JSON.stringify(record), side, cutoff],
    )
  ).rows[0].result;

it('resolves current and proposed link endpoints, including additions, removals and a fixed import cutoff', async () => {
  for (const record of [node('a', [3.2, 6.4]), node('b', [3.21, 6.41])])
    await db.query(
      'insert into source_features(id,source,entity,payload,hash) values($1,$2,$3,$4,$5)',
      [
        record.id,
        record.source,
        record.entity,
        JSON.stringify(record.payload),
        record.hash,
      ],
    );
  const original = await shape(edge());
  expect(original.geometry).toEqual({
    type: 'LineString',
    coordinates: [
      [3.2, 6.4],
      [3.21, 6.41],
    ],
  });
  const cutoff = (await db.query<any>('select clock_timestamp()::text t'))
    .rows[0].t;
  await db.query(
    `insert into map_changes(id,source_id,kind,before,after,summary,created_at)
    values('node-move','node:a','modify',$1,$2,'Move node',$3::timestamptz+interval '1 second')`,
    [
      JSON.stringify(node('a', [3.2, 6.4])),
      JSON.stringify(node('a', [3.22, 6.42])),
      cutoff,
    ],
  );
  const later = (
    await db.query<any>("select ($1::timestamptz+interval '1 day')::text t", [
      cutoff,
    ])
  ).rows[0].t;
  expect(await shape(edge(), 'after', cutoff)).toEqual(original);
  expect((await shape(edge(), 'before', later)).geometry).toEqual(
    original.geometry,
  );
  expect((await shape(edge(), 'after', later)).geometry.coordinates[0]).toEqual(
    [3.22, 6.42],
  );
  await db.query(
    `insert into map_changes(id,source_id,kind,after,summary) values('node-add','node:c','add',$1,'New node')`,
    [JSON.stringify(node('c', [3.23, 6.43]))],
  );
  expect(await shape(edge('b', 'c'), 'before', later)).toBeNull();
  expect(
    (await shape(edge('b', 'c'), 'after', later)).geometry.coordinates[1],
  ).toEqual([3.23, 6.43]);
  await db.query(
    `insert into map_changes(id,source_id,kind,before,summary) values('node-remove','node:b','remove',$1,'Remove node')`,
    [JSON.stringify(node('b', [3.21, 6.41]))],
  );
  expect((await shape(edge(), 'before', later)).geometry).toEqual(
    original.geometry,
  );
  expect(await shape(edge(), 'after', later)).toBeNull();
  expect(await shape(edge('a', 'missing'))).toBeNull();
  expect(
    await shape({ entity: 'meta', payload: { version: 'example' } }),
  ).toBeNull();
  const direct = {
    ...edge(),
    payload: { ...edge().payload, geometry: original.geometry },
  };
  expect((await shape(direct)).geometry).toEqual(original.geometry);
});

it('keeps endpoint lookups private and scoped to the current campus', async () => {
  await db.exec(`insert into campuses(id,slug,name,boundary,bounds)
    select 'other','other','Other campus',boundary,bounds from campuses where id='lasu';
    insert into source_features(campus_id,id,source,entity,payload,hash) values
    ('other','node:private','routing-test','node','{"id":"private","coordinates":[20,30]}','private');`);
  expect(await shape(edge('a', 'private'))).toBeNull();
  const privileges = (
    await db.query<any>(`select
    has_function_privilege('authenticated','source_preview_node(text,text,timestamptz)','execute') nodes,
    has_function_privilege('anon','source_preview_record(jsonb,text,timestamptz)','execute') records`)
  ).rows[0];
  expect(privileges).toEqual({ nodes: false, records: false });
  await expect(
    db.query('select source_review_map($1)', [
      '99999999-9999-4999-8999-999999999999',
    ]),
  ).rejects.toThrow('Campus access');
});

it('previews 10,000 routing links in bounded pages while retaining decisions and corrections', async () => {
  await db.exec(`insert into source_features(id,source,entity,payload,hash) values
    ('node:bulk-a','routing-bulk','node','{"id":"bulk-a","coordinates":[3.2,6.4]}','a'),
    ('node:bulk-b','routing-bulk','node','{"id":"bulk-b","coordinates":[3.21,6.41]}','b');
    insert into map_changes(id,source_id,kind,after,summary)
    select 'routing-'||lpad(n::text,5,'0'),'edge:routing-'||n,'add',
    jsonb_build_object('entity','edge','source','routing-bulk','payload',jsonb_build_object('id','routing-'||n,'name','Routing link '||n,'from','bulk-a','to','bulk-b')),
    'Routing change' from generate_series(1,10000) n;
    insert into map_edits(id,kind,geometry,properties) values('routing-correction','path',
    '{"type":"LineString","coordinates":[[3.2,6.4],[3.21,6.41]]}','{"name":"Saved correction"}');`);
  const ids = new Set<string>();
  let cursor = null,
    asOf = null,
    pages = 0;
  do {
    const page = (
      await db.query<any>('select source_review_map($1,$2,$3,$4) result', [
        owner,
        JSON.stringify({ source: 'routing-bulk' }),
        cursor && JSON.stringify(cursor),
        asOf,
      ])
    ).rows[0].result;
    expect(page.rows.length).toBeLessThanOrEqual(50);
    expect(JSON.stringify(page).length).toBeLessThan(30000);
    for (const row of page.rows) {
      expect(ids.has(row.id)).toBe(false);
      ids.add(row.id);
      expect(row.after.geometry).toEqual({
        type: 'LineString',
        coordinates: [
          [3.2, 6.4],
          [3.21, 6.41],
        ],
      });
    }
    cursor = page.nextCursor;
    asOf = page.asOf;
    pages++;
  } while (cursor);
  expect(ids.size).toBe(10000);
  expect(pages).toBe(200);
  expect(
    (
      await db.query<any>(
        "select count(*)::int n from map_changes where status='pending' and source_id like 'edge:routing-%'",
      )
    ).rows[0].n,
  ).toBe(10000);
  expect(
    (
      await db.query<any>(
        "select properties->>'name' name from map_edits where id='routing-correction'",
      )
    ).rows[0].name,
  ).toBe('Saved correction');
  expect(
    (await db.query<any>('select count(*)::int n from releases')).rows[0].n,
  ).toBe(0);
}, 120000);
