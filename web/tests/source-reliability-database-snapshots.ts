import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { owner, reviewer } from './gis-database-fixture';
import { runSourceCheck } from '../../scripts/source-check-worker.mjs';
import type { SourceReliabilityDatabaseFixture } from './source-reliability-database.test';
export function registerSnapshots(
  fixture: () => SourceReliabilityDatabaseFixture,
): void {
  it('loads empty check and decision history before the first source decision', async () => {
    expect(
      await fixture().rpc('source_check_detail', { actor: owner }),
    ).toEqual({
      checks: [],
    });
    expect(
      await fixture().rpc('source_decision_history', { actor: owner }),
    ).toEqual({
      decisions: [],
      legacyFindings: [],
    });
  });
  it('shadows first, stages bounded data, and only advances accepted observations on acceptance', async () => {
    expect(
      (await runSourceCheck(fixture().input('shadow'), fixture().database))
        .status,
    ).toBe('shadow');
    expect(
      (
        await fixture().db.query<{ n: number }>(
          'select count(*)::int n from map_changes',
        )
      ).rows[0].n,
    ).toBe(0);
    await fixture().db.exec(
      "insert into source_check_policy values ('lasu','test-source',true)",
    );
    const request = fixture().input('one');
    expect((await runSourceCheck(request, fixture().database)).status).toBe(
      'complete',
    );
    expect((await runSourceCheck(request, fixture().database)).status).toBe(
      'complete',
    );
    expect(
      (
        await fixture().db.query<{ n: number }>(
          'select count(*)::int n from source_accepted_observations',
        )
      ).rows[0].n,
    ).toBe(0);
    const { id } = (
      await fixture().db.query<{ id: string }>('select id from map_changes')
    ).rows[0];
    await fixture().rpc('team_review_source', {
      actor: owner,
      change_identity: id,
      accept: true,
    });
    expect(
      (
        await fixture().db.query<{ n: number }>(
          'select count(*)::int n from source_accepted_observations',
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await fixture().db.query<{ n: number }>(
          'select count(*)::int n from source_feature_lineage',
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await fixture().db.query<{ n: number }>(
          'select count(*)::int n from releases',
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it('history returns the decision actor rather than the caller and filters by group', async () => {
    const history = await fixture().rpc('source_decision_history', {
      actor: reviewer,
    });
    expect(history.decisions).toHaveLength(1);
    expect(history.decisions[0]).toMatchObject({
      actor: owner,
      outcome: 'accepted',
    });
    expect(
      await fixture().rpc('source_decision_history', {
        actor: reviewer,
        change_id: history.decisions[0].group_id,
      }),
    ).toEqual(history);
    expect(
      (
        await fixture().rpc('source_decision_history', {
          actor: reviewer,
          change_id: 'another-group',
        })
      ).decisions,
    ).toEqual([]);
    await expect(
      fixture().rpc('source_decision_history', { actor: randomUUID() }),
    ).rejects.toThrow('Campus access required');
  });
  it('prevents old single, bulk, and private helper removal bypasses', async () => {
    await fixture().db.exec(
      "insert into map_changes(id,source_id,kind,before,base_hash,summary) select 'unsafe',id,'remove',to_jsonb(s),hash,'Old deletion' from source_features s limit 1",
    );
    await expect(
      fixture().rpc('review_map_change', {
        change_id: 'unsafe',
        accept_change: true,
      }),
    ).rejects.toThrow('blocked');
    await expect(
      fixture().rpc('team_review_source', {
        actor: owner,
        change_identity: 'unsafe',
        accept: true,
      }),
    ).rejects.toThrow('blocked');
    const prepared = await fixture().rpc('source_review_prepare', {
      actor_id: owner,
      operation_id: randomUUID(),
      selection: { mode: 'filter', filters: {}, accept: true },
    });
    expect(prepared.total).toBe(0);
    expect(prepared.breakdown.excluded).toBe(1);
    await fixture().db.exec('set role service_role');
    await expect(
      fixture().rpc('_legacy_review_map_change', {
        change_id: 'unsafe',
        accept_change: true,
      }),
    ).rejects.toThrow('permission');
    await fixture().db.exec('reset role');
  });
  it('undo previews later edits, records idempotent reversals, and preserves editor corrections', async () => {
    await runSourceCheck(
      fixture().input('one', 'New name'),
      fixture().database,
    );
    const { id } = (
      await fixture().db.query<{ id: string }>(
        "select id from map_changes where id<>'unsafe' and status='pending'",
      )
    ).rows[0];
    await fixture().rpc('team_review_source', {
      actor: owner,
      change_identity: id,
      accept: true,
    });
    const { id: decision } = (
      await fixture().db.query<{ id: string }>(
        'select id from source_decision_receipts where group_id=$1',
        [id],
      )
    ).rows[0];
    await fixture().db.exec(
      'insert into map_edits(id,kind,geometry,properties) values(\'one\',\'building\',\'{"type":"Point","coordinates":[3,6]}\',\'{"name":"Owner correction"}\')',
    );
    const preview = await fixture().rpc('source_undo_preview', {
      actor: owner,
      decision_id: decision,
    });
    expect(preview.eligible).toBe(true);
    await expect(
      fixture().rpc('source_undo_preview', {
        actor: reviewer,
        decision_id: decision,
      }),
    ).rejects.toThrow('permission');
    const reversal = randomUUID();
    const result = await fixture().rpc('source_undo_confirm', {
      actor: owner,
      decision_id: decision,
      reversal_id: reversal,
    });
    expect(
      await fixture().rpc('source_undo_confirm', {
        actor: owner,
        decision_id: decision,
        reversal_id: reversal,
      }),
    ).toEqual(result);
    expect(
      (
        await fixture().db.query<{ name: string }>(
          "select properties->>'name' name from map_edits where id='one'",
        )
      ).rows[0].name,
    ).toBe('Owner correction');
    expect(
      (
        await fixture().db.query<{ name: string }>(
          "select payload#>>'{properties,name}' name from source_features where id='feature:one'",
        )
      ).rows[0].name,
    ).toBe('Library');
    expect(
      (
        await fixture().db.query<{ n: number }>(
          'select count(*)::int n from releases',
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it('rejects stale baseline, altered retries and cross-campus checks', async () => {
    const request = fixture().input('stale');
    await fixture().rpc('source_check_begin', {
      run_id: request.runId,
      run_token: request.token,
      source_identity: request.sourceKey,
      check_receipt: request.receipt,
    });
    await fixture().db.exec(
      "update source_features set hash='later' where id='feature:one'",
    );
    await expect(
      fixture().rpc('source_check_baseline', {
        run_id: request.runId,
        run_token: request.token,
        part: 'records',
      }),
    ).rejects.toThrow('changed');
    await expect(
      fixture().rpc('source_check_begin', {
        run_id: request.runId,
        run_token: randomUUID(),
        source_identity: request.sourceKey,
        check_receipt: request.receipt,
      }),
    ).rejects.toThrow('already used');
    await fixture().db.exec(
      `select set_config('request.headers','{"x-turnright-campus":"other"}',false)`,
    );
    await expect(
      fixture().rpc('source_check_baseline', {
        run_id: request.runId,
        run_token: request.token,
        part: 'records',
      }),
    ).rejects.toThrow('replaced');
    await fixture().db.exec("select set_config('request.headers','{}',false)");
  });
  it('resumes lost staging and finalization responses without duplicate groups or decisions', async () => {
    const request = await fixture().enabledInput('resume');
    let interrupted = false;
    await expect(
      runSourceCheck(
        request,
        async (
          route: string,
          method: string | undefined,
          args: Record<string, unknown>,
        ) => {
          const result = await fixture().database(route, method, args);
          if (route === 'rpc/source_check_stage' && !interrupted) {
            interrupted = true;
            throw new Error('response lost');
          }
          return result;
        },
      ),
    ).rejects.toThrow('response lost');
    expect(await fixture().pending('resume')).toHaveLength(0);
    expect((await runSourceCheck(request, fixture().database)).status).toBe(
      'complete',
    );
    expect((await runSourceCheck(request, fixture().database)).status).toBe(
      'complete',
    );
    const groups = await fixture().pending('resume');
    expect(groups).toHaveLength(1);
    await fixture().decide(groups[0].id);
    await expect(fixture().decide(groups[0].id)).rejects.toThrow(
      'revision changed',
    );
    expect(
      (
        await fixture().db.query<{ n: number }>(
          'select count(*)::int n from source_decision_receipts where group_id=$1',
          [groups[0].id],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('retains rejections, reopens recurring superseded changes, and isolates incomplete collections', async () => {
    const request = await fixture().enabledInput('history');
    await runSourceCheck(request, fixture().database);
    const rejected = (await fixture().pending('history'))[0];
    await fixture().decide(rejected.id, false);
    await runSourceCheck(
      { ...request, runId: randomUUID(), token: randomUUID() },
      fixture().database,
    );
    expect(await fixture().pending('history')).toHaveLength(0);
    const changed = { ...(await fixture().enabledInput('history', 'Changed')) };
    await runSourceCheck(changed, fixture().database);
    const recurring = (await fixture().pending('history'))[0];
    expect(recurring.id).not.toBe(rejected.id);
    await runSourceCheck(
      {
        ...changed,
        runId: randomUUID(),
        token: randomUUID(),
        observations: [],
        receipt: {
          ...changed.receipt,
          collections: [{ identity: 'buildings', complete: false, count: 0 }],
        },
      },
      fixture().database,
    );
    expect((await fixture().pending('history'))[0].id).toBe(recurring.id);
    await runSourceCheck(
      {
        ...changed,
        runId: randomUUID(),
        token: randomUUID(),
        observations: [],
      },
      fixture().database,
    );
    expect(await fixture().pending('history')).toHaveLength(0);
    await runSourceCheck(
      { ...changed, runId: randomUUID(), token: randomUUID() },
      fixture().database,
    );
    expect((await fixture().pending('history'))[0].id).toBe(recurring.id);
    expect(
      (
        await fixture().db.query<{ status: string }>(
          'select status from map_changes where id=$1',
          [rejected.id],
        )
      ).rows[0].status,
    ).toBe('rejected');
  });
  it('requires complete replacement evidence and preserves later overrides during removal and undo', async () => {
    const request = await fixture().enabledInput('removal');
    await runSourceCheck(request, fixture().database);
    await fixture().decide((await fixture().pending('removal'))[0].id);
    await runSourceCheck(
      {
        ...request,
        runId: randomUUID(),
        token: randomUUID(),
        observations: [],
      },
      fixture().database,
    );
    const blocked = (await fixture().pending('removal'))[0];
    await expect(fixture().decide(blocked.id)).rejects.toThrow('blocked');
    await runSourceCheck(
      {
        ...request,
        runId: randomUUID(),
        token: randomUUID(),
        observations: [],
        completeReplacement: true,
      },
      fixture().database,
    );
    const verified = (await fixture().pending('removal'))[0];
    expect(
      (
        await fixture().rpc('source_group_eligibility', {
          change_id: verified.id,
        })
      ).eligible,
    ).toBe(true);
    await fixture().decide(verified.id);
    expect(
      (
        await fixture().db.query<{ n: number }>(
          "select count(*)::int n from source_features where id='feature:removal'",
        )
      ).rows[0].n,
    ).toBe(0);
    const d = (
      await fixture().db.query<{ id: string }>(
        "select id from source_decision_receipts where group_id=$1 and outcome='accepted'",
        [verified.id],
      )
    ).rows[0];
    await fixture().rpc('source_undo_confirm', {
      actor: owner,
      decision_id: d.id,
      reversal_id: randomUUID(),
    });
    expect(
      (
        await fixture().db.query<{ n: number }>(
          "select count(*)::int n from source_features where id='feature:removal'",
        )
      ).rows[0].n,
    ).toBe(1);
  });
}
