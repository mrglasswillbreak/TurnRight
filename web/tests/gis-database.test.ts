import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  gisDatabase,
  owner,
  editor,
  reviewer,
  publisher,
} from './gis-database-fixture';
import type { PGlite } from '@electric-sql/pglite';
let db: PGlite;
beforeAll(async () => {
  db = await gisDatabase();
}, 120000);
afterAll(async () => {
  await db?.close();
});
it('migrates with real PostGIS and backfills the existing owner', async () => {
  expect(
    (await db.query<{ v: string }>('select extensions.postgis_version() v'))
      .rows[0].v,
  ).toContain('3.');
  expect(
    (await db.query("select workspace_can($1,'manage') allowed", [owner]))
      .rows[0],
  ).toEqual({ allowed: true });
  expect(
    (await db.query("select workspace_can($1,'publish') allowed", [editor]))
      .rows[0],
  ).toEqual({ allowed: false });
});
it('indexes sources, validates atomic private attributes and rejects stale cursors', async () => {
  for (let i = 0; i < 4; i++)
    await db.query(
      'insert into source_features(id,source,entity,payload,hash,private_attributes) values($1,$2,$3,$4,$5,$6)',
      [
        'gis-source:' + i,
        'survey',
        'feature',
        JSON.stringify({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [3.2 + i / 1000, 6.46] },
          properties: {
            id: 'gis-test-' + i,
            kind: 'land',
            mapLayerId: 'gis-test',
            name: 'Tree ' + i,
          },
        }),
        'hash' + i,
        JSON.stringify({ height: i, asset_code: '00' + i }),
      ],
    );
  const query = async (q: object, actor = editor) =>
    (
      await db.query<{
        r: {
          revision: number;
          nextCursor: string;
          features: { id: string; properties: object }[];
        };
      }>('select gis_query($1,$2) r', [
        actor,
        JSON.stringify({ datasetId: 'gis-test', limit: 2, ...q }),
      ])
    ).rows[0].r;
  const page = await query({ sort: { field: 'height', direction: 'desc' } });
  expect(page.features.map((f) => f.id)).toEqual([
    'land:gis-test-3',
    'land:gis-test-2',
  ]);
  const next = await query({
    sort: { field: 'height', direction: 'desc' },
    cursor: page.nextCursor,
    revision: page.revision,
  });
  expect(next.features.map((f) => f.id)).toEqual([
    'land:gis-test-1',
    'land:gis-test-0',
  ]);
  const operation = randomUUID(),
    items = JSON.stringify([
      { key: 'land:gis-test-1', values: { height: 42 } },
    ]);
  await db.query('select gis_save_attributes($1,$2,$3,$4,$5)', [
    editor,
    'gis-test',
    page.revision,
    operation,
    items,
  ]);
  await db.query('select gis_save_attributes($1,$2,$3,$4,$5)', [
    editor,
    'gis-test',
    page.revision,
    operation,
    items,
  ]);
  await expect(
    query({
      cursor: page.nextCursor,
      sort: { field: 'height', direction: 'desc' },
    }),
  ).rejects.toThrow(/stale/);
  await expect(
    db.query('select gis_save_attributes($1,$2,$3,$4,$5)', [
      reviewer,
      'gis-test',
      page.revision,
      randomUUID(),
      items,
    ]),
  ).rejects.toThrow(/permission/);
});
it('requires independent approval, invalidates stale submissions and audits owner overrides', async () => {
  const id = randomUUID();
  await db.query('select gis_submit_review($1,$2,$3)', [
    editor,
    id,
    'Review campus attributes',
  ]);
  await expect(
    db.query('select gis_decide_review($1,$2,true,$3,false)', [
      editor,
      id,
      'Looks correct',
    ]),
  ).rejects.toThrow(/permission/);
  await db.query('select save_campus_member($1,$2,$3,$4)', [
    owner,
    editor,
    ['editor', 'reviewer'],
    randomUUID(),
  ]);
  await expect(
    db.query('select gis_decide_review($1,$2,true,$3,false)', [
      editor,
      id,
      'Looks correct',
    ]),
  ).rejects.toThrow(/contributor/);
  await db.query('select gis_decide_review($1,$2,true,$3,false)', [
    reviewer,
    id,
    'Checked the submitted changes',
  ]);
  const release = (
    await db.query<{ id: string }>(
      'select gis_prepare_release($1,$2,$3,$4) id',
      [publisher, id, 'catalogue-hash', 'Approved GIS release'],
    )
  ).rows[0].id;
  await db.query('select gis_assert_release_approval($1)', [release]);
  await db.query(
    "update gis_datasets set revision=revision+1 where id='gis-test'",
  );
  await expect(
    db.query('select gis_assert_release_approval($1)', [release]),
  ).rejects.toThrow(/stale/);
  await db.query("update releases set status='failed' where id=$1", [release]);
  const override = randomUUID();
  await db.query('select gis_submit_review($1,$2,$3)', [
    owner,
    override,
    'Owner authored submission',
  ]);
  await expect(
    db.query('select gis_decide_review($1,$2,true,$3,false)', [
      owner,
      override,
      'Inspected personally',
    ]),
  ).rejects.toThrow(/contributor/);
  await db.query('select gis_decide_review($1,$2,true,$3,true)', [
    owner,
    override,
    'Emergency correction personally verified',
  ]);
  expect(
    (
      await db.query(
        "select action from workspace_audit where subject=$1 and action='review-owner-override'",
        [override],
      )
    ).rows,
  ).toHaveLength(1);
  await expect(db.exec('delete from workspace_audit')).rejects.toThrow(
    /append-only/,
  );
});
it('keeps CSV identities stable, preserves nulls on rebuild, and denies cross-campus access', async () => {
  const operation = randomUUID(),
    schema = {
      version: 1,
      fields: [
        { name: 'asset', type: 'text' },
        { name: 'value', type: 'number' },
      ],
    },
    rows = [
      { asset: '001', value: null },
      { asset: '002', value: 7 },
    ];
  const args = [
    editor,
    operation,
    'Asset table',
    JSON.stringify(schema),
    JSON.stringify(rows),
  ];
  const first = (
    await db.query<{ d: { id: string } }>(
      'select gis_import_table($1,$2,$3,$4,$5) d',
      args,
    )
  ).rows[0].d;
  await db.query('select gis_import_table($1,$2,$3,$4,$5)', args);
  const before = (
    await db.query(
      'select feature_key,properties from gis_feature_index where dataset_id=$1 order by feature_key',
      [first.id],
    )
  ).rows;
  await db.query("select gis_rebuild_index('lasu')");
  expect(
    (
      await db.query(
        'select feature_key,properties from gis_feature_index where dataset_id=$1 order by feature_key',
        [first.id],
      )
    ).rows,
  ).toEqual(before);
  await db.exec(
    "insert into campuses(id,slug,name,boundary,bounds) select 'other-campus','other-campus','Other',boundary,bounds from campuses where id='lasu'",
  );
  await db.query("select set_config('request.headers',$1,false)", [
    JSON.stringify({ 'x-turnright-campus': 'other-campus' }),
  ]);
  try {
    await expect(
      db.query('select gis_query($1,$2)', [
        editor,
        JSON.stringify({ datasetId: 'gis-test' }),
      ]),
    ).rejects.toThrow(/access/);
    expect(
      (await db.query("select workspace_can($1,'manage') allowed", [owner]))
        .rows[0],
    ).toEqual({ allowed: true });
  } finally {
    await db.exec("select set_config('request.headers','{}',false)");
  }
});
it('pins job revisions and refuses late completion after cancellation or revocation', async () => {
  const d = (
    await db.query<{ revision: number }>(
      "select revision from gis_datasets where campus_id='lasu' and id='gis-test'",
    )
  ).rows[0];
  const id = randomUUID(),
    request = {
      operationId: id,
      tool: 'buffer',
      name: 'Buffer result',
      input: { datasetId: 'gis-test', revision: Number(d.revision) },
      parameters: { distance: 10 },
    };
  await db.query('select gis_start_job($1,$2)', [
    editor,
    JSON.stringify(request),
  ]);
  const claimed = (
    await db.query<{ j: { run_token: string } }>('select gis_claim_job($1) j', [
      id,
    ])
  ).rows[0].j;
  await db.query('select gis_cancel_job($1,$2)', [editor, id]);
  expect(
    (
      await db.query('select gis_finish_job($1,$2,$3) ok', [
        id,
        claimed.run_token,
        '{}',
      ])
    ).rows[0],
  ).toEqual({ ok: false });
  await expect(
    db.query('select gis_apply_job($1,$2)', [editor, id]),
  ).rejects.toThrow(/applicable/);
  const next = randomUUID();
  await db.query('select gis_start_job($1,$2)', [
    editor,
    JSON.stringify({ ...request, operationId: next }),
  ]);
  await db.query('select save_campus_member($1,$2,$3,$4)', [
    owner,
    editor,
    [],
    randomUUID(),
  ]);
  await expect(db.query('select gis_claim_job($1)', [next])).rejects.toThrow(
    /access/,
  );
  await db.query('select save_campus_member($1,$2,$3,$4)', [
    owner,
    editor,
    ['editor'],
    randomUUID(),
  ]);
});
it('queries 100,000 indexed features with bounded pages and an indexed spatial extent', async () => {
  await db.exec(
    'insert into gis_datasets(campus_id,id,name,schema) values(\'lasu\',\'scale-test\',\'100,000 trees\',\'{"version":1,"fields":[{"name":"height","type":"number"}]}\')',
  );
  await db.exec(
    "insert into gis_feature_index(campus_id,dataset_id,feature_key,geometry,properties) select 'lasu','scale-test','overlay:scale:'||lpad(i::text,6,'0'),extensions.ST_SetSRID(extensions.ST_MakePoint(3.2+(i%1000)*0.00001,6.46+(i/1000)*0.00001),4326),jsonb_build_object('height',i%50) from generate_series(1,100000) i",
  );
  const result = (
    await db.query<{
      page: { total: number; features: unknown[]; nextCursor: string };
    }>('select gis_query($1,$2) page', [
      editor,
      JSON.stringify({
        datasetId: 'scale-test',
        limit: 100,
        bbox: [3.201, 6.4601, 3.202, 6.4603],
      }),
    ])
  ).rows[0].page;
  expect(result.total).toBeGreaterThan(100);
  expect(result.total).toBeLessThan(100000);
  expect(result.features).toHaveLength(100);
  expect(result.nextCursor).toBeTruthy();
  expect(JSON.stringify(result).length).toBeLessThan(100000);
  await db.exec(
    "delete from gis_feature_index where dataset_id='scale-test';delete from gis_datasets where id='scale-test'",
  );
}, 120000);

