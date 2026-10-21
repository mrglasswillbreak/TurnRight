import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { EditorDatabaseFixture } from './editor-database.test';
export function registerSourceReviews(
  fixture: () => EditorDatabaseFixture,
): void {
  describe('private survey transactions', () => {
    const call = async (
      command: string,
      payload: unknown,
      actor = fixture().owner,
    ) =>
      (
        await fixture().database.query<{
          result: { status: string; revisionId: string; headRevision: string };
        }>(
          'select save_survey_revision($1::uuid,$2::text,$3::jsonb) as result',
          [actor, command, JSON.stringify(payload)],
        )
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
          await fixture().database.query(
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
      await fixture().database.exec('set role authenticated;');
      await expect(call('begin', {})).rejects.toThrow(/permission denied/);
      expect(
        (await fixture().database.query('select * from surveys')).rows,
      ).toHaveLength(0);
      await expect(
        fixture().database.exec(
          'insert into surveys(id,owner) values(gen_random_uuid(),gen_random_uuid())',
        ),
      ).rejects.toThrow(/permission denied/);
      await fixture().database.exec('reset role;');
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
          await fixture().database.query<{ archived: boolean }>(
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
      await fixture().database.exec(
        "create or replace function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
      );
      await fixture().database.query(
        "select set_config('request.jwt.claim.sub',$1,false)",
        [fixture().owner],
      );
      await fixture().database.exec('set role authenticated;');
      expect(
        (
          await fixture().database.query('select * from surveys where id=$1', [
            s.surveyId,
          ])
        ).rows,
      ).toHaveLength(1);
      await fixture().database.exec('reset role;');
      await fixture().database.query(
        "select set_config('request.jwt.claim.sub',$1,false)",
        ['22222222-2222-4222-8222-222222222222'],
      );
      await fixture().database.exec('set role authenticated;');
      expect(
        (await fixture().database.query('select * from surveys')).rows,
      ).toHaveLength(0);
      await fixture().database.exec('reset role;');
    });
  });
  describe('transactional editor migration', () => {
    it('saves related records atomically and audits each one', async () => {
      const result = await fixture().save(randomUUID(), [
        fixture().item('atomic-a'),
        fixture().item('atomic-b'),
      ]);
      expect(result).toHaveLength(2);
      expect(
        (
          await fixture().database.query(
            "select * from edit_history where edit_id like 'atomic-%'",
          )
        ).rows,
      ).toHaveLength(2);
    });
    it('rolls the entire batch back if any revision conflicts', async () => {
      await fixture().save(randomUUID(), [fixture().item('conflict-existing')]);
      await expect(
        fixture().save(randomUUID(), [
          fixture().item('must-not-exist'),
          fixture().item('conflict-existing', 'Overwrite'),
        ]),
      ).rejects.toThrow(/another session/);
      expect(
        (
          await fixture().database.query(
            "select * from map_edits where id='must-not-exist'",
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await fixture().database.query(
            "select * from edit_history where edit_id='must-not-exist'",
          )
        ).rows,
      ).toHaveLength(0);
    });
    it('replays a lost response without duplicating updates or audit history', async () => {
      const operation = randomUUID(),
        items = [fixture().item('retry')];
      const first = await fixture().save(operation, items),
        second = await fixture().save(operation, items);
      expect(first).toEqual(second);
      expect(
        (
          await fixture().database.query(
            "select * from edit_history where edit_id='retry'",
          )
        ).rows,
      ).toHaveLength(1);
      await expect(
        fixture().save(operation, [fixture().item('retry', 'Changed payload')]),
      ).rejects.toThrow(/Operation ID reused/);
    });
    it('accepts only the current revision', async () => {
      const first = await fixture().save(randomUUID(), [
        fixture().item('revision'),
      ]);
      const second = await fixture().save(randomUUID(), [
        fixture().item('revision', 'New name', first[0].updated_at),
      ]);
      expect(second[0].properties.name).toBe('New name');
      expect(second[0].updated_at).not.toBe(first[0].updated_at);
      await expect(
        fixture().save(randomUUID(), [
          fixture().item('revision', 'Stale', first[0].updated_at),
        ]),
      ).rejects.toThrow(/another session/);
    });
    it('advances revisions even when the previous timestamp is ahead of the clock', async () => {
      const initial = await fixture().database.query<{ updated_at: string }>(
        `insert into map_edits(id,kind,geometry,properties,edited_by,updated_at)
       values('future-revision','entrance','{"type":"Point","coordinates":[3.201,6.46]}','{}',$1,'2099-01-01')
       returning updated_at::text`,
        [fixture().owner],
      );
      const first = initial.rows[0].updated_at;
      const next = await fixture().save(randomUUID(), [
        fixture().item('future-revision', 'Current', first),
      ]);
      expect(next[0].updated_at).not.toBe(first);
      await expect(
        fixture().save(randomUUID(), [
          fixture().item('future-revision', 'Stale', first),
        ]),
      ).rejects.toThrow(/another session/);
      const third = await fixture().save(randomUUID(), [
        fixture().item('future-revision', 'Latest', next[0].updated_at),
      ]);
      expect(third[0].updated_at).not.toBe(next[0].updated_at);
    });
    it('rejects unauthorized actors and direct authenticated execution', async () => {
      await expect(
        fixture().save(
          randomUUID(),
          [fixture().item('unauthorized')],
          '22222222-2222-4222-8222-222222222222',
        ),
      ).rejects.toThrow(/Editor access/);
      await fixture().database.exec('set role authenticated;');
      await expect(
        fixture().save(randomUUID(), [fixture().item('unauthorized')]),
      ).rejects.toThrow(/permission denied/);
      await fixture().database.exec('reset role;');
    });
  });
  describe('campus isolation', () => {
    it('saves identical feature IDs independently, scopes review and snapshots, and rejects moving a record', async () => {
      await fixture().database.exec(
        "insert into campuses(id,slug,name,boundary,bounds) select 'campus-two','second-campus','Second campus',boundary,bounds from campuses where id='lasu'",
      );
      const lasu = await fixture().save(randomUUID(), [
        fixture().item('shared-campus-door', 'LASU door'),
      ]);
      await fixture().database.exec(
        "insert into source_features(id,source,entity,payload,hash) values('feature:shared','test','feature','{}','lasu-hash')",
      );
      try {
        await fixture().database.query(
          "select set_config('request.headers',$1,false)",
          [JSON.stringify({ 'x-turnright-campus': 'campus-two' })],
        );
        await fixture().save(randomUUID(), [
          fixture().item('shared-campus-door', 'Second door'),
        ]);
        await fixture().database.exec(
          "insert into source_features(id,source,entity,payload,hash) values('feature:shared','test','feature','{}','second-hash')",
        );
        const after = {
          id: 'feature:shared',
          source: 'test',
          entity: 'feature',
          payload: { name: 'Reviewed second' },
          hash: 'reviewed-hash',
        };
        await fixture().database.query(
          "insert into map_changes(id,source_id,kind,after,base_hash,summary) values('shared-change','feature:shared','modify',$1,'second-hash','Review second')",
          [JSON.stringify(after)],
        );
        await fixture().database.exec(
          "select review_map_change('shared-change',true)",
        );
        const revision = await fixture().database.query<{ id: string }>(
          "select snapshot_release('Second campus only') as id",
        );
        const release = await fixture().database.query<{
          snapshot: {
            features: { campus_id: string }[];
            edits: { campus_id: string }[];
          };
        }>('select snapshot from releases where id=$1', [revision.rows[0].id]);
        expect(
          release.rows[0].snapshot.features.every(
            (r) => r.campus_id === 'campus-two',
          ),
        ).toBe(true);
        expect(
          release.rows[0].snapshot.edits.every(
            (r) => r.campus_id === 'campus-two',
          ),
        ).toBe(true);
        await expect(
          fixture().database.exec(
            "update map_edits set campus_id='lasu' where campus_id='campus-two'",
          ),
        ).rejects.toThrow(/immutable/);
      } finally {
        await fixture().database.exec(
          "select set_config('request.headers','{}',false)",
        );
      }
      const original = await fixture().database.query<{
        updated_at: string;
        properties: { name: string };
      }>(
        "select updated_at,properties from map_edits where campus_id='lasu' and id='shared-campus-door'",
      );
      expect(original.rows[0].properties.name).toBe('LASU door');
      expect(new Date(original.rows[0].updated_at).toISOString()).toBe(
        new Date(lasu[0].updated_at).toISOString(),
      );
      expect(
        (
          await fixture().database.query<{ hash: string }>(
            "select hash from source_features where campus_id='lasu' and id='feature:shared'",
          )
        ).rows[0].hash,
      ).toBe('lasu-hash');
    });
  });
}
