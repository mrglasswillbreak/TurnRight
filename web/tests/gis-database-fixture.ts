import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { readdir, readFile } from 'node:fs/promises';

export const owner = '11111111-1111-4111-8111-111111111111';
export const editor = '22222222-2222-4222-8222-222222222222';
export const reviewer = '33333333-3333-4333-8333-333333333333';
export const publisher = '44444444-4444-4444-8444-444444444444';
export async function gisDatabase() {
  const db = new PGlite({ extensions: { postgis } });
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema extensions; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  const root = new URL('../../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(root))
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    try {
      await db.exec(await readFile(new URL(file, root), 'utf8'));
    } catch (cause) {
      await db.close();
      throw new Error(`Migration ${file} failed`, { cause });
    }
  }
  for (const user of [owner, editor, reviewer, publisher])
    await db.query('insert into auth.users values ($1)', [user]);
  await db.query('insert into admin_users(id) values ($1)', [owner]);
  for (const [user, role] of [
    [editor, 'editor'],
    [reviewer, 'reviewer'],
    [publisher, 'publisher'],
  ])
    await db.query(
      "insert into campus_memberships values ('lasu',$1,array[$2])",
      [user, role],
    );
  return db;
}
