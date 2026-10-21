import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { owner, editor, reviewer, publisher } from './gis-database-fixture';
import type { GisDatabaseFixture } from './gis-database.test';
export function registerDatasetIntegrity(
  fixture: () => GisDatabaseFixture,
): void {
  it('pins job revisions and refuses late completion after cancellation or revocation', async () => {
    const d = (
      await fixture().db.query<{ revision: number }>(
        "select revision from gis_datasets where campus_id='lasu' and id='gis-test'",
      )
    ).rows[0];
    const id = randomUUID(),
      request = {
        operationId: id,
        tool: 'buffer',
        name: 'Buffer result',
        input: { datasetId: 'gis-test', revision: Number(d.revision) },
        parameters: { distance: 10 },
      };
    await fixture().db.query('select gis_start_job($1,$2)', [
      editor,
      JSON.stringify(request),
    ]);
    const claimed = (
      await fixture().db.query<{ j: { run_token: string } }>(
        'select gis_claim_job($1) j',
        [id],
      )
    ).rows[0].j;
    await fixture().db.query('select gis_cancel_job($1,$2)', [editor, id]);
    expect(
      (
        await fixture().db.query('select gis_finish_job($1,$2,$3) ok', [
          id,
          claimed.run_token,
          '{}',
        ])
      ).rows[0],
    ).toEqual({ ok: false });
    await expect(
      fixture().db.query('select gis_apply_job($1,$2)', [editor, id]),
    ).rejects.toThrow(/applicable/);
    const next = randomUUID();
    await fixture().db.query('select gis_start_job($1,$2)', [
      editor,
      JSON.stringify({ ...request, operationId: next }),
    ]);
    await fixture().db.query('select save_campus_member($1,$2,$3,$4)', [
      owner,
      editor,
      [],
      randomUUID(),
    ]);
    await expect(
      fixture().db.query('select gis_claim_job($1)', [next]),
    ).rejects.toThrow(/access/);
    await fixture().db.query('select save_campus_member($1,$2,$3,$4)', [
      owner,
      editor,
      ['editor'],
      randomUUID(),
    ]);
  });
  it('queries 100,000 indexed features with bounded pages and an indexed spatial extent', async () => {
    await fixture().db.exec(
      'insert into gis_datasets(campus_id,id,name,schema) values(\'lasu\',\'scale-test\',\'100,000 trees\',\'{"version":1,"fields":[{"name":"height","type":"number"}]}\')',
    );
    await fixture().db.exec(
      "insert into gis_feature_index(campus_id,dataset_id,feature_key,geometry,properties) select 'lasu','scale-test','overlay:scale:'||lpad(i::text,6,'0'),extensions.ST_SetSRID(extensions.ST_MakePoint(3.2+(i%1000)*0.00001,6.46+(i/1000)*0.00001),4326),jsonb_build_object('height',i%50) from generate_series(1,100000) i",
    );
    const result = (
      await fixture().db.query<{
        page: { total: number; features: unknown[]; nextCursor: string };
      }>('select gis_query($1,$2) page', [
        editor,
        JSON.stringify({
          datasetId: 'scale-test',
          limit: 100,
          bbox: [3.201, 6.4601, 3.202, 6.4603],
        }),
      ])
    ).rows[0].page;
    expect(result.total).toBeGreaterThan(100);
    expect(result.total).toBeLessThan(100000);
    expect(result.features).toHaveLength(100);
    expect(result.nextCursor).toBeTruthy();
    expect(JSON.stringify(result).length).toBeLessThan(100000);
    await fixture().db.exec(
      "delete from gis_feature_index where dataset_id='scale-test';delete from gis_datasets where id='scale-test'",
    );
  }, 120000);
  it('retains inferred types when imported field metadata has no declaration', async () => {
    await fixture().db.query(
      "update source_features set gis_metadata=$1,private_attributes=private_attributes||$2::jsonb where id='gis-source:0'",
      [
        JSON.stringify({
          fields: [
            { name: 'OBJECTID' },
            { name: 'enabled' },
            { name: 'oid', type: 'esriFieldTypeOID' },
            { name: 'large_id', type: 'int64' },
            { name: 'inspected', type: 'Date' },
            { name: 'asset_code', type: 'String' },
          ],
        }),
        JSON.stringify({
          OBJECTID: 47,
          enabled: true,
          oid: null,
          large_id: null,
          inspected: null,
        }),
      ],
    );
    const fields = (
      await fixture().db.query<{
        fields: { name: string; type: string; public: boolean }[];
      }>("select schema->'fields' fields from gis_datasets where id='gis-test'")
    ).rows[0].fields;
    for (const [name, type] of Object.entries({
      OBJECTID: 'number',
      enabled: 'boolean',
      oid: 'number',
      large_id: 'number',
      inspected: 'date',
      asset_code: 'text',
    }))
      expect(fields.find((field) => field.name === name)).toMatchObject({
        type,
        public: false,
      });
    await fixture().db.exec(
      "select gis_validate_values(d.schema,i.properties) from gis_feature_index i join gis_datasets d on d.campus_id=i.campus_id and d.id=i.dataset_id where i.feature_key='land:gis-test-0'",
    );
  });
  it('freezes corrected historical geometry and retains source metadata on reindex', async () => {
    await fixture().db.query(
      "update source_features set gis_metadata=$1,private_attributes=private_attributes||$2::jsonb where id='gis-source:0'",
      [
        JSON.stringify({
          sourceCRS: 'EPSG:32631',
          fields: [{ name: 'inspected', type: 'Date', alias: 'Observed on' }],
        }),
        JSON.stringify({ late_field: 'Preserved', inspected: null }),
      ],
    );
    const dataset = (
      await fixture().db.query<{
        source_crs: string;
        schema: { fields: { name: string; type: string; alias?: string }[] };
      }>("select source_crs,schema from gis_datasets where id='gis-test'")
    ).rows[0];
    expect(dataset.source_crs).toBe('EPSG:32631');
    expect(dataset.schema.fields.map((f) => f.name)).toEqual(
      expect.arrayContaining(['late_field', 'inspected']),
    );
    expect(
      dataset.schema.fields.find((f) => f.name === 'inspected'),
    ).toMatchObject({ type: 'date', alias: 'Observed on' });
    const configured = (
      await fixture().db.query<{ d: import('../src/gis-types').Dataset }>(
        "select to_jsonb(d) d from gis_datasets d where id='gis-test'",
      )
    ).rows[0].d;
    configured.schema.fields.find((f) => f.name === 'inspected')!.alias =
      'Team observation date';
    await fixture().db.query('select gis_save_dataset($1,$2,$3,$4)', [
      editor,
      JSON.stringify(configured),
      configured.revision,
      randomUUID(),
    ]);
    await fixture().db.exec(
      "update source_features set gis_metadata=gis_metadata where id='gis-source:0'",
    );
    expect(
      (
        await fixture().db.query<{
          fields: { name: string; alias?: string }[];
        }>(
          "select schema->'fields' fields from gis_datasets where id='gis-test'",
        )
      ).rows[0].fields.find((f) => f.name === 'inspected')?.alias,
    ).toBe('Team observation date');
    const snapshot = (
      await fixture().db.query<{
        s: { features: unknown[]; edits: unknown[]; datasets: unknown[] };
      }>('select gis_workspace_snapshot() s')
    ).rows[0].s;
    snapshot.edits = [
      {
        id: 'gis-test-0',
        kind: 'land',
        geometry: { type: 'Point', coordinates: [3.215, 6.465] },
        properties: { name: 'Corrected tree' },
        deleted: false,
      },
    ];
    const historical = (
      await fixture().db.query<{ id: string }>(
        "insert into releases(status,summary,snapshot) values('published','Historical correction',$1) returning id",
        [JSON.stringify(snapshot)],
      )
    ).rows[0].id;
    const review = randomUUID();
    await fixture().db.query('select gis_submit_restore($1,$2,$3,$4)', [
      publisher,
      review,
      historical,
      'Restore the corrected historical map',
    ]);
    const page = (
      await fixture().db.query<{
        p: {
          features: {
            id: string;
            geometry: { coordinates: number[] };
            properties: Record<string, unknown>;
          }[];
        };
      }>('select gis_review_query($1,$2,$3) p', [reviewer, review, 'gis-test'])
    ).rows[0].p;
    const feature = page.features.find((f) => f.id === 'land:gis-test-0')!;
    expect(feature.geometry.coordinates).toEqual([3.215, 6.465]);
    expect(feature.properties.name).toBe('Corrected tree');
    expect(feature.properties.late_field).toBe('Preserved');
    const hydrated = (
      await fixture().db.query<{ r: { features: unknown[] } }>(
        'select gis_hydrate_editor($1,$2) r',
        [editor, JSON.stringify(['land:gis-test-0'])],
      )
    ).rows[0].r;
    expect(hydrated.features).toHaveLength(1);
    await expect(
      fixture().db.query('select gis_hydrate_editor($1,$2)', [
        editor,
        JSON.stringify(Array(501).fill('land:gis-test-0')),
      ]),
    ).rejects.toThrow(/500/);
  });
  it('shares attached approved photos while keeping unfinished and unattached uploads personal', async () => {
    const attached = randomUUID(),
      pending = randomUUID(),
      unattached = randomUUID();
    for (const [id, status] of [
      [attached, 'approved'],
      [pending, 'pending'],
      [unattached, 'approved'],
    ])
      await fixture().db.query(
        "insert into building_media(id,owner,status,original_path,public_metadata,draft_metadata,reviewed_at,derivative_path) values($1,$2,$3,$4,$5,$6,now(),'verified.webp')",
        [
          id,
          editor,
          status,
          editor + '/' + id + '/original',
          JSON.stringify({ caption: 'Verified campus evidence' }),
          JSON.stringify({ caption: 'Personal unfinished details' }),
        ],
      );
    await fixture().db.query(
      "insert into source_features(id,entity,source,payload,hash) values($1,'meta','test',$2,'photo-source')",
      [
        'meta:shared-photo',
        JSON.stringify({ photos: [{ id: 'owner:' + attached }] }),
      ],
    );
    const library = (
      await fixture().db.query<{
        items: { id: string; draft_metadata: unknown }[];
      }>('select gis_media_library($1,$2,0) items', [reviewer, ''])
    ).rows[0].items;
    expect(library.map((p) => p.id)).toEqual([attached]);
    expect(library[0].draft_metadata).toBeNull();
    expect(JSON.stringify(library)).not.toContain('/original');
    const mine = (
      await fixture().db.query<{ items: unknown[] }>(
        'select gis_media_library($1,$2,0) items',
        [editor, ''],
      )
    ).rows[0].items;
    expect(mine).toHaveLength(3);
    await fixture().db.query('select gis_submit_review($1,$2,$3)', [
      editor,
      randomUUID(),
      'Retain verified photographic evidence',
    ]);
    await fixture().db.exec(
      "delete from source_features where id='meta:shared-photo'",
    );
    expect(
      (
        await fixture().db.query<{ attached: boolean }>(
          "select gis_asset_attached($1,'photo') attached",
          [attached],
        )
      ).rows[0].attached,
    ).toBe(true);
    expect(
      (
        await fixture().db.query<{ attached: boolean }>(
          "select gis_asset_attached($1,'photo') attached",
          [pending],
        )
      ).rows[0].attached,
    ).toBe(false);
  });
  it('enforces canonical dates, nulls and coded types at the database boundary', async () => {
    const schema = JSON.stringify({
      version: 1,
      fields: [
        { name: 'observed', type: 'date' },
        { name: 'height', type: 'number', required: true },
        { name: 'condition', type: 'text', domain: ['good', 'poor'] },
      ],
    });
    const validate = (values: object) =>
      fixture().db.query('select gis_validate_values($1,$2)', [
        schema,
        JSON.stringify(values),
      ]);
    await validate({ observed: '2024-02-29', height: 0, condition: null });
    await validate({
      observed: '2026-10-05T10:30:00.123Z',
      height: 1,
      condition: 'good',
    });
    for (const observed of [
      '2026-02-29',
      '2026-13-01',
      'infinity',
      '2026-10-05T24:00:00Z',
    ])
      await expect(validate({ observed, height: 1 })).rejects.toThrow(/date/);
    await expect(validate({ height: null })).rejects.toThrow(/Required/);
    await expect(validate({ height: '' })).rejects.toThrow(/type/);
    await expect(validate({ height: 1, condition: 'unknown' })).rejects.toThrow(
      /domain/,
    );
  });
}
