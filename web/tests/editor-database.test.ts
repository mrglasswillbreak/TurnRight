import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const owner = '11111111-1111-4111-8111-111111111111';
let database: PGlite;
const item = (
  id: string,
  name = 'Door',
  expectedUpdatedAt: string | null = null,
) => ({
  edit: {
    id,
    kind: 'entrance',
    geometry: { type: 'Point', coordinates: [3.201, 6.46] },
    properties: { name, placeId: 'library' },
    deleted: false,
  },
  expectedUpdatedAt,
});
async function save(
  operation: string,
  items: ReturnType<typeof item>[],
  actor = owner,
) {
  const result = await database.query<{
    saved: { id: string; updated_at: string; properties: { name: string } }[];
  }>('select save_editor_batch($1::uuid,$2::uuid,$3::jsonb) as saved', [
    operation,
    actor,
    JSON.stringify(items),
  ]);
  return result.rows[0].saved;
}
beforeAll(async () => {
  database = new PGlite();
  await database.exec(
    'create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select null::uuid $$;',
  );
  await database.exec(
    'create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);',
  );
  for (const filename of [
    '001_campus.sql',
    '002_explicit_api_grants.sql',
    '003_editor_batches.sql',
    '004_private_surveys.sql',
    '005_baseline_reconciliation.sql',
    '006_reconciliation_safe_updates.sql',
    '007_source_field_reviews.sql',
    '008_private_building_media.sql',
    '009_bounded_baseline_comparison.sql',
    '011_linear_baseline_reconciliation.sql',
    '012_editable_model_assets.sql',
  ]) {
    // PGlite runs PostgreSQL; geometry is JSONB in this schema. Only the unused
    // PostGIS extension declaration is omitted from the local test environment.
    const sql = (
      await readFile(
        new URL(`../../supabase/migrations/${filename}`, import.meta.url),
        'utf8',
      )
    ).replace(
      'create extension if not exists postgis with schema extensions;',
      '',
    );
    await database.exec(sql);
  }
  await database.query('insert into auth.users(id) values($1);', [owner]);
  await database.query('insert into admin_users(id) values($1);', [owner]);
}, 30000);
afterAll(async () => {
  await database?.close();
});
describe('private media migration', () => {
  it('guards authored drafts against older writers and verifies private asset ownership', async () => {
    const id = randomUUID(),
      reference = { version: 1, id, sha256: 'a'.repeat(64), bytes: 100 };
    await database.query(
      "insert into model_assets(id,owner,version,sha256,bytes,path,status) values($1,$2,1,$3,100,$4,'ready')",
      [id, owner, reference.sha256, `${owner}/${id}.json`],
    );
    await expect(
      database.query('update model_assets set sha256=$2 where id=$1', [
        id,
        'b'.repeat(64),
      ]),
    ).rejects.toThrow(/immutable/);
    const entry = {
      ...item('authored-building'),
      edit: {
        ...item('authored-building').edit,
        kind: 'building',
        properties: {
          name: 'Authored building',
          modelDocumentAsset: reference,
        },
      },
    };
    await expect(
      database.query('select save_editor_batch($1::uuid,$2::uuid,$3::jsonb)', [
        randomUUID(),
        owner,
        JSON.stringify([entry]),
      ]),
    ).rejects.toThrow(/Update the editor/);
    const result = await database.query<{ saved: { updated_at: string }[] }>(
      'select save_editor_model_batch($1::uuid,$2::uuid,$3::jsonb) as saved',
      [randomUUID(), owner, JSON.stringify([entry])],
    );
    const oldWriter = {
      ...entry,
      expectedUpdatedAt: result.rows[0].saved[0].updated_at,
      edit: { ...entry.edit, properties: { name: 'Attempt to erase model' } },
    };
    await expect(
      database.query('select save_editor_batch($1::uuid,$2::uuid,$3::jsonb)', [
        randomUUID(),
        owner,
        JSON.stringify([oldWriter]),
      ]),
    ).rejects.toThrow(/Update the editor/);
    expect(
      (
        await database.query<{ public: boolean }>(
          "select public from storage.buckets where id='building-models'",
        )
      ).rows[0].public,
    ).toBe(false);
    expect(
      (
        await database.query<{ allowed: boolean }>(
          "select has_table_privilege('authenticated','model_assets','SELECT') as allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  });
  it('keeps originals private and makes reviewed metadata immutable', async () => {
    const id = randomUUID();
    await database.query(
      'insert into building_media(id,owner,original_path) values($1,$2,$3)',
      [id, owner, `${owner}/${id}/original`],
    );
    await database.query(
      "update building_media set status='approved',derivative_path='approved.webp',public_metadata='{}',reviewed_at=now() where id=$1",
      [id],
    );
    await expect(
      database.query(
        "update building_media set public_metadata='{}' where id=$1",
        [id],
      ),
    ).rejects.toThrow(/immutable/);
    const access = await database.query<{ allowed: boolean }>(
      "select has_table_privilege('anon','building_media','SELECT') as allowed",
    );
    expect(access.rows[0].allowed).toBe(false);
    const bucket = await database.query<{ public: boolean }>(
      "select public from storage.buckets where id='building-media'",
    );
    expect(bucket.rows[0].public).toBe(false);
    const policies = await database.query<{ qual: string }>(
      "select qual from pg_policies where tablename='building_media'",
    );
    expect(policies.rows[0].qual).toContain('auth.uid()');
    expect(policies.rows[0].qual).toContain('admin_users');
  });
});

describe('partial source acceptance', () => {
  it('atomically records accepted fields and keeps geometry pending, rejecting stale reviews', async () => {
    const before = {
      id: 'place:partial-test',
      entity: 'place',
      source: 'osm',
      hash: 'old',
      payload: { id: 'partial-test', name: 'Before', coordinates: [3.2, 6.46] },
    };
    const after = {
      ...before,
      hash: 'proposed',
      payload: {
        ...before.payload,
        name: 'After',
        coordinates: [3.201, 6.461],
      },
    };
    const reviewed = {
      ...before,
      hash: 'reviewed',
      payload: { ...before.payload, name: 'After' },
    };
    await database.query(
      'insert into source_features(id,entity,source,payload,hash) values($1,$2,$3,$4,$5)',
      [
        before.id,
        before.entity,
        before.source,
        JSON.stringify(before.payload),
        before.hash,
      ],
    );
    await database.query(
      'insert into map_changes(id,source_id,kind,before,after,base_hash,status,summary) values($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        'partial-test',
        before.id,
        'modify',
        JSON.stringify(before),
        JSON.stringify(after),
        'old',
        'pending',
        'Metadata and geometry',
      ],
    );
    const args = [
      'partial-test',
      JSON.stringify(before),
      JSON.stringify(after),
      JSON.stringify(reviewed),
      JSON.stringify(['name']),
      owner,
    ];
    await database.query('select review_map_fields($1,$2,$3,$4,$5,$6)', args);
    expect(
      (
        await database.query<{ payload: { coordinates: number[] } }>(
          'select payload from source_features where id=$1',
          [before.id],
        )
      ).rows[0].payload.coordinates,
    ).toEqual(before.payload.coordinates);
    expect(
      (
        await database.query<{ status: string }>(
          'select status from map_changes where id=$1',
          ['partial-test'],
        )
      ).rows[0].status,
    ).toBe('pending');
    expect(
      (
        await database.query(
          'select * from source_field_reviews where change_id=$1',
          ['partial-test'],
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      database.query('select review_map_fields($1,$2,$3,$4,$5,$6)', args),
    ).rejects.toThrow(/Proposal changed/);
    await database.exec('set role authenticated');
    await expect(
      database.query('select review_map_fields($1,$2,$3,$4,$5,$6)', args),
    ).rejects.toThrow(/permission denied/);
    await database.exec('reset role');
  });
});

describe('published baseline reconciliation', () => {
  const sources = async () =>
    (
      await database.query<{ sources: unknown[] }>(
        "select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb) as sources from source_features s",
      )
    ).rows[0].sources;
  it('preserves all drafts and audit history and refuses a stale review', async () => {
    await save(randomUUID(), [item(randomUUID(), 'Retained entrance')]);
    await database.query(
      "insert into source_features(id,source,entity,payload,hash) values('meta:campus','test','meta',$1::jsonb,'old-hash')",
      [JSON.stringify({ version: 'old-baseline' })],
    );
    const beforeEdits = await database.query(
      'select * from map_edits order by id',
    );
    const beforeHistory = await database.query(
      'select * from edit_history order by id',
    );
    const beforeSources = await sources();
    const records = [
      {
        id: 'meta:campus',
        source: 'test',
        entity: 'meta',
        hash: 'test-hash',
        payload: { version: 'published-test' },
      },
    ];
    const args = [
      owner,
      'published-test',
      JSON.stringify(beforeSources),
      JSON.stringify(records),
    ];
    await database.query(
      'select reconcile_published_baseline($1::uuid,$2::text,$3::jsonb,$4::jsonb)',
      args,
    );
    expect(
      (await database.query('select * from map_edits order by id')).rows,
    ).toEqual(beforeEdits.rows);
    expect(
      (await database.query('select * from edit_history order by id')).rows,
    ).toEqual(beforeHistory.rows);
    expect(
      (
        await database.query(
          'select before_sources from baseline_reconciliations',
        )
      ).rows,
    ).toEqual([{ before_sources: beforeSources }]);
    expect(
      (await database.query('select payload from source_features')).rows,
    ).toEqual([{ payload: { version: 'published-test' } }]);
    await expect(
      database.query(
        'select reconcile_published_baseline($1::uuid,$2::text,$3::jsonb,$4::jsonb)',
        args,
      ),
    ).rejects.toThrow('changed');
  });
  it('rolls back the archive and source replacement when replacement records are invalid', async () => {
    const before = await sources();
    const archives = (
      await database.query('select * from baseline_reconciliations')
    ).rows;
    const edits = (await database.query('select * from map_edits order by id'))
      .rows;
    const record = {
      id: 'meta:campus',
      source: 'test',
      entity: 'meta',
      hash: 'duplicate',
      payload: { version: 'replacement' },
    };
    await expect(
      database.query(
        'select reconcile_published_baseline($1::uuid,$2::text,$3::jsonb,$4::jsonb)',
        [
          owner,
          'replacement',
          JSON.stringify(before),
          JSON.stringify([record, record]),
        ],
      ),
    ).rejects.toThrow(/duplicate key|cannot affect row a second time/);
    expect(await sources()).toEqual(before);
    expect(
      (await database.query('select * from baseline_reconciliations')).rows,
    ).toEqual(archives);
    expect(
      (await database.query('select * from map_edits order by id')).rows,
    ).toEqual(edits);
  });
  it('compares every source field regardless of order and rejects duplicate or missing expected IDs', async () => {
    await database.exec(
      "insert into source_features(id,source,entity,payload,hash) values('edge:guard','test','edge','{\"access\":\"private\"}','same-hash')",
    );
    const before = (await sources()) as Record<string, unknown>[];
    const records = before.map(
      ({ updated_at: _timestamp, ...record }) => record,
    );
    const call = (expected: unknown[], actor = owner) =>
      database.query(
        'select reconcile_published_baseline($1::uuid,$2::text,$3::jsonb,$4::jsonb)',
        [
          actor,
          'published-test',
          JSON.stringify(expected),
          JSON.stringify(records),
        ],
      );
    await expect(call([before[0], before[0]])).rejects.toThrow('changed');
    await expect(call(before.slice(1))).rejects.toThrow('changed');
    await expect(
      call(
        before.map((record) =>
          record.id === 'edge:guard'
            ? { ...record, payload: { access: 'yes' } }
            : record,
        ),
      ),
    ).rejects.toThrow('changed');
    await expect(call(before, randomUUID())).rejects.toThrow(
      'Administrator required',
    );
    await expect(
      database.query(
        'select reconcile_published_baseline($1::uuid,$2::text,$3::jsonb,$4::jsonb)',
        [
          owner,
          'published-test',
          JSON.stringify(before),
          JSON.stringify([...records, records[0]]),
        ],
      ),
    ).rejects.toThrow('duplicate key');
    expect(await sources()).toEqual(before);
    await call([...before].reverse());
    expect(await sources()).toEqual(before);
    expect(
      ((await sources()) as Record<string, unknown>[]).map(
        ({ updated_at: _timestamp, ...record }) => record,
      ),
    ).toEqual(records);
  });
  it('reconciles a campus-sized generic plan and retains exact guards, timestamps and rollback data', async () => {
    await database.exec(`
      insert into source_features(id,source,entity,payload,hash)
      select 'edge:scale:' || n, 'test', 'edge',
        jsonb_build_object('id',n,'access','private','notes',repeat('campus ',40)),
        'unchanged-' || n
      from generate_series(1,5000) n;
      set plan_cache_mode = force_generic_plan;
    `);
    try {
      const before = (await sources()) as Record<string, unknown>[];
      const records = before.map(
        ({ updated_at: _timestamp, ...record }) => record,
      );
      const call = (expected: unknown[]) =>
        database.query<{ receipt: string }>(
          `select reconcile_published_baseline(b.actor,b.published_version,b.expected_sources,b.records) as receipt
          from json_to_record($1::json) as b(actor uuid,published_version text,expected_sources jsonb,records jsonb)`,
          [
            JSON.stringify({
              actor: owner,
              published_version: 'published-test',
              expected_sources: expected,
              records,
            }),
          ],
        );
      const altered = before.map((record) =>
        record.id === 'edge:scale:5000'
          ? { ...record, unexpected: 'must not be ignored' }
          : record,
      );
      await expect(call(altered)).rejects.toThrow('changed');
      await expect(call(before.slice(1))).rejects.toThrow('changed');
      const reversed = [...before].reverse();
      const {
        rows: [{ receipt }],
      } = await call(reversed);
      expect(await sources()).toEqual(before);
      const archive = await database.query<{ before_sources: unknown }>(
        'select before_sources from baseline_reconciliations where id=$1',
        [receipt],
      );
      expect(archive.rows[0].before_sources).toEqual(reversed);
      const access = await database.query<{ allowed: boolean }>(
        "select has_function_privilege('authenticated','reconcile_published_baseline(uuid,text,jsonb,jsonb)','EXECUTE') as allowed",
      );
      expect(access.rows[0].allowed).toBe(false);
      const privateAccess = await database.query<{ allowed: boolean }>(
        "select has_function_privilege('service_role','_reconcile_published_baseline(uuid,text,jsonb,jsonb)','EXECUTE') as allowed",
      );
      expect(privateAccess.rows[0].allowed).toBe(false);
    } finally {
      await database.exec(
        "reset plan_cache_mode; delete from source_features where id like 'edge:scale:%';",
      );
    }
  }, 30000);
});
describe('private survey transactions', () => {
  const call = async (command: string, payload: unknown, actor = owner) =>
    (
      await database.query<{
        result: { status: string; revisionId: string; headRevision: string };
      }>('select save_survey_revision($1::uuid,$2::text,$3::jsonb) as result', [
        actor,
        command,
        JSON.stringify(payload),
      ])
    ).rows[0].result;
  const begin = async (
    surveyId = randomUUID(),
    revisionId = randomUUID(),
    expectedRevision: string | null = null,
    chunkCount = 1,
  ) => {
    await call('begin', {
      surveyId,
      revisionId,
      expectedRevision,
      metadata: { name: 'Private walk' },
      chunkCount,
    });
    return { surveyId, revisionId };
  };
  it('finalizes only complete uploads and safely retries lost responses', async () => {
    const { revisionId } = await begin();
    await expect(call('finalize', { revisionId })).rejects.toThrow(
      /incomplete/,
    );
    await call('chunk', { revisionId, index: 0, samples: [{ id: 'raw' }] });
    await call('chunk', { revisionId, index: 0, samples: [{ id: 'raw' }] });
    await expect(
      call('chunk', { revisionId, index: 0, samples: [{ id: 'changed' }] }),
    ).rejects.toThrow(/different/);
    const result = await call('finalize', { revisionId });
    expect(result.status).toBe('complete');
    expect(await call('finalize', { revisionId })).toEqual(result);
  });
  it('retains both concurrent versions and permits explicit resolution', async () => {
    const a = await begin(undefined, undefined, null, 0),
      b = await begin(a.surveyId, undefined, null, 0);
    await call('finalize', { revisionId: a.revisionId });
    const conflict = await call('finalize', { revisionId: b.revisionId });
    expect(conflict.status).toBe('conflict');
    expect(conflict.headRevision).toBe(a.revisionId);
    const resolution = await begin(a.surveyId, undefined, a.revisionId, 0);
    expect(
      (await call('finalize', { revisionId: resolution.revisionId })).status,
    ).toBe('complete');
    expect(
      (
        await database.query(
          'select * from survey_revisions where survey_id=$1',
          [a.surveyId],
        )
      ).rows,
    ).toHaveLength(3);
  });
  it('denies unauthorized mutations and owner-only reads', async () => {
    await expect(
      call('begin', {}, '22222222-2222-4222-8222-222222222222'),
    ).rejects.toThrow(/Editor access/);
    await database.exec('set role authenticated;');
    await expect(call('begin', {})).rejects.toThrow(/permission denied/);
    expect((await database.query('select * from surveys')).rows).toHaveLength(
      0,
    );
    await expect(
      database.exec(
        'insert into surveys(id,owner) values(gen_random_uuid(),gen_random_uuid())',
      ),
    ).rejects.toThrow(/permission denied/);
    await database.exec('reset role;');
  });
  it('allows only the verified owner to read and archives reversibly with a head revision check', async () => {
    const s = await begin(undefined, undefined, null, 0);
    await call('finalize', { revisionId: s.revisionId });
    await expect(
      call('archive', {
        surveyId: s.surveyId,
        expectedRevision: null,
        archived: true,
      }),
    ).rejects.toThrow(/changed/);
    await call('archive', {
      surveyId: s.surveyId,
      expectedRevision: s.revisionId,
      archived: true,
    });
    expect(
      (
        await database.query<{ archived: boolean }>(
          'select archived from surveys where id=$1',
          [s.surveyId],
        )
      ).rows[0].archived,
    ).toBe(true);
    await call('archive', {
      surveyId: s.surveyId,
      expectedRevision: s.revisionId,
      archived: false,
    });
    await database.exec(
      "create or replace function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
    );
    await database.query(
      "select set_config('request.jwt.claim.sub',$1,false)",
      [owner],
    );
    await database.exec('set role authenticated;');
    expect(
      (await database.query('select * from surveys where id=$1', [s.surveyId]))
        .rows,
    ).toHaveLength(1);
    await database.exec('reset role;');
    await database.query(
      "select set_config('request.jwt.claim.sub',$1,false)",
      ['22222222-2222-4222-8222-222222222222'],
    );
    await database.exec('set role authenticated;');
    expect((await database.query('select * from surveys')).rows).toHaveLength(
      0,
    );
    await database.exec('reset role;');
  });
});
describe('transactional editor migration', () => {
  it('saves related records atomically and audits each one', async () => {
    const result = await save(randomUUID(), [
      item('atomic-a'),
      item('atomic-b'),
    ]);
    expect(result).toHaveLength(2);
    expect(
      (
        await database.query(
          "select * from edit_history where edit_id like 'atomic-%'",
        )
      ).rows,
    ).toHaveLength(2);
  });
  it('rolls the entire batch back if any revision conflicts', async () => {
    await save(randomUUID(), [item('conflict-existing')]);
    await expect(
      save(randomUUID(), [
        item('must-not-exist'),
        item('conflict-existing', 'Overwrite'),
      ]),
    ).rejects.toThrow(/another session/);
    expect(
      (
        await database.query(
          "select * from map_edits where id='must-not-exist'",
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await database.query(
          "select * from edit_history where edit_id='must-not-exist'",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it('replays a lost response without duplicating updates or audit history', async () => {
    const operation = randomUUID(),
      items = [item('retry')];
    const first = await save(operation, items),
      second = await save(operation, items);
    expect(first).toEqual(second);
    expect(
      (await database.query("select * from edit_history where edit_id='retry'"))
        .rows,
    ).toHaveLength(1);
    await expect(
      save(operation, [item('retry', 'Changed payload')]),
    ).rejects.toThrow(/Operation ID reused/);
  });
  it('accepts only the current revision', async () => {
    const first = await save(randomUUID(), [item('revision')]);
    const second = await save(randomUUID(), [
      item('revision', 'New name', first[0].updated_at),
    ]);
    expect(second[0].properties.name).toBe('New name');
    await expect(
      save(randomUUID(), [item('revision', 'Stale', first[0].updated_at)]),
    ).rejects.toThrow(/another session/);
  });
  it('rejects unauthorized actors and direct authenticated execution', async () => {
    await expect(
      save(
        randomUUID(),
        [item('unauthorized')],
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toThrow(/Editor access/);
    await database.exec('set role authenticated;');
    await expect(save(randomUUID(), [item('unauthorized')])).rejects.toThrow(
      /permission denied/,
    );
    await database.exec('reset role;');
  });
});
