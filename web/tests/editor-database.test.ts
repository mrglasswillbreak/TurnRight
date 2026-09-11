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
  for (const filename of [
    '001_campus.sql',
    '002_explicit_api_grants.sql',
    '003_editor_batches.sql',
    '004_private_surveys.sql',
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
