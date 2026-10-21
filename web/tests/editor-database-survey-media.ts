import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { EditorDatabaseFixture } from './editor-database.test';
export function registerSurveyMedia(
  fixture: () => EditorDatabaseFixture,
): void {
  describe('partial source acceptance', () => {
    it('atomically records accepted fields and keeps geometry pending, rejecting stale reviews', async () => {
      const before = {
        id: 'place:partial-test',
        entity: 'place',
        source: 'osm',
        hash: 'old',
        payload: {
          id: 'partial-test',
          name: 'Before',
          coordinates: [3.2, 6.46],
        },
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
      await fixture().database.query(
        'insert into source_features(id,entity,source,payload,hash) values($1,$2,$3,$4,$5)',
        [
          before.id,
          before.entity,
          before.source,
          JSON.stringify(before.payload),
          before.hash,
        ],
      );
      await fixture().database.query(
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
        fixture().owner,
      ];
      await fixture().database.query(
        'select review_map_fields($1,$2,$3,$4,$5,$6)',
        args,
      );
      expect(
        (
          await fixture().database.query<{
            payload: { coordinates: number[] };
          }>('select payload from source_features where id=$1', [before.id])
        ).rows[0].payload.coordinates,
      ).toEqual(before.payload.coordinates);
      expect(
        (
          await fixture().database.query<{ status: string }>(
            'select status from map_changes where id=$1',
            ['partial-test'],
          )
        ).rows[0].status,
      ).toBe('pending');
      expect(
        (
          await fixture().database.query(
            'select * from source_field_reviews where change_id=$1',
            ['partial-test'],
          )
        ).rows,
      ).toHaveLength(1);
      await expect(
        fixture().database.query(
          'select review_map_fields($1,$2,$3,$4,$5,$6)',
          args,
        ),
      ).rejects.toThrow(/Proposal changed/);
      await fixture().database.exec('set role authenticated');
      await expect(
        fixture().database.query(
          'select review_map_fields($1,$2,$3,$4,$5,$6)',
          args,
        ),
      ).rejects.toThrow(/permission denied/);
      await fixture().database.exec('reset role');
    });
  });
  describe('published baseline reconciliation', () => {
    const sources = async () =>
      (
        await fixture().database.query<{ sources: unknown[] }>(
          "select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb) as sources from source_features s",
        )
      ).rows[0].sources;
    it('preserves all drafts and audit history and refuses a stale review', async () => {
      await fixture().save(randomUUID(), [
        fixture().item(randomUUID(), 'Retained entrance'),
      ]);
      await fixture().database.query(
        "insert into source_features(id,source,entity,payload,hash) values('meta:campus','test','meta',$1::jsonb,'old-hash')",
        [JSON.stringify({ version: 'old-baseline' })],
      );
      const beforeEdits = await fixture().database.query(
        'select * from map_edits order by id',
      );
      const beforeHistory = await fixture().database.query(
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
        fixture().owner,
        'published-test',
        JSON.stringify(beforeSources),
        JSON.stringify(records),
      ];
      await fixture().database.query(
        'select reconcile_published_baseline($1::uuid,$2::text,$3::jsonb,$4::jsonb)',
        args,
      );
      expect(
        (await fixture().database.query('select * from map_edits order by id'))
          .rows,
      ).toEqual(beforeEdits.rows);
      expect(
        (
          await fixture().database.query(
            'select * from edit_history order by id',
          )
        ).rows,
      ).toEqual(beforeHistory.rows);
      expect(
        (
          await fixture().database.query(
            'select before_sources from baseline_reconciliations',
          )
        ).rows,
      ).toEqual([{ before_sources: beforeSources }]);
      expect(
        (await fixture().database.query('select payload from source_features'))
          .rows,
      ).toEqual([{ payload: { version: 'published-test' } }]);
      await expect(
        fixture().database.query(
          'select reconcile_published_baseline($1::uuid,$2::text,$3::jsonb,$4::jsonb)',
          args,
        ),
      ).rejects.toThrow('changed');
    });
    it('rolls back the archive and source replacement when replacement records are invalid', async () => {
      const before = await sources();
      const archives = (
        await fixture().database.query('select * from baseline_reconciliations')
      ).rows;
      const edits = (
        await fixture().database.query('select * from map_edits order by id')
      ).rows;
      const record = {
        id: 'meta:campus',
        source: 'test',
        entity: 'meta',
        hash: 'duplicate',
        payload: { version: 'replacement' },
      };
      await expect(
        fixture().database.query(
          'select reconcile_published_baseline($1::uuid,$2::text,$3::jsonb,$4::jsonb)',
          [
            fixture().owner,
            'replacement',
            JSON.stringify(before),
            JSON.stringify([record, record]),
          ],
        ),
      ).rejects.toThrow(/duplicate key|cannot affect row a second time/);
      expect(await sources()).toEqual(before);
      expect(
        (
          await fixture().database.query(
            'select * from baseline_reconciliations',
          )
        ).rows,
      ).toEqual(archives);
      expect(
        (await fixture().database.query('select * from map_edits order by id'))
          .rows,
      ).toEqual(edits);
    });
    it('compares every source field regardless of order and rejects duplicate or missing expected IDs', async () => {
      await fixture().database.exec(
        "insert into source_features(id,source,entity,payload,hash) values('edge:guard','test','edge','{\"access\":\"private\"}','same-hash')",
      );
      const before = (await sources()) as Record<string, unknown>[];
      const records = before.map(
        ({ updated_at: _timestamp, ...record }) => record,
      );
      const call = (expected: unknown[], actor = fixture().owner) =>
        fixture().database.query(
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
        fixture().database.query(
          'select reconcile_published_baseline($1::uuid,$2::text,$3::jsonb,$4::jsonb)',
          [
            fixture().owner,
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
      await fixture().database.exec(`
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
          fixture().database.query<{ receipt: string }>(
            `select reconcile_published_baseline(b.actor,b.published_version,b.expected_sources,b.records) as receipt
          from json_to_record($1::json) as b(actor uuid,published_version text,expected_sources jsonb,records jsonb)`,
            [
              JSON.stringify({
                actor: fixture().owner,
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
        const archive = await fixture().database.query<{
          before_sources: unknown;
        }>('select before_sources from baseline_reconciliations where id=$1', [
          receipt,
        ]);
        expect(archive.rows[0].before_sources).toEqual(reversed);
        const access = await fixture().database.query<{ allowed: boolean }>(
          "select has_function_privilege('authenticated','reconcile_published_baseline(uuid,text,jsonb,jsonb)','EXECUTE') as allowed",
        );
        expect(access.rows[0].allowed).toBe(false);
        const privateAccess = await fixture().database.query<{
          allowed: boolean;
        }>(
          "select has_function_privilege('service_role','_reconcile_published_baseline(uuid,text,jsonb,jsonb)','EXECUTE') as allowed",
        );
        expect(privateAccess.rows[0].allowed).toBe(false);
      } finally {
        await fixture().database.exec(
          "reset plan_cache_mode; delete from source_features where id like 'edge:scale:%';",
        );
      }
    }, 30000);
  });
}
