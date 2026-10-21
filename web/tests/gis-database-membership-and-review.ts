import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { owner, editor, reviewer, publisher } from './gis-database-fixture';
import type { GisDatabaseFixture } from './gis-database.test';
export function registerMembershipAndReview(
  fixture: () => GisDatabaseFixture,
): void {
  it('preserves canonical review hashes for nested values, Unicode and ancillary records', async () => {
    await fixture().db.exec('begin');
    try {
      await fixture().db.query(
        "insert into gis_views values('lasu',$1,$2,$3,1)",
        [
          randomUUID(),
          'Lagos – 研究',
          JSON.stringify({
            nested: { z: null, a: [true, 12.5, 'line\n"quoted"'] },
          }),
        ],
      );
      await fixture().db.query(
        "insert into gis_issues(campus_id,id,severity,code,message,comments,evidence) values('lasu',$1,'warning','hash-test',$2,$3,$4)",
        [
          randomUUID(),
          'Café / 校園',
          JSON.stringify([{ text: 'line\nnext', number: 1.25 }]),
          JSON.stringify([
            { label: 'Map', url: 'https://example.org/?a=1&b=2' },
          ]),
        ],
      );
      await fixture().expectIdenticalWorkspaceHashes();
    } finally {
      await fixture().db.exec('rollback');
    }
  });
  it('migrates with real PostGIS and backfills the existing owner', async () => {
    await fixture().expectIdenticalWorkspaceHashes();
    expect(
      (
        await fixture().db.query<{ v: string }>(
          'select extensions.postgis_version() v',
        )
      ).rows[0].v,
    ).toContain('3.');
    expect(
      (
        await fixture().db.query("select workspace_can($1,'manage') allowed", [
          owner,
        ])
      ).rows[0],
    ).toEqual({ allowed: true });
    expect(
      (
        await fixture().db.query("select workspace_can($1,'publish') allowed", [
          editor,
        ])
      ).rows[0],
    ).toEqual({ allowed: false });
  });
  it('indexes sources, validates atomic private attributes and rejects stale cursors', async () => {
    for (let i = 0; i < 4; i++)
      await fixture().db.query(
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
        await fixture().db.query<{
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
    await fixture().db.query('select gis_save_attributes($1,$2,$3,$4,$5)', [
      editor,
      'gis-test',
      page.revision,
      operation,
      items,
    ]);
    await fixture().db.query('select gis_save_attributes($1,$2,$3,$4,$5)', [
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
      fixture().db.query('select gis_save_attributes($1,$2,$3,$4,$5)', [
        reviewer,
        'gis-test',
        page.revision,
        randomUUID(),
        items,
      ]),
    ).rejects.toThrow(/permission/);
  });
  it('requires independent approval, invalidates stale submissions and audits owner overrides', async () => {
    await fixture().expectIdenticalWorkspaceHashes();
    const id = randomUUID();
    await fixture().db.query('select gis_submit_review($1,$2,$3)', [
      editor,
      id,
      'Review campus attributes',
    ]);
    const inspect = async () =>
      (
        await fixture().db.query<{
          details: {
            id: string;
            current: boolean;
            sourceCount: number;
            snapshot?: unknown;
          };
        }>('select gis_review_details($1,$2) details', [reviewer, id])
      ).rows[0].details;
    expect(await inspect()).toMatchObject({
      id,
      current: true,
      sourceCount: 4,
    });
    expect(await inspect()).not.toHaveProperty('snapshot');
    await expect(
      fixture().db.query('select gis_decide_review($1,$2,true,$3,false)', [
        editor,
        id,
        'Looks correct',
      ]),
    ).rejects.toThrow(/permission/);
    await fixture().db.query('select save_campus_member($1,$2,$3,$4)', [
      owner,
      editor,
      ['editor', 'reviewer'],
      randomUUID(),
    ]);
    await expect(
      fixture().db.query('select gis_decide_review($1,$2,true,$3,false)', [
        editor,
        id,
        'Looks correct',
      ]),
    ).rejects.toThrow(/contributor/);
    const decision = (
      await fixture().db.query<{ result: Record<string, unknown> }>(
        'select gis_decide_review($1,$2,true,$3,false) result',
        [reviewer, id, 'Checked the submitted changes'],
      )
    ).rows[0].result;
    const stored = (
      await fixture().db.query<{ result: Record<string, unknown> }>(
        "select to_jsonb(r)-'snapshot' result from gis_reviews r where id=$1",
        [id],
      )
    ).rows[0].result;
    expect(decision).toEqual(stored);
    expect(decision).not.toHaveProperty('snapshot');
    // Enumerate every column so adding an unprotected field cannot silently pass.
    const protectedChanges: Record<string, string> = {
      campus_id: "'another-campus'",
      id: 'gen_random_uuid()',
      summary: "'Changed summary'",
      content_hash: "'changed-hash'",
      snapshot: 'snapshot || \'{"changed":true}\'::jsonb',
      contributors: "'{}'::uuid[]",
      submitted_by: `'${owner}'`,
      created_at: "created_at + interval '1 second'",
      restore_release_id: 'gen_random_uuid()',
    };
    const columns = (
      await fixture().db.query<{ column_name: string }>(
        "select column_name from information_schema.columns where table_schema='public' and table_name='gis_reviews'",
      )
    ).rows
      .map((r) => r.column_name)
      .sort();
    expect(columns).toEqual(
      [
        ...Object.keys(protectedChanges),
        'status',
        'reviewed_by',
        'reason',
        'reviewed_at',
      ].sort(),
    );
    for (const [column, value] of Object.entries(protectedChanges))
      await expect(
        fixture().db.query(
          `update gis_reviews set ${column}=${value} where id=$1`,
          [id],
        ),
      ).rejects.toThrow('Review snapshots are immutable');
    const release = (
      await fixture().db.query<{ id: string }>(
        'select gis_prepare_release($1,$2,$3,$4) id',
        [publisher, id, 'catalogue-hash', 'Approved GIS release'],
      )
    ).rows[0].id;
    await fixture().db.query('select gis_assert_release_approval($1)', [
      release,
    ]);
    await fixture().db.query(
      "update gis_datasets set revision=revision+1 where id='gis-test'",
    );
    expect((await inspect()).current).toBe(false);
    await fixture().expectIdenticalWorkspaceHashes();
    await expect(
      fixture().db.query('select gis_assert_release_approval($1)', [release]),
    ).rejects.toThrow(/stale/);
    await fixture().db.query(
      "update releases set status='failed' where id=$1",
      [release],
    );
    const override = randomUUID();
    await fixture().db.query('select gis_submit_review($1,$2,$3)', [
      owner,
      override,
      'Owner authored submission',
    ]);
    await expect(
      fixture().db.query('select gis_decide_review($1,$2,true,$3,false)', [
        owner,
        override,
        'Inspected personally',
      ]),
    ).rejects.toThrow(/contributor/);
    await fixture().db.query('select gis_decide_review($1,$2,true,$3,true)', [
      owner,
      override,
      'Emergency correction personally verified',
    ]);
    expect(
      (
        await fixture().db.query(
          "select action from workspace_audit where subject=$1 and action='review-owner-override'",
          [override],
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      fixture().db.exec('delete from workspace_audit'),
    ).rejects.toThrow(/append-only/);
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
      await fixture().db.query<{ d: { id: string } }>(
        'select gis_import_table($1,$2,$3,$4,$5) d',
        args,
      )
    ).rows[0].d;
    await fixture().db.query('select gis_import_table($1,$2,$3,$4,$5)', args);
    const before = (
      await fixture().db.query(
        'select feature_key,properties from gis_feature_index where dataset_id=$1 order by feature_key',
        [first.id],
      )
    ).rows;
    await fixture().db.query("select gis_rebuild_index('lasu')");
    expect(
      (
        await fixture().db.query(
          'select feature_key,properties from gis_feature_index where dataset_id=$1 order by feature_key',
          [first.id],
        )
      ).rows,
    ).toEqual(before);
    await fixture().db.exec(
      "insert into campuses(id,slug,name,boundary,bounds) select 'other-campus','other-campus','Other',boundary,bounds from campuses where id='lasu'",
    );
    await fixture().db.query("select set_config('request.headers',$1,false)", [
      JSON.stringify({ 'x-turnright-campus': 'other-campus' }),
    ]);
    try {
      await expect(
        fixture().db.query('select gis_query($1,$2)', [
          editor,
          JSON.stringify({ datasetId: 'gis-test' }),
        ]),
      ).rejects.toThrow(/access/);
      expect(
        (
          await fixture().db.query(
            "select workspace_can($1,'manage') allowed",
            [owner],
          )
        ).rows[0],
      ).toEqual({ allowed: true });
    } finally {
      await fixture().db.exec(
        "select set_config('request.headers','{}',false)",
      );
    }
  });
}
