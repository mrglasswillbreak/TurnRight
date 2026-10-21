import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { owner, editor } from './gis-database-fixture';
import type { SourceFixtureRecord } from './source-fixture-types';
import { runSourceCheck } from '../../scripts/source-check-worker.mjs';
import { hash } from '../../scripts/cloud.mjs';
import type { SourceReliabilityDatabaseFixture } from './source-reliability-database.test';
export function registerDecisions(
  fixture: () => SourceReliabilityDatabaseFixture,
): void {
  it('applies a whole routing group atomically and protects shared nodes and explicit connections', async () => {
    const request = await fixture().enabledInput('routing');
    const record = (
      entity: string,
      id: string,
      payload: SourceFixtureRecord['payload'],
    ) => ({
      id: entity + ':' + id,
      entity,
      source: 'routing',
      payload,
      hash: hash(payload),
    });
    request.observations[0].records.push(
      record('node', 'start', { id: 'start', coordinates: [3, 6] }),
      record('node', 'end', { id: 'end', coordinates: [3.1, 6] }),
      record('edge', 'route', {
        id: 'route',
        sourceId: 'routing',
        from: 'start',
        to: 'end',
      }),
    );
    await runSourceCheck(request, fixture().database);
    const initial = (await fixture().pending('routing'))[0];
    await fixture().decide(initial.id);
    await fixture().db.exec(
      'insert into source_features(id,entity,source,payload,hash) values (\'edge:shared\',\'edge\',\'other\',\'{"id":"shared","from":"start","to":"end"}\',\'shared\')',
    );
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
    const group = (await fixture().pending('routing'))[0];
    await expect(fixture().decide(group.id)).rejects.toThrow(
      'Routing dependencies',
    );
    expect(
      (
        await fixture().db.query<{ n: number }>(
          "select count(*)::int n from source_features where id in ('edge:route','node:start','node:end','feature:routing')",
        )
      ).rows[0].n,
    ).toBe(4);
    await fixture().db.exec(
      'delete from source_features where id=\'edge:shared\'; insert into map_edits(id,kind,geometry,properties) values(\'explicit\',\'path\',\'{"type":"LineString","coordinates":[[3,6],[3.1,6]]}\',\'{"connection":"route"}\')',
    );
    await expect(fixture().decide(group.id)).rejects.toThrow(
      'protected connection',
    );
    await fixture().db.exec("delete from map_edits where id='explicit'");
    await fixture().decide(group.id);
    expect(
      (
        await fixture().db.query<{ n: number }>(
          "select count(*)::int n from source_features where source='routing'",
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it('supports descriptive-field review and audited undo without changing the raw observation', async () => {
    const request = await fixture().enabledInput('fields');
    await runSourceCheck(request, fixture().database);
    await fixture().decide((await fixture().pending('fields'))[0].id);
    await runSourceCheck(
      await fixture().enabledInput('fields', 'Second'),
      fixture().database,
    );
    const group = (await fixture().pending('fields'))[0];
    const before = group.before,
      after = group.after;
    const reviewed = {
      ...before,
      payload: {
        ...before.payload,
        properties: { ...before.payload.properties, name: 'Second' },
      },
    };
    reviewed.hash = hash(reviewed.payload);
    await expect(
      fixture().db.query('select review_map_fields($1,$2,$3,$4,$5,$6)', [
        group.id,
        JSON.stringify(before),
        JSON.stringify(after),
        JSON.stringify(reviewed),
        '["properties.name"]',
        owner,
      ]),
    ).rejects.toThrow('revision');
    await fixture().rpc('review_map_fields', {
      change_id: group.id,
      expected_before: before,
      expected_after: after,
      reviewed_record: reviewed,
      selected_fields: ['properties.name'],
      actor_id: owner,
    });
    const accepted = (
      await fixture().db.query(
        "select o.value,a.record_overrides from source_accepted_observations a join source_observations o on o.run_id=a.run_id and o.identity=a.identity where a.source_key='fields'",
      )
    ).rows[0] as {
      value: { content: { name: string } };
      record_overrides: Record<
        string,
        { payload: { properties: { name: string } } }
      >;
    };
    expect(accepted.value.content.name).toBe('First');
    expect(
      accepted.record_overrides['feature:fields'].payload.properties.name,
    ).toBe('Second');
    const d = (
      await fixture().db.query<{ id: string }>(
        "select id from source_decision_receipts where group_id=$1 and evidence ? 'fields'",
        [group.id],
      )
    ).rows[0];
    await fixture().rpc('source_undo_confirm', {
      actor: owner,
      decision_id: d.id,
      reversal_id: randomUUID(),
    });
    expect(
      (
        await fixture().db.query<{ name: string }>(
          "select payload#>>'{properties,name}' name from source_features where id='feature:fields'",
        )
      ).rows[0].name,
    ).toBe('First');
  });
  it('blocks cancelled and permission-revoked imports before finalization', async () => {
    const source = randomUUID(),
      job = randomUUID(),
      token = randomUUID(),
      run = randomUUID();
    await fixture().db.query(
      "insert into campus_sources(id,name,kind) values($1,'permission test','file')",
      [source],
    );
    await fixture().db.query(
      "insert into campus_imports(id,source_id,configuration,run_token,status,requested_by) values($1,$2,'{}',$3,'preview',$4)",
      [job, source, token, editor],
    );
    await fixture().rpc('source_check_begin', {
      run_id: run,
      run_token: token,
      source_identity: 'import:' + source,
      check_receipt: fixture().input('x').receipt,
      import_identity: job,
    });
    await fixture().db.query(
      'delete from campus_memberships where user_id=$1',
      [editor],
    );
    await expect(
      fixture().rpc('source_check_finish', {
        run_id: run,
        run_token: token,
        counts: { observation: 0, record: 0, group: 0, member: 0 },
      }),
    ).rejects.toThrow('permission revoked');
    await fixture().db.query(
      "insert into campus_memberships values ('lasu',$1,array['editor'])",
      [editor],
    );
    await fixture().db.query(
      "update campus_imports set status='cancelled' where id=$1",
      [job],
    );
    await expect(
      fixture().rpc('source_check_finish', {
        run_id: run,
        run_token: token,
        counts: { observation: 0, record: 0, group: 0, member: 0 },
      }),
    ).rejects.toThrow('cancelled');
  });
  it('audits legacy provenance without replacing the map or creating acceptance', async () => {
    const request = {
      ...fixture().input('provenance'),
      sourceKey: 'audit-only',
    };
    await runSourceCheck(request, fixture().database);
    const before = (
      await fixture().db.query<{ n: number }>(
        'select count(*)::int n from source_features',
      )
    ).rows[0].n;
    const audit = await fixture().rpc('source_provenance_backfill', {
      actor: owner,
      check_id: request.runId,
    });
    expect(audit.recovered).toBe(0);
    expect(audit.findings[0].recoverable).toBe(false);
    expect(
      (
        await fixture().db.query<{ n: number }>(
          'select count(*)::int n from source_features',
        )
      ).rows[0].n,
    ).toBe(before);
  });
  it('requires the displayed revision on every group decision and rejects direct legacy writes', async () => {
    await runSourceCheck(
      await fixture().enabledInput('revision-guard'),
      fixture().database,
    );
    const group = (await fixture().pending('revision-guard'))[0];
    const revision = (
      await fixture().db.query<{ review_revision: number }>(
        'select review_revision from map_changes where id=$1',
        [group.id],
      )
    ).rows[0].review_revision;
    await expect(
      fixture().db.query('select team_review_source($1,$2,true)', [
        owner,
        group.id,
      ]),
    ).rejects.toThrow('revision');
    await expect(
      fixture().rpc('review_map_change', {
        change_id: group.id,
        accept_change: true,
      }),
    ).rejects.toThrow('revision');
    await expect(
      fixture().rpc('team_review_source', {
        actor: owner,
        change_identity: group.id,
        accept: true,
        expected_revision: revision + 1,
      }),
    ).rejects.toThrow('revision');
    await expect(
      fixture().db.query(
        "update map_changes set status='accepted' where id=$1",
        [group.id],
      ),
    ).rejects.toThrow('guarded decision');
    await expect(
      fixture().db.query(
        "update map_changes set status='superseded' where id=$1",
        [group.id],
      ),
    ).rejects.toThrow('finalizer');
    const operation = randomUUID();
    await fixture().rpc('source_review_prepare', {
      actor_id: owner,
      operation_id: operation,
      selection: {
        mode: 'ids',
        accept: true,
        items: [{ id: group.id, revision }],
      },
    });
    const started = await fixture().rpc('source_review_control', {
      actor_id: owner,
      operation_id: operation,
      command: 'start',
      decision: true,
    });
    const done = await fixture().rpc('source_review_step', {
      operation_id: operation,
      token: started.run_token,
    });
    expect(done).toMatchObject({ status: 'completed', applied: 1, failed: 0 });
  });
  it('can review a recurring change after audited undo while retaining the earlier decisions', async () => {
    await runSourceCheck(
      await fixture().enabledInput('undo-recurs'),
      fixture().database,
    );
    await fixture().decide((await fixture().pending('undo-recurs'))[0].id);
    await runSourceCheck(
      await fixture().enabledInput('undo-recurs', 'Second'),
      fixture().database,
    );
    const id = (await fixture().pending('undo-recurs'))[0].id;
    await fixture().decide(id);
    const decision = (
      await fixture().db.query<{ id: string }>(
        'select id from source_decision_receipts where group_id=$1',
        [id],
      )
    ).rows[0].id;
    await fixture().rpc('source_undo_confirm', {
      actor: owner,
      decision_id: decision,
      reversal_id: randomUUID(),
    });
    await runSourceCheck(
      await fixture().enabledInput('undo-recurs', 'Second'),
      fixture().database,
    );
    expect((await fixture().pending('undo-recurs')).map((g) => g.id)).toEqual([
      id,
    ]);
    await fixture().decide(id);
    expect(
      (
        await fixture().db.query(
          'select id from source_decision_receipts where group_id=$1',
          [id],
        )
      ).rows,
    ).toHaveLength(3);
  });
  it('database graph guards roll back a missing arrival even if a worker mislabels eligibility', async () => {
    const request = await fixture().enabledInput('missing-arrival');
    request.observations[0].records = [
      {
        id: 'place:missing-arrival',
        entity: 'place',
        source: 'test-source',
        hash: 'missing-arrival',
        payload: {
          id: 'missing-arrival',
          name: 'Entrance',
          coordinates: [3, 6],
          graphNode: 'missing-node',
        },
      },
    ];
    await runSourceCheck(request, fixture().database);
    const group = (await fixture().pending('missing-arrival'))[0];
    await fixture().db.query(
      "update source_proposal_groups set eligible=true,blocking_reasons='[]' where id=$1",
      [group.id],
    );
    await expect(fixture().decide(group.id)).rejects.toThrow(
      'arrival connection',
    );
    expect(
      (
        await fixture().db.query(
          "select id from source_features where id='place:missing-arrival'",
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await fixture().db.query(
          'select id from source_decision_receipts where group_id=$1',
          [group.id],
        )
      ).rows,
    ).toHaveLength(0);
  });
}