it('freezes corrected historical geometry and retains source metadata on reindex', async () => {
  await db.query(
    "update source_features set gis_metadata=$1,private_attributes=private_attributes||$2::jsonb where id='gis-source:0'",
    [
      JSON.stringify({
        sourceCRS: 'EPSG:32631',
        fields: [{ name: 'inspected', type: 'Date', alias: 'Observed on' }],
      }),
      JSON.stringify({ late_field: 'Preserved', inspected: null }),
    ],
  );
  const dataset = (
    await db.query<{
      source_crs: string;
      schema: { fields: { name: string; type: string; alias?: string }[] };
    }>("select source_crs,schema from gis_datasets where id='gis-test'")
  ).rows[0];
  expect(dataset.source_crs).toBe('EPSG:32631');
  expect(dataset.schema.fields.map((f) => f.name)).toEqual(
    expect.arrayContaining(['late_field', 'inspected']),
  );
  expect(
    dataset.schema.fields.find((f) => f.name === 'inspected'),
  ).toMatchObject({ type: 'date', alias: 'Observed on' });
  const configured = (
    await db.query<{ d: import('../src/gis-types').Dataset }>(
      "select to_jsonb(d) d from gis_datasets d where id='gis-test'",
    )
  ).rows[0].d;
  configured.schema.fields.find((f) => f.name === 'inspected')!.alias =
    'Team observation date';
  await db.query('select gis_save_dataset($1,$2,$3,$4)', [
    editor,
    JSON.stringify(configured),
    configured.revision,
    randomUUID(),
  ]);
  await db.exec(
    "update source_features set gis_metadata=gis_metadata where id='gis-source:0'",
  );
  expect(
    (
      await db.query<{ fields: { name: string; alias?: string }[] }>(
        "select schema->'fields' fields from gis_datasets where id='gis-test'",
      )
    ).rows[0].fields.find((f) => f.name === 'inspected')?.alias,
  ).toBe('Team observation date');
  const snapshot = (
    await db.query<{
      s: { features: unknown[]; edits: unknown[]; datasets: unknown[] };
    }>('select gis_workspace_snapshot() s')
  ).rows[0].s;
  snapshot.edits = [
    {
      id: 'gis-test-0',
      kind: 'land',
      geometry: { type: 'Point', coordinates: [3.215, 6.465] },
      properties: { name: 'Corrected tree' },
      deleted: false,
    },
  ];
  const historical = (
    await db.query<{ id: string }>(
      "insert into releases(status,summary,snapshot) values('published','Historical correction',$1) returning id",
      [JSON.stringify(snapshot)],
    )
  ).rows[0].id;
  const review = randomUUID();
  await db.query('select gis_submit_restore($1,$2,$3,$4)', [
    publisher,
    review,
    historical,
    'Restore the corrected historical map',
  ]);
  const page = (
    await db.query<{
      p: {
        features: {
          id: string;
          geometry: { coordinates: number[] };
          properties: Record<string, unknown>;
        }[];
      };
    }>('select gis_review_query($1,$2,$3) p', [reviewer, review, 'gis-test'])
  ).rows[0].p;
  const feature = page.features.find((f) => f.id === 'land:gis-test-0')!;
  expect(feature.geometry.coordinates).toEqual([3.215, 6.465]);
  expect(feature.properties.name).toBe('Corrected tree');
  expect(feature.properties.late_field).toBe('Preserved');
  const hydrated = (
    await db.query<{ r: { features: unknown[] } }>(
      'select gis_hydrate_editor($1,$2) r',
      [editor, JSON.stringify(['land:gis-test-0'])],
    )
  ).rows[0].r;
  expect(hydrated.features).toHaveLength(1);
  await expect(
    db.query('select gis_hydrate_editor($1,$2)', [
      editor,
      JSON.stringify(Array(501).fill('land:gis-test-0')),
    ]),
  ).rejects.toThrow(/500/);
});

