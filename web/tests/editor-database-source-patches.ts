import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { EditorDatabaseFixture } from './editor-database.test';
export function registerSourcePatches(
  fixture: () => EditorDatabaseFixture,
): void {
  it('bounds private import uploads and prevents cancelled candidates from reaching review', async () => {
    const sourceId = randomUUID(),
      importId = randomUUID(),
      token = randomUUID();
    await fixture().database.query(
      "insert into campus_sources(id,name,kind) values($1,'Buildings','file')",
      [sourceId],
    );
    await fixture().database.query(
      "insert into campus_imports(id,source_id,configuration,run_token) values($1,$2,'{}',$3)",
      [importId, sourceId, token],
    );
    const asset = {
      id: randomUUID(),
      import_id: importId,
      path: 'test/import/file.zip',
      name: 'file.zip',
      bytes: 40 * 1024 * 1024,
      sha256: 'd'.repeat(64),
    };
    await fixture().database.query('select add_import_asset($1)', [
      JSON.stringify(asset),
    ]);
    await fixture().database.query('select add_import_asset($1)', [
      JSON.stringify({ ...asset, id: randomUUID() }),
    ]);
    expect(
      (
        await fixture().database.query<{ count: number }>(
          'select count(*)::integer as count from campus_import_assets where import_id=$1',
          [importId],
        )
      ).rows[0].count,
    ).toBe(1);
    await expect(
      fixture().database.query('select add_import_asset($1)', [
        JSON.stringify({
          ...asset,
          id: randomUUID(),
          path: 'test/import/second.zip',
          name: 'second.zip',
          bytes: 20 * 1024 * 1024,
        }),
      ]),
    ).rejects.toThrow(/50 MiB/);
    await fixture().database.query(
      "update campus_imports set status='cancelled' where id=$1",
      [importId],
    );
    await expect(
      fixture().database.query("select queue_campus_import($1,$2,'[]','[]')", [
        importId,
        token,
      ]),
    ).rejects.toThrow(/no longer ready/);
    expect(
      (
        await fixture().database.query<{ public: boolean }>(
          "select public from storage.buckets where id='campus-imports'",
        )
      ).rows[0].public,
    ).toBe(false);
    expect(
      (
        await fixture().database.query<{ allowed: boolean }>(
          "select has_table_privilege('authenticated','campus_imports','SELECT') as allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  });
  it('restores only the selected campus into a fresh preview with the current catalogue baseline', async () => {
    const campus = 'restore-campus',
      historical = randomUUID(),
      other = randomUUID();
    await fixture().database.exec(
      `insert into campuses(id,slug,name,boundary,bounds) select '${campus}','restore-test','Restore test',boundary,bounds from campuses where id='lasu'`,
    );
    const snapshot = { features: [], edits: [], version: 'historical' };
    await fixture().database.query(
      "insert into releases(id,campus_id,status,summary,snapshot,version) values($1,$2,'published','Historical',$3,'restore-test-abc123'),($4,'lasu','published','Other',$3,'lasu-def456')",
      [historical, campus, JSON.stringify(snapshot), other],
    );
    try {
      await fixture().database.query(
        "select set_config('request.headers',$1,false)",
        [JSON.stringify({ 'x-turnright-campus': campus })],
      );
      await expect(
        fixture().database.query(
          "select restore_campus_release($1,'new-catalogue')",
          [other],
        ),
      ).rejects.toThrow('from this campus');
      const result = await fixture().database.query<{ id: string }>(
        "select restore_campus_release($1,'new-catalogue') as id",
        [historical],
      );
      const restored = await fixture().database.query<{
        campus_id: string;
        status: string;
        snapshot: unknown;
        restored_from: string;
        catalogue_revision: string;
      }>('select * from releases where id=$1', [result.rows[0].id]);
      expect(restored.rows[0]).toMatchObject({
        campus_id: campus,
        status: 'queued',
        snapshot,
        restored_from: historical,
        catalogue_revision: 'new-catalogue',
      });
      expect(
        (
          await fixture().database.query<{ status: string }>(
            'select status from releases where id=$1',
            [other],
          )
        ).rows[0].status,
      ).toBe('published');
    } finally {
      await fixture().database.exec(
        "select set_config('request.headers','{}',false)",
      );
    }
  });
  it('queues a large import atomically without losing campus, token, validation or source guards', async () => {
    const campus = 'bulk-import-test',
      source = randomUUID(),
      job = randomUUID(),
      token = randomUUID();
    await fixture().database.exec(
      "insert into campuses(id,slug,name,boundary,bounds) select 'bulk-import-test','bulk-import-test','Bulk import',boundary,bounds from campuses where id='lasu'",
    );
    await fixture().database.query(
      "insert into campus_sources(id,campus_id,name,kind) values($1,$2,'Bulk vectors','file')",
      [source, campus],
    );
    await fixture().database.query(
      "insert into campus_imports(id,campus_id,source_id,configuration,run_token,status,summary) values($1,$2,$3,'{}',$4,'preview',$5)",
      [job, campus, source, token, JSON.stringify({ errors: [] })],
    );
    const proposals = Array.from({ length: 1500 }, (_, i) => ({
      id: 'bulk-review-' + i,
      source_id: 'feature:bulk-' + i,
      kind: 'add',
      before: null,
      after: {
        id: 'feature:bulk-' + i,
        source: 'import:' + source,
        entity: 'feature',
        hash: 'hash-' + i,
        payload: { name: 'Building ' + i },
      },
      base_hash: null,
      summary: 'Imported building ' + i,
    }));
    const queue = (
      rows = proposals,
      runToken = token,
      expected: unknown[] = [],
    ) =>
      fixture().database.query<{ count: number }>(
        'select queue_campus_import($1,$2,$3,$4) as count',
        [job, runToken, JSON.stringify(rows), JSON.stringify(expected)],
      );
    await expect(queue()).rejects.toThrow(/no longer ready/);
    try {
      await fixture().database.query(
        "select set_config('request.headers',$1,false)",
        [JSON.stringify({ 'x-turnright-campus': campus })],
      );
      await expect(queue(proposals, randomUUID())).rejects.toThrow(
        /no longer ready/,
      );
      await fixture().database.query(
        'update campus_imports set summary=$2 where id=$1',
        [job, JSON.stringify({ errors: ['Invalid polygon'] })],
      );
      await expect(queue()).rejects.toThrow(/Repair import errors/);
      await fixture().database.query(
        'update campus_imports set summary=$2 where id=$1',
        [job, JSON.stringify({ errors: [] })],
      );
      await expect(queue(proposals, token, [{ id: 'stale' }])).rejects.toThrow(
        /campus changed/,
      );
      await expect(
        queue([
          ...proposals,
          { ...proposals[0], id: 'invalid-kind', kind: 'invalid' },
        ]),
      ).rejects.toThrow();
      expect(
        (
          await fixture().database.query(
            'select id from map_changes where campus_id=$1',
            [campus],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await fixture().database.query<{ status: string }>(
            'select status from campus_imports where id=$1',
            [job],
          )
        ).rows[0].status,
      ).toBe('preview');
      const result = await queue([...proposals, proposals[0]]);
      expect(result.rows[0].count).toBe(1500);
      expect(
        (
          await fixture().database.query(
            "select id from map_changes where campus_id=$1 and status='pending'",
            [campus],
          )
        ).rows,
      ).toHaveLength(1500);
      expect(
        (
          await fixture().database.query(
            'select id from source_features where campus_id=$1',
            [campus],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await fixture().database.query<{ status: string }>(
            'select status from campus_imports where id=$1',
            [job],
          )
        ).rows[0].status,
      ).toBe('reviewed');
      await expect(queue()).rejects.toThrow(/no longer ready/);
      expect(
        (
          await fixture().database.query(
            "select id from map_changes where campus_id='lasu' and id like 'bulk-review-%'",
          )
        ).rows,
      ).toHaveLength(0);
      const grants = await fixture().database.query<{
        service: boolean;
        browser: boolean;
      }>(
        "select has_function_privilege('service_role','queue_campus_import(uuid,uuid,jsonb,jsonb)','EXECUTE') service, has_function_privilege('authenticated','queue_campus_import(uuid,uuid,jsonb,jsonb)','EXECUTE') browser",
      );
      expect(grants.rows[0]).toEqual({ service: true, browser: false });
    } finally {
      await fixture().database.exec(
        "select set_config('request.headers','{}',false)",
      );
    }
  }, 30000);
  it('compares every import source field without assembling a second campus snapshot', async () => {
    const campus = 'stream-import-test',
      source = randomUUID(),
      job = randomUUID(),
      token = randomUUID();
    await fixture().database.exec(
      "insert into campuses(id,slug,name,boundary,bounds) select 'stream-import-test','stream-import-test','Stream import',boundary,bounds from campuses where id='lasu'",
    );
    await fixture().database.query(
      "insert into campus_sources(id,campus_id,name,kind) values($1,$2,'Vectors','file')",
      [source, campus],
    );
    await fixture().database.query(
      "insert into campus_imports(id,campus_id,source_id,configuration,run_token,status,summary) values($1,$2,$3,'{}',$4,'preview','{\"errors\":[]}')",
      [job, campus, source, token],
    );
    await fixture().database.query(
      `insert into source_features(campus_id,id,entity,source,hash,payload)
     select $1,'feature:' || lpad(n::text,4,'0'),'feature','import:' || $2,'same-hash',
       jsonb_build_object('name','Building ' || n,'metadata',jsonb_build_object('note',repeat('x',8192),'optional',null))
     from generate_series(1,256) n`,
      [campus, source],
    );
    const expected = (
      await fixture().database.query<{ record: Record<string, unknown> }>(
        'select to_jsonb(s) as record from source_features s where campus_id=$1 order by id',
        [campus],
      )
    ).rows.map((r) => r.record);
    const queue = (snapshot: unknown) =>
      fixture().database.query<{ count: number }>(
        "select queue_campus_import($1,$2,'[]',$3) as count",
        [job, token, JSON.stringify(snapshot)],
      );
    try {
      await fixture().database.query(
        "select set_config('request.headers',$1,false)",
        [JSON.stringify({ 'x-turnright-campus': campus })],
      );
      const changedPayload = structuredClone(expected);
      (changedPayload[128].payload as { name: string }).name =
        'Changed without a hash update';
      const missingField = structuredClone(expected);
      delete missingField[0].source;
      for (const stale of [
        null,
        {},
        expected.slice(1),
        [...expected, expected[0]],
        [expected[0], ...expected.slice(0, -1)],
        [...expected].reverse(),
        changedPayload,
        missingField,
        expected.map((r, i) => (i === 0 ? { ...r, campus_id: 'lasu' } : r)),
      ]) {
        await expect(queue(stale)).rejects.toThrow(/campus changed/);
      }
      expect(
        (
          await fixture().database.query<{ status: string }>(
            'select status from campus_imports where id=$1',
            [job],
          )
        ).rows[0].status,
      ).toBe('preview');
      expect((await queue(expected)).rows[0].count).toBe(0);
      expect(
        (
          await fixture().database.query<{ record: Record<string, unknown> }>(
            'select to_jsonb(s) as record from source_features s where campus_id=$1 order by id',
            [campus],
          )
        ).rows.map((r) => r.record),
      ).toEqual(expected);
    } finally {
      await fixture().database.exec(
        "select set_config('request.headers','{}',false)",
      );
    }
  }, 30000);
  it('persists land and overlay edits through the transactional history workflow', async () => {
    for (const kind of ['land', 'overlay'] as const) {
      const entry = fixture().item('vector-' + kind);
      const saved = await fixture().save(randomUUID(), [
        {
          ...entry,
          edit: { ...entry.edit, kind, properties: { name: 'Survey overlay' } },
        },
      ]);
      expect(saved[0].id).toBe('vector-' + kind);
      const history = await fixture().database.query<{ n: number }>(
        'select count(*)::int as n from edit_history where edit_id=$1',
        ['vector-' + kind],
      );
      expect(history.rows[0].n).toBe(1);
    }
  });
}
