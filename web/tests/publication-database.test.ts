import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import {
  gisDatabase,
  editor,
  reviewer,
  publisher,
} from './gis-database-fixture';
let db: PGlite;
beforeAll(async () => {
  db = await gisDatabase();
}, 120000);
afterAll(async () => {
  await db?.close();
});

it('keeps the current-workspace hash check when completing a recovered publication', async () => {
  const review = randomUUID();
  await db.query('select gis_submit_review($1,$2,$3)', [
    editor,
    review,
    'Stale completion fixture',
  ]);
  await db.query('select gis_decide_review($1,$2,true,$3,false)', [
    reviewer,
    review,
    'Independent stale fixture approval',
  ]);
  const release = (
    await db.query<{ id: string }>(
      'select gis_prepare_release($1,$2,$3,$4) id',
      [publisher, review, 'before', 'Stale recovery release'],
    )
  ).rows[0].id;
  await db.query(
    "update releases set status='preview',deployment_id='dpl_stale',version='stale-new',published_catalogue_revision='after' where id=$1",
    [release],
  );
  const lease = (
    await db.query<{ token: string }>(
      'select gis_begin_publication($1) token',
      [release],
    )
  ).rows[0].token;
  await db.query(
    "update gis_publication_leases set expires_at=now()-interval '1 second'",
  );
  await db.query(
    "insert into gis_views values('lasu',$1,'Changed view','{}',1)",
    [randomUUID()],
  );
  // Simulate an out-of-date completion call with a valid lease row. The RPC
  // must still enforce the immutable review's current-workspace hash.
  await db.query(
    "update gis_publication_leases set expires_at=now()+interval '10 minutes'",
  );
  await expect(
    db.query('select gis_complete_publication($1,$2,$3,$4)', [
      release,
      lease,
      'dpl_stale',
      'https://stale.vercel.app',
    ]),
  ).rejects.toThrow('stale');
  expect(
    (await db.query('select status from releases where id=$1', [release]))
      .rows[0].status,
  ).toBe('preview');
  await db.query('select gis_end_publication($1,$2)', [release, lease]);
});

it('completes only an approved, current campus release with its exact active lease and deployment', async () => {
  const review = randomUUID();
  await db.query('select gis_submit_review($1,$2,$3)', [
    editor,
    review,
    'Publication completion fixture',
  ]);
  await db.query('select gis_decide_review($1,$2,true,$3,false)', [
    reviewer,
    review,
    'Independently verified completion fixture',
  ]);
  const release = (
    await db.query<{ id: string }>(
      'select gis_prepare_release($1,$2,$3,$4) id',
      [publisher, review, 'before', 'Verified release'],
    )
  ).rows[0].id;
  await db.query(
    "update releases set status='preview',deployment_id='dpl_exact',version='campus-new',published_catalogue_revision='after' where id=$1",
    [release],
  );
  const complete = (
    lease: string,
    deployment = 'dpl_exact',
    origin: string | null = 'https://exact.vercel.app',
  ) =>
    db.query<{ receipt: Record<string, unknown> }>(
      'select gis_complete_publication($1,$2,$3,$4) receipt',
      [release, lease, deployment, origin],
    );
  await expect(complete(randomUUID())).rejects.toThrow('lease');
  const lease = (
    await db.query<{ token: string }>(
      'select gis_begin_publication($1) token',
      [release],
    )
  ).rows[0].token;
  await expect(complete(randomUUID())).rejects.toThrow('lease');
  await expect(complete(lease, 'dpl_foreign')).rejects.toThrow(
    'Verified production',
  );
  await expect(
    complete(lease, 'dpl_exact', 'https://wrong.example.org'),
  ).rejects.toThrow('Verified production');
  await expect(complete(lease, 'dpl_exact', null)).rejects.toThrow(
    'Verified production',
  );
  await db.query(
    "update gis_publication_leases set expires_at=now()-interval '1 second'",
  );
  await expect(complete(lease)).rejects.toThrow('lease');
  await db.query('delete from campus_memberships where user_id=$1', [reviewer]);
  await db.query(
    "update gis_publication_leases set expires_at=now()+interval '10 minutes'",
  );
  await expect(complete(lease)).rejects.toThrow('approved snapshot');
  await db.query(
    "update gis_publication_leases set expires_at=now()-interval '1 second'",
  );
  await db.query(
    "insert into campus_memberships values('lasu',$1,array['reviewer'])",
    [reviewer],
  );
  await db.query(
    "update gis_publication_leases set expires_at=now()+interval '10 minutes'",
  );
  const result = (await complete(lease)).rows[0].receipt;
  expect(result).toEqual({
    id: release,
    status: 'published',
    version: 'campus-new',
    deployment_id: 'dpl_exact',
    deployment_url: 'https://exact.vercel.app',
  });
  expect(JSON.stringify(result).length).toBeLessThan(500);
  expect((await complete(lease)).rows[0].receipt).toEqual(result);
  const audits = await db.query(
    "select action from workspace_audit where subject=$1 and action='publication-complete'",
    [release],
  );
  expect(audits.rows).toHaveLength(1);
  expect(
    (
      await db.query(
        'select status,error,published_at from releases where id=$1',
        [release],
      )
    ).rows[0],
  ).toMatchObject({
    status: 'published',
    error: null,
    published_at: expect.anything(),
  });
  await db.query('select gis_end_publication($1,$2)', [release, lease]);
  await expect(complete(lease)).rejects.toThrow('lease');
  const settings = await db.query<{ proname: string; proconfig: string[] }>(
    "select proname,proconfig from pg_proc where proname in ('gis_begin_publication','gis_complete_publication')",
  );
  expect(settings.rows).toHaveLength(2);
  for (const fn of settings.rows)
    expect(fn.proconfig).toContain('statement_timeout=60s');
  for (const role of ['anon', 'authenticated']) {
    const grant = await db.query<{ allowed: boolean }>(
      "select has_function_privilege($1,'gis_complete_publication(uuid,uuid,text,text)','EXECUTE') allowed",
      [role],
    );
    expect(grant.rows[0].allowed).toBe(false);
  }
});