it('shares attached approved photos while keeping unfinished and unattached uploads personal', async () => {
  const attached = randomUUID(),
    pending = randomUUID(),
    unattached = randomUUID();
  for (const [id, status] of [
    [attached, 'approved'],
    [pending, 'pending'],
    [unattached, 'approved'],
  ])
    await db.query(
      "insert into building_media(id,owner,status,original_path,public_metadata,draft_metadata,reviewed_at,derivative_path) values($1,$2,$3,$4,$5,$6,now(),'verified.webp')",
      [
        id,
        editor,
        status,
        editor + '/' + id + '/original',
        JSON.stringify({ caption: 'Verified campus evidence' }),
        JSON.stringify({ caption: 'Personal unfinished details' }),
      ],
    );
  await db.query(
    "insert into source_features(id,entity,source,payload,hash) values($1,'meta','test',$2,'photo-source')",
    [
      'meta:shared-photo',
      JSON.stringify({ photos: [{ id: 'owner:' + attached }] }),
    ],
  );
  const library = (
    await db.query<{ items: { id: string; draft_metadata: unknown }[] }>(
      'select gis_media_library($1,$2,0) items',
      [reviewer, ''],
    )
  ).rows[0].items;
  expect(library.map((p) => p.id)).toEqual([attached]);
  expect(library[0].draft_metadata).toBeNull();
  expect(JSON.stringify(library)).not.toContain('/original');
  const mine = (
    await db.query<{ items: unknown[] }>(
      'select gis_media_library($1,$2,0) items',
      [editor, ''],
    )
  ).rows[0].items;
  expect(mine).toHaveLength(3);
  await db.query('select gis_submit_review($1,$2,$3)', [
    editor,
    randomUUID(),
    'Retain verified photographic evidence',
  ]);
  await db.exec("delete from source_features where id='meta:shared-photo'");
  expect(
    (
      await db.query<{ attached: boolean }>(
        "select gis_asset_attached($1,'photo') attached",
        [attached],
      )
    ).rows[0].attached,
  ).toBe(true);
  expect(
    (
      await db.query<{ attached: boolean }>(
        "select gis_asset_attached($1,'photo') attached",
        [pending],
      )
    ).rows[0].attached,
  ).toBe(false);
});

