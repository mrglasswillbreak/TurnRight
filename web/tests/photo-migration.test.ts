import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
it('migration 010 retains private owner reads and immutable approvals while adding guarded drafts', async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create table public.admin_users(id uuid primary key);
      grant usage on schema auth to authenticated;
      grant select on public.admin_users to authenticated;
      create function auth.uid() returns uuid language sql as $$select current_setting('request.jwt.claim.sub', true)::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    for(const migration of ['008_private_building_media.sql','010_private_photo_drafts.sql'])
      await db.exec(await readFile(new URL(`../../supabase/migrations/${migration}`,import.meta.url),'utf8'));
    await db.exec(`insert into auth.users values('11111111-1111-4111-8111-111111111111');
      insert into public.admin_users select id from auth.users;
      insert into public.building_media(id,owner,original_path) values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','private/original');`);
    expect((await db.query(`update public.building_media set draft_revision=1,draft_metadata='{"caption":"Unfinished"}' where draft_revision=0 returning id`)).rows).toHaveLength(1);
    expect((await db.query(`update public.building_media set draft_revision=1 where draft_revision=0 returning id`)).rows).toHaveLength(0);
    await db.exec(`update public.building_media set status='approved',derivative_path='private/optimized',public_metadata='{}',reviewed_at=now();`);
    await expect(db.exec(`update public.building_media set draft_metadata='{}'`)).rejects.toThrow('immutable');
    await db.exec(`set role authenticated; set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';`);
    expect((await db.query('select id from public.building_media')).rows).toHaveLength(1);
    await db.exec(`set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';`);
    expect((await db.query('select id from public.building_media')).rows).toHaveLength(0);
  }finally{await db.close();}
});
