import { beforeAll, afterAll, expect } from 'vitest';
import { gisDatabase } from './gis-database-fixture';
import type { PGlite } from '@electric-sql/pglite';
import { registerMembershipAndReview } from './gis-database-membership-and-review';
import { registerDatasetIntegrity } from './gis-database-dataset-integrity';
import { registerPublication } from './gis-database-publication';
let db: PGlite;
async function expectIdenticalWorkspaceHashes() {
  const result = (
    await db.query<{ original: string; serialized: string }>(
      'select gis_content_hash(gis_workspace_snapshot()) original, gis_workspace_content_hash() serialized',
    )
  ).rows[0];
  expect(result.serialized).toBe(result.original);
}
beforeAll(async () => {
  db = await gisDatabase();
}, 120000);
afterAll(async () => {
  await db?.close();
});
const fixture = () => ({ db, expectIdenticalWorkspaceHashes });
export type GisDatabaseFixture = ReturnType<typeof fixture>;
registerMembershipAndReview(fixture);
registerDatasetIntegrity(fixture);
registerPublication(fixture);