it('enforces canonical dates, nulls and coded types at the database boundary', async () => {
  const schema = JSON.stringify({
    version: 1,
    fields: [
      { name: 'observed', type: 'date' },
      { name: 'height', type: 'number', required: true },
      { name: 'condition', type: 'text', domain: ['good', 'poor'] },
    ],
  });
  const validate = (values: object) =>
    db.query('select gis_validate_values($1,$2)', [
      schema,
      JSON.stringify(values),
    ]);
  await validate({ observed: '2024-02-29', height: 0, condition: null });
  await validate({
    observed: '2026-10-05T10:30:00.123Z',
    height: 1,
    condition: 'good',
  });
  for (const observed of [
    '2026-02-29',
    '2026-13-01',
    'infinity',
    '2026-10-05T24:00:00Z',
  ])
    await expect(validate({ observed, height: 1 })).rejects.toThrow(/date/);
  await expect(validate({ height: null })).rejects.toThrow(/Required/);
  await expect(validate({ height: '' })).rejects.toThrow(/type/);
  await expect(validate({ height: 1, condition: 'unknown' })).rejects.toThrow(
    /domain/,
  );
});

it('lets editors accept source fields and attributes the change to independent review', async () => {
  const before = (
    await db.query<{
      r: {
        id: string;
        entity: string;
        payload: { properties: Record<string, unknown> };
        hash: string;
      };
    }>("select to_jsonb(s) r from source_features s where id='gis-source:0'")
  ).rows[0].r;
  const after = structuredClone(before);
  after.payload.properties.name = 'Imported name';
  after.hash = 'accepted-name';
  await db.query(
    "insert into map_changes(id,source_id,kind,before,after,base_hash,summary) values('gis-field-review',$1,'modify',$2,$3,$4,'Import name')",
    [before.id, JSON.stringify(before), JSON.stringify(after), before.hash],
  );
  const args = [
    'gis-field-review',
    JSON.stringify(before),
    JSON.stringify(after),
    JSON.stringify(after),
    JSON.stringify(['name']),
  ];
  await expect(
    db.query('select review_map_fields($1,$2,$3,$4,$5,$6)', [
      ...args,
      reviewer,
    ]),
  ).rejects.toThrow(/access|permission/);
  await db.query('select review_map_fields($1,$2,$3,$4,$5,$6)', [
    ...args,
    editor,
  ]);
  expect(
    (
      await db.query(
        "select actor from workspace_audit where subject='gis-field-review' and action='source-review'",
      )
    ).rows,
  ).toEqual([{ actor: editor }]);
  const id = randomUUID();
  const submission = (
    await db.query<{ r: { contributors: string[] } }>(
      'select gis_submit_review($1,$2,$3) r',
      [owner, id, 'Independent source check'],
    )
  ).rows[0].r;
  expect(submission.contributors).toContain(editor);
});
