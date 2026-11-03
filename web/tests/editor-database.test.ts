import { beforeAll, afterAll } from 'vitest';
import { DATABASE_SETUP_TIMEOUT_MS } from './database-test-timeouts';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import type { MapEdit } from '../src/types';
import { registerLayersAndBatches } from './editor-database-layers-and-batches';
import { registerSurveyMedia } from './editor-database-survey-media';
import { registerSourceReviews } from './editor-database-source-reviews';
import { registerSourcePatches } from './editor-database-source-patches';
import { registerReleaseRevisions } from './editor-database-release-revisions';
const owner = '11111111-1111-4111-8111-111111111111';
let database: PGlite;
const item = (
  id: string,
  name = 'Door',
  expectedUpdatedAt: string | null = null,
): { edit: MapEdit; expectedUpdatedAt: string | null } => ({
  edit: {
    id,
    kind: 'entrance',
    geometry: { type: 'Point', coordinates: [3.201, 6.46] },
    properties: { name, placeId: 'library' },
    deleted: false,
  },
  expectedUpdatedAt,
});
async function save(
  operation: string,
  items: ReturnType<typeof item>[],
  actor = owner,
) {
  const result = await database.query<{
    saved: { id: string; updated_at: string; properties: { name: string } }[];
  }>('select save_editor_batch($1::uuid,$2::uuid,$3::jsonb) as saved', [
    operation,
    actor,
    JSON.stringify(items),
  ]);
  return result.rows[0].saved;
}
beforeAll(async () => {
  database = new PGlite();
  await database.exec(
    'create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select null::uuid $$;',
  );
  await database.exec(
    'create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);',
  );
  for (const filename of [
    '001_campus.sql',
    '002_explicit_api_grants.sql',
    '003_editor_batches.sql',
    '004_private_surveys.sql',
    '005_baseline_reconciliation.sql',
    '006_reconciliation_safe_updates.sql',
    '007_source_field_reviews.sql',
    '008_private_building_media.sql',
    '009_bounded_baseline_comparison.sql',
    '011_linear_baseline_reconciliation.sql',
    '012_editable_model_assets.sql',
    '013_campus_isolation.sql',
    '014_map_import_jobs.sql',
    '015_campus_release_restores.sql',
    '016_bulk_import_review_queue.sql',
    '017_import_queue_deadline.sql',
    '018_vector_layer_edits.sql',
    '019_additive_source_patch.sql',
    '020_campus_layer_records.sql',
    '021_reviewed_release_snapshot.sql',
    '022_monotonic_editor_revisions.sql',
    '038_stream_import_source_comparison.sql',
  ]) {
    // PGlite runs PostgreSQL; geometry is JSONB in this schema. Only the unused
    // PostGIS extension declaration is omitted from the local test environment.
    const sql = (
      await readFile(
        new URL(`../../supabase/migrations/${filename}`, import.meta.url),
        'utf8',
      )
    ).replace(
      'create extension if not exists postgis with schema extensions;',
      '',
    );
    await database.exec(sql);
  }
  await database.query('insert into auth.users(id) values($1);', [owner]);
  await database.query('insert into admin_users(id) values($1);', [owner]);
}, DATABASE_SETUP_TIMEOUT_MS);
afterAll(async () => {
  await database?.close();
});
const fixture = () => ({ owner, database, item, save });
export type EditorDatabaseFixture = ReturnType<typeof fixture>;
registerLayersAndBatches(fixture);
registerSurveyMedia(fixture);
registerSourceReviews(fixture);
registerSourcePatches(fixture);
registerReleaseRevisions(fixture);
