import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { owner } from './gis-database-fixture';
import {
  runSourceCheck,
  maintainSourceEvidence,
} from '../../scripts/source-check-worker.mjs';
import type { SourceReliabilityDatabaseFixture } from './source-reliability-database.test';
export function registerConcurrency(
  fixture: () => SourceReliabilityDatabaseFixture,
): void {
  it('compresses complete raw evidence, deduplicates repeated checks, and bounds snapshot retention', async () => {
    const request = {
      ...fixture().input('storage'),
      sourceKey: 'storage-bounded',
    };
    request.observations = Array.from({ length: 1200 }, (_, i) => ({
      ...request.observations[0],
      nativeId: `context-${i}`,
      records: [],
      content: {
        name: 'Unmapped source context',
        detail: 'Retained raw evidence '.repeat(60),
        id: i,
      },
    }));
    request.receipt.collections[0].count = 1200;
    await runSourceCheck(request, fixture().database);
    const size = (
      await fixture().db.query<{ n: number; bytes: number; raw: number }>(
        `select count(*)::int n,sum(pg_column_size(b.value))::int bytes,sum(octet_length(b.value::text))::int raw
     from source_check_payloads b where exists(select 1 from source_check_pages p where p.run_id=$1 and p.digest=b.digest and p.campus_id=b.campus_id)`,
        [request.runId],
      )
    ).rows[0];
    expect(size.bytes).toBeLessThan(size.raw / 2);
    const counts = async () =>
      (
        await fixture().db.query<{ payloads: number; runs: number }>(
          `select count(distinct p.digest)::int payloads,count(distinct p.run_id)::int runs
     from source_check_pages p join source_check_runs r on r.id=p.run_id where r.source_key='storage-bounded'`,
        )
      ).rows[0];
    for (let i = 0; i < 4; i++) {
      await runSourceCheck(
        { ...request, runId: randomUUID(), token: randomUUID() },
        fixture().database,
      );
      expect((await counts()).payloads).toBe(size.n);
    }
    expect((await counts()).runs).toBe(2);
    expect(
      (
        await fixture().db.query<{ n: number }>(
          "select count(*)::int n from source_observations o join source_check_runs r on r.id=o.run_id where r.source_key='storage-bounded'",
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await fixture().db.query<{ n: number }>(
          'select count(*)::int n from source_check_staging',
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await fixture().db.query<{ n: number }>(
          "select count(*)::int n from source_check_runs where source_key='storage-bounded'",
        )
      ).rows[0].n,
    ).toBe(5);
    // A lost response can still be recovered after the temporary snapshot expires.
    expect((await runSourceCheck(request, fixture().database)).status).toBe(
      'shadow',
    );
    await expect(
      fixture().rpc('source_provenance_backfill', {
        actor: owner,
        check_id: request.runId,
      }),
    ).rejects.toThrow('snapshot expired');
  }, 60000);
  it('losslessly compacts pre-upgrade duplicates and leaves accepted and undo observations pinned', async () => {
    const request = {
      ...fixture().input('legacy-packed'),
      sourceKey: 'storage-legacy',
    };
    const raw = {
      ...request.observations[0],
      identity: '["file","buildings","legacy-packed"]',
      recordCount: 1,
    };
    delete (raw as Partial<typeof raw>).records;
    const record = request.observations[0].records[0];
    await fixture().rpc('source_check_begin', {
      run_id: request.runId,
      run_token: request.token,
      source_identity: request.sourceKey,
      check_receipt: request.receipt,
    });
    await fixture().db.query(
      "insert into source_check_staging values($1,'observation',0,$2),($1,'record',0,$3)",
      [
        request.runId,
        JSON.stringify(raw),
        JSON.stringify({ identity: raw.identity, record }),
      ],
    );
    await fixture().db.query(
      "insert into source_observations values($1,'lasu',$2,$3)",
      [request.runId, raw.identity, JSON.stringify(raw)],
    );
    await fixture().db.query(
      'insert into source_observation_records values($1,$2,$3,$4)',
      [request.runId, raw.identity, record.id, JSON.stringify(record)],
    );
    await fixture().db.query(
      "update source_check_runs set status='shadow',manifest=$2,completed_at=now() where id=$1",
      [
        request.runId,
        JSON.stringify({ observation: 1, record: 1, group: 0, member: 0 }),
      ],
    );
    const pinned = (
      await fixture().db.query(
        'select run_id,identity,value from source_observations where _source_observation_pinned(run_id,identity) order by run_id,identity',
      )
    ).rows;
    await maintainSourceEvidence(fixture().database);
    expect(
      (
        await fixture().db.query(
          "select value from _source_check_rows($1,'observation')",
          [request.runId],
        )
      ).rows,
    ).toEqual([{ value: raw }]);
    expect(
      (
        await fixture().db.query(
          "select value from _source_check_rows($1,'record')",
          [request.runId],
        )
      ).rows,
    ).toEqual([{ value: { identity: raw.identity, record } }]);
    expect(
      (
        await fixture().db.query(
          'select identity from source_observations where run_id=$1',
          [request.runId],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await fixture().db.query(
          'select run_id,identity,value from source_observations where _source_observation_pinned(run_id,identity) order by run_id,identity',
        )
      ).rows,
    ).toEqual(pinned);
  });
  it('keeps source batches immutable across overlap, retries and campus boundaries', async () => {
    const request = {
      ...fixture().input('overlap'),
      sourceKey: 'storage-overlap',
    };
    const identity = { run_id: request.runId, run_token: request.token };
    await fixture().rpc('source_check_begin', {
      ...identity,
      source_identity: request.sourceKey,
      check_receipt: request.receipt,
    });
    const batch = {
      ...identity,
      part: 'observation',
      start_offset: 0,
      records: [
        { identity: 'one', recordCount: 0 },
        { identity: 'two', recordCount: 0 },
      ],
    };
    await fixture().rpc('source_check_stage', batch);
    await fixture().rpc('source_check_stage', batch);
    await expect(
      fixture().rpc('source_check_stage', { ...batch, start_offset: 1 }),
    ).rejects.toThrow('changed on retry');
    await expect(
      fixture().rpc('source_check_stage', {
        ...batch,
        records: [{ identity: 'changed' }, batch.records[1]],
      }),
    ).rejects.toThrow('changed on retry');
    await fixture().db.exec(
      `set request.headers='{"x-turnright-campus":"unilag"}'; set role service_role;`,
    );
    await expect(fixture().rpc('source_check_stage', batch)).rejects.toThrow(
      'cancelled or replaced',
    );
    for (const name of ['source_check_payloads', 'source_check_pages'])
      await expect(fixture().db.query(`select * from ${name}`)).rejects.toThrow(
        'permission',
      );
    await expect(
      fixture().db.query("select * from _source_check_rows($1,'observation')", [
        request.runId,
      ]),
    ).rejects.toThrow('permission');
    await fixture().rpc('source_check_maintain', {});
    await fixture().db.exec("reset role; set request.headers='{}';");
    expect(
      (
        await fixture().db.query<{ n: number }>(
          "select count(*)::int n from _source_check_rows($1,'observation')",
          [request.runId],
        )
      ).rows[0].n,
    ).toBe(2);
  });
  it('can undo after raw snapshot expiry using permanently pinned before and after observations', async () => {
    const first = await fixture().enabledInput('storage-undo', 'Original');
    await runSourceCheck(first, fixture().database);
    await fixture().decide((await fixture().pending('storage-undo'))[0].id);
    const second = await fixture().enabledInput('storage-undo', 'Updated');
    await runSourceCheck(second, fixture().database);
    const group = (await fixture().pending('storage-undo'))[0].id;
    await fixture().decide(group);
    const decision = (
      await fixture().db.query<{ id: string }>(
        'select id from source_decision_receipts where group_id=$1',
        [group],
      )
    ).rows[0].id;
    for (let i = 0; i < 3; i++)
      await runSourceCheck(
        await fixture().enabledInput('storage-undo', 'Updated'),
        fixture().database,
      );
    expect(
      (
        await fixture().db.query(
          "select evidence_retention->>'rawSnapshot' state from source_check_runs where id in ($1,$2)",
          [first.runId, second.runId],
        )
      ).rows,
    ).toEqual([{ state: 'expired' }, { state: 'expired' }]);
    expect(
      (
        await fixture().rpc('source_undo_preview', {
          actor: owner,
          decision_id: decision,
        })
      ).eligible,
    ).toBe(true);
    await fixture().rpc('source_undo_confirm', {
      actor: owner,
      decision_id: decision,
      reversal_id: randomUUID(),
    });
    expect(
      (
        await fixture().db.query<{ name: string }>(
          "select payload#>>'{properties,name}' name from source_features where id='feature:storage-undo'",
        )
      ).rows[0].name,
    ).toBe('Original');
    expect(
      (
        await fixture().db.query<{ run_id: string }>(
          "select run_id from source_accepted_observations where source_key='storage-undo'",
        )
      ).rows[0].run_id,
    ).toBe(first.runId);
  });
}
