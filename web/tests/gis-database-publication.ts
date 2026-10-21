import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { owner, editor, reviewer } from './gis-database-fixture';
import type { GisDatabaseFixture } from './gis-database.test';
export function registerPublication(fixture: () => GisDatabaseFixture): void {
  it('lets editors accept source fields and attributes the change to independent review', async () => {
    const before = (
      await fixture().db.query<{
        r: {
          id: string;
          entity: string;
          payload: { properties: Record<string, unknown> };
          hash: string;
        };
      }>("select to_jsonb(s) r from source_features s where id='gis-source:0'")
    ).rows[0].r;
    const after = structuredClone(before);
    after.payload.properties.name = 'Imported name';
    after.hash = 'accepted-name';
    await fixture().db.query(
      "insert into map_changes(id,source_id,kind,before,after,base_hash,summary) values('gis-field-review',$1,'modify',$2,$3,$4,'Import name')",
      [before.id, JSON.stringify(before), JSON.stringify(after), before.hash],
    );
    const args = [
      'gis-field-review',
      JSON.stringify(before),
      JSON.stringify(after),
      JSON.stringify(after),
      JSON.stringify(['properties.name']),
    ];
    await expect(
      fixture().db.query('select review_map_fields($1,$2,$3,$4,$5,$6)', [
        ...args,
        reviewer,
      ]),
    ).rejects.toThrow(/access|permission/);
    await fixture().db.query('select review_map_fields($1,$2,$3,$4,$5,$6)', [
      ...args,
      editor,
    ]);
    expect(
      (
        await fixture().db.query(
          "select actor from workspace_audit where subject='gis-field-review' and action='source-review'",
        )
      ).rows,
    ).toEqual([{ actor: editor }]);
    const id = randomUUID();
    const submission = (
      await fixture().db.query<{ r: { contributors: string[] } }>(
        'select gis_submit_review($1,$2,$3) r',
        [owner, id, 'Independent source check'],
      )
    ).rows[0].r;
    expect(submission.contributors).toContain(editor);
  });
}
