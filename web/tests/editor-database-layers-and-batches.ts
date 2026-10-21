import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { EditorDatabaseFixture } from './editor-database.test';
export function registerLayersAndBatches(
  fixture: () => EditorDatabaseFixture,
): void {
  it('saves layer membership atomically, rejects stale moves and protects metadata from old clients', async () => {
    const layer = {
      id: 'map-layer:database',
      name: 'Road surfaces',
      role: 'road-surface',
      band: 'surfaces',
      order: 0,
      editorVisible: true,
      locked: false,
      included: true,
      publishedVisible: true,
      archived: false,
      style: {},
      rules: [],
      members: ['land:surface:db'],
    };
    const layerItem = {
      edit: {
        id: layer.id,
        kind: 'layer',
        geometry: { type: 'GeometryCollection', geometries: [] },
        properties: { layerDefinition: layer },
        deleted: false,
      },
      expectedUpdatedAt: null,
    };
    const feature = {
      edit: {
        id: 'surface:db',
        kind: 'land',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [3.2, 6.46],
              [3.201, 6.46],
              [3.201, 6.461],
              [3.2, 6.46],
            ],
          ],
        },
        properties: { name: 'Surveyed road', mapLayerId: layer.id, width: 6 },
        deleted: false,
      },
      expectedUpdatedAt: null,
    };
    await expect(
      fixture().database.query('select save_editor_batch($1,$2,$3)', [
        randomUUID(),
        fixture().owner,
        JSON.stringify([layerItem]),
      ]),
    ).rejects.toThrow('Update the editor');
    const saved = await fixture().database.query<{
      result: { id: string; updated_at: string }[];
    }>('select save_editor_layer_batch($1,$2,$3) result', [
      randomUUID(),
      fixture().owner,
      JSON.stringify([layerItem, feature]),
    ]);
    await expect(
      fixture().database.query('select save_editor_layer_batch($1,$2,$3)', [
        randomUUID(),
        fixture().owner,
        JSON.stringify([layerItem]),
      ]),
    ).rejects.toThrow();
    const record = saved.rows[0].result.find((e) => e.id === feature.edit.id)!;
    await fixture().database.query('select save_editor_batch($1,$2,$3)', [
      randomUUID(),
      fixture().owner,
      JSON.stringify([
        {
          ...feature,
          expectedUpdatedAt: record.updated_at,
          edit: { ...feature.edit, properties: { name: 'Older editor name' } },
        },
      ]),
    ]);
    const kept = await fixture().database.query<{
      properties: { mapLayerId: string };
    }>('select properties from map_edits where id=$1', [feature.edit.id]);
    expect(kept.rows[0].properties.mapLayerId).toBe(layer.id);
  });
  it('applies an additive campus patch atomically with stale guards and rollback while retaining drafts', async () => {
    const campus = 'campus-patch-test';
    await fixture().database.query(
      "insert into campuses(id,slug,name,boundary,bounds) select $1,'patch-test','Patch test',boundary,bounds from campuses where id='lasu'",
      [campus],
    );
    const lasuBefore = (
      await fixture().database.query(
        "select * from source_features where campus_id='lasu' order by id",
      )
    ).rows;
    try {
      await fixture().database.query(
        "select set_config('request.headers',$1,false)",
        [JSON.stringify({ 'x-turnright-campus': campus })],
      );
      await fixture().database.exec(
        "insert into source_features(id,source,entity,payload,hash) values('meta:campus','combined','meta','{\"version\":\"old\"}','old'),('feature:keep','original','feature','{\"geometry\":{\"type\":\"Point\",\"coordinates\":[3.2,6.4]},\"properties\":{\"name\":\"Old\",\"appearance\":{\"wallColour\":\"#112233\"}}}','keep'),('feature:untouched','original','feature','{}','untouched')",
      );
      const expected = (
        await fixture().database.query(
          'select id,hash,updated_at,source,entity from source_features where campus_id=$1 order by id',
          [campus],
        )
      ).rows;
      const patches = [
        {
          id: 'meta:campus',
          source: 'combined',
          entity: 'meta',
          hash: 'new',
          payload_patch: { version: 'new' },
        },
        {
          id: 'feature:keep',
          source: 'original',
          entity: 'feature',
          hash: 'changed',
          properties_patch: { name: 'Reviewed' },
        },
        {
          id: 'feature:added',
          source: 'new-source',
          entity: 'feature',
          hash: 'added',
          payload: { properties: { kind: 'land' } },
        },
      ];
      const args = [
        fixture().owner,
        'new',
        JSON.stringify(expected),
        JSON.stringify(patches),
      ];
      const result = await fixture().database.query<{ receipt: string }>(
        'select apply_additive_source_patch($1::uuid,$2,$3::jsonb,$4::jsonb) as receipt',
        args,
      );
      const after = (
        await fixture().database.query<{ id: string; payload: unknown }>(
          'select id,payload from source_features where campus_id=$1 order by id',
          [campus],
        )
      ).rows;
      expect(after).toHaveLength(4);
      expect(after.find((r) => r.id === 'feature:keep')?.payload).toMatchObject(
        {
          geometry: { type: 'Point' },
          properties: {
            name: 'Reviewed',
            appearance: { wallColour: '#112233' },
          },
        },
      );
      expect(
        (
          await fixture().database.query<{
            before_sources: unknown[];
            after_sources: unknown[];
          }>(
            'select before_sources,after_sources from baseline_reconciliations where id=$1',
            [result.rows[0].receipt],
          )
        ).rows[0],
      ).toMatchObject({
        before_sources: expect.any(Array),
        after_sources: expect.any(Array),
      });
      await expect(
        fixture().database.query(
          'select apply_additive_source_patch($1::uuid,$2,$3::jsonb,$4::jsonb)',
          args,
        ),
      ).rejects.toThrow('baseline changed');
      const next = (
        await fixture().database.query(
          'select id,hash,updated_at,source,entity from source_features where campus_id=$1 order by id',
          [campus],
        )
      ).rows;
      await expect(
        fixture().database.query(
          'select apply_additive_source_patch($1::uuid,$2,$3::jsonb,$4::jsonb)',
          [
            fixture().owner,
            'wrong',
            JSON.stringify(next),
            JSON.stringify([patches[1]]),
          ],
        ),
      ).rejects.toThrow('version mismatch');
      expect(
        (
          await fixture().database.query(
            "select * from source_features where campus_id='lasu' order by id",
          )
        ).rows,
      ).toEqual(lasuBefore);
      expect(
        (
          await fixture().database.query(
            'select id,hash,updated_at,source,entity from source_features where campus_id=$1 order by id',
            [campus],
          )
        ).rows,
      ).toEqual(next);
    } finally {
      await fixture().database.query(
        'delete from baseline_reconciliations where campus_id=$1',
        [campus],
      );
      await fixture().database.query(
        'delete from source_features where campus_id=$1',
        [campus],
      );
      await fixture().database.query('delete from campuses where id=$1', [
        campus,
      ]);
      await fixture().database.exec(
        "select set_config('request.headers','{}',false)",
      );
    }
  });
  describe('private media migration', () => {
    it('guards authored drafts against older writers and verifies private asset ownership', async () => {
      const id = randomUUID(),
        reference = { version: 1, id, sha256: 'a'.repeat(64), bytes: 100 };
      await fixture().database.query(
        "insert into model_assets(id,owner,version,sha256,bytes,path,status) values($1,$2,1,$3,100,$4,'ready')",
        [
          id,
          fixture().owner,
          reference.sha256,
          `${fixture().owner}/${id}.json`,
        ],
      );
      await expect(
        fixture().database.query(
          'update model_assets set sha256=$2 where id=$1',
          [id, 'b'.repeat(64)],
        ),
      ).rejects.toThrow(/immutable/);
      const entry = {
        ...fixture().item('authored-building'),
        edit: {
          ...fixture().item('authored-building').edit,
          kind: 'building',
          properties: {
            name: 'Authored building',
            modelDocumentAsset: reference,
          },
        },
      };
      await expect(
        fixture().database.query(
          'select save_editor_batch($1::uuid,$2::uuid,$3::jsonb)',
          [randomUUID(), fixture().owner, JSON.stringify([entry])],
        ),
      ).rejects.toThrow(/Update the editor/);
      const result = await fixture().database.query<{
        saved: { updated_at: string }[];
      }>(
        'select save_editor_model_batch($1::uuid,$2::uuid,$3::jsonb) as saved',
        [randomUUID(), fixture().owner, JSON.stringify([entry])],
      );
      const oldWriter = {
        ...entry,
        expectedUpdatedAt: result.rows[0].saved[0].updated_at,
        edit: { ...entry.edit, properties: { name: 'Attempt to erase model' } },
      };
      await expect(
        fixture().database.query(
          'select save_editor_batch($1::uuid,$2::uuid,$3::jsonb)',
          [randomUUID(), fixture().owner, JSON.stringify([oldWriter])],
        ),
      ).rejects.toThrow(/Update the editor/);
      expect(
        (
          await fixture().database.query<{ public: boolean }>(
            "select public from storage.buckets where id='building-models'",
          )
        ).rows[0].public,
      ).toBe(false);
      expect(
        (
          await fixture().database.query<{ allowed: boolean }>(
            "select has_table_privilege('authenticated','model_assets','SELECT') as allowed",
          )
        ).rows[0].allowed,
      ).toBe(false);
    });
    it('keeps originals private and makes reviewed metadata immutable', async () => {
      const id = randomUUID();
      await fixture().database.query(
        'insert into building_media(id,owner,original_path) values($1,$2,$3)',
        [id, fixture().owner, `${fixture().owner}/${id}/original`],
      );
      await fixture().database.query(
        "update building_media set status='approved',derivative_path='approved.webp',public_metadata='{}',reviewed_at=now() where id=$1",
        [id],
      );
      await expect(
        fixture().database.query(
          "update building_media set public_metadata='{}' where id=$1",
          [id],
        ),
      ).rejects.toThrow(/immutable/);
      const access = await fixture().database.query<{ allowed: boolean }>(
        "select has_table_privilege('anon','building_media','SELECT') as allowed",
      );
      expect(access.rows[0].allowed).toBe(false);
      const bucket = await fixture().database.query<{ public: boolean }>(
        "select public from storage.buckets where id='building-media'",
      );
      expect(bucket.rows[0].public).toBe(false);
      const policies = await fixture().database.query<{ qual: string }>(
        "select qual from pg_policies where tablename='building_media'",
      );
      expect(policies.rows[0].qual).toContain('auth.uid()');
      expect(policies.rows[0].qual).toContain('admin_users');
    });
  });
}
