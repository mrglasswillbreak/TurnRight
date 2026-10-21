import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { EditorDatabaseFixture } from './editor-database.test';
export function registerReleaseRevisions(
  fixture: () => EditorDatabaseFixture,
): void {
  it('creates bounded reviewed snapshots with campus isolation and idempotent retries', async () => {
    const campus = 'reviewed-snapshot-test',
      identity = randomUUID();
    await fixture().database.exec(
      "insert into campuses(id,slug,name,boundary,bounds) select 'reviewed-snapshot-test','reviewed-snapshot-test','Reviewed snapshot',boundary,bounds from campuses where id='lasu'",
    );
    const snapshot = {
      features: Array.from({ length: 1500 }, (_, i) => ({
        id: 'source-' + i,
        payload: { name: 'Building ' + i },
      })),
      edits: [],
      workspaceHash: 'a'.repeat(64),
      selection: { mode: 'reviewed-layer-upgrade', excludedDrafts: 1 },
    };
    const create = (actor = fixture().owner, id = identity, value = snapshot) =>
      fixture().database.query<{ id: string }>(
        'select create_reviewed_release_snapshot($1,$2,$3,$4,$5) as id',
        [
          actor,
          id,
          'Reviewed campus release',
          JSON.stringify(value),
          'catalogue-v1',
        ],
      );
    try {
      await fixture().database.query(
        "select set_config('request.headers',$1,false)",
        [JSON.stringify({ 'x-turnright-campus': campus })],
      );
      await expect(create(randomUUID())).rejects.toThrow(
        'Administrator required',
      );
      await expect(
        create(fixture().owner, identity, {
          ...snapshot,
          workspaceHash: 'invalid',
        }),
      ).rejects.toThrow('Invalid reviewed release snapshot');
      await expect(
        create(fixture().owner, identity, { ...snapshot, features: [] }),
      ).rejects.toThrow('Invalid reviewed feature count');
      expect(
        (
          await fixture().database.query(
            'select id from releases where id=$1',
            [identity],
          )
        ).rows,
      ).toHaveLength(0);
      expect((await create()).rows[0].id).toBe(identity);
      const saved = await fixture().database.query<{
        campus_id: string;
        status: string;
        snapshot: unknown;
      }>('select campus_id,status,snapshot from releases where id=$1', [
        identity,
      ]);
      expect(saved.rows[0]).toEqual({
        campus_id: campus,
        status: 'queued',
        snapshot,
      });
      expect((await create()).rows[0].id).toBe(identity);
      await expect(
        create(fixture().owner, identity, {
          ...snapshot,
          workspaceHash: 'b'.repeat(64),
        }),
      ).rejects.toThrow('different snapshot');
      await expect(create(fixture().owner, randomUUID())).rejects.toThrow(
        'already being built',
      );
      await fixture().database.exec(
        "select set_config('request.headers','{}',false)",
      );
      await expect(create()).rejects.toThrow('different snapshot');
      const grants = await fixture().database.query<{
        service: boolean;
        browser: boolean;
        anonymous: boolean;
      }>(
        "select has_function_privilege('service_role','create_reviewed_release_snapshot(uuid,uuid,text,jsonb,text)','EXECUTE') service, has_function_privilege('authenticated','create_reviewed_release_snapshot(uuid,uuid,text,jsonb,text)','EXECUTE') browser, has_function_privilege('anon','create_reviewed_release_snapshot(uuid,uuid,text,jsonb,text)','EXECUTE') anonymous",
      );
      expect(grants.rows[0]).toEqual({
        service: true,
        browser: false,
        anonymous: false,
      });
    } finally {
      await fixture().database.exec(
        "select set_config('request.headers','{}',false)",
      );
    }
  }, 30000);
}
