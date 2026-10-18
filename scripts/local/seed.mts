import { createClient } from '../../web/node_modules/@supabase/supabase-js/dist/index.mjs';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readConfig, runtime, savePrivate } from './runtime.mjs';
import { campusFixture } from '../../web/tests/fixture.ts';
import { flatten } from '../cloud.mjs';
import type { CampusIdentity } from '../../web/src/campus-context.ts';

const config = await readConfig();
const client = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const roles = ['administrator', 'editor', 'reviewer', 'publisher'] as const;
type Account = {
  id: string;
  email: string;
  password: string;
  role: (typeof roles)[number];
};
let accounts: Account[] = [];
if (!process.argv.includes('--reset')) {
  try {
    accounts = JSON.parse(
      await readFile(path.join(runtime, 'accounts.json'), 'utf8'),
    );
  } catch {
    /* First start. */
  }
}
const existing = await client.auth.admin.listUsers();
if (existing.error) throw existing.error;
for (const role of roles) {
  const email = `${role}@turnright.local`;
  const previous = accounts.find((account) => account.role === role);
  if (previous && existing.data.users.some((user) => user.id === previous.id))
    continue;
  if (existing.data.users.some((user) => user.email === email))
    throw Error(
      'Local seed accounts already exist but their credential record is missing. Restore accounts.json or explicitly reset the local stack.',
    );
  const password = randomBytes(24).toString('base64url');
  const created = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  accounts = [
    ...accounts.filter((account) => account.role !== role),
    { role, email, password, id: created.data.user.id },
  ];
  await savePrivate('accounts.json', accounts);
}
async function check<T>(
  request: PromiseLike<{ data: T; error: { message: string } | null }>,
) {
  const result = await request;
  if (result.error) throw Error(result.error.message);
  return result.data;
}
const administrator = accounts.find(
  (account) => account.role === 'administrator',
)!;
await check(client.from('admin_users').upsert({ id: administrator.id }));
const catalogue: { schemaVersion: 1; campuses: CampusIdentity[] } = {
  schemaVersion: 1,
  campuses: [],
};
for (const [id, name] of [
  ['lasu', 'Local North Campus'],
  ['local-south', 'Local South Campus'],
]) {
  const data = campusFixture();
  data.version = `local-${id}-1`;
  data.sources = [];
  data.coverage.notes = ['Synthetic development data; not a real campus map.'];
  if (
    data.boundary.geometry.type !== 'Polygon' &&
    data.boundary.geometry.type !== 'MultiPolygon'
  )
    throw Error('The synthetic campus requires a polygon boundary.');
  const campus: CampusIdentity = {
    id,
    slug: id,
    name,
    bounds: data.bounds,
    outline: data.boundary.geometry,
    manifestUrl:
      id === 'lasu' ? '/packages/latest.json' : `/packages/${id}/latest.json`,
  };
  const found = await check(
    client.from('source_features').select('id').eq('campus_id', id).limit(1),
  );
  if (!found?.length) {
    await check(
      client.from('campuses').upsert({
        ...campus,
        boundary: data.boundary,
        manifestUrl: undefined,
        outline: undefined,
      }),
    );
    await check(
      client
        .from('source_features')
        .insert(
          flatten(data).map((row: object) => ({ ...row, campus_id: id })),
        ),
    );
  }
  for (const account of accounts) {
    // The south campus is reserved to the administrator to exercise isolation.
    if (id !== 'lasu' && account.role !== 'administrator') continue;
    const membership = await check(
      client
        .from('campus_memberships')
        .select('user_id')
        .eq('campus_id', id)
        .eq('user_id', account.id),
    );
    if (!membership?.length)
      await check(
        client.from('campus_memberships').insert({
          campus_id: id,
          user_id: account.id,
          roles: [account.role],
        }),
      );
  }
  const bytes = Buffer.from(JSON.stringify(data));
  const digest = createHash('sha256').update(bytes).digest('hex');
  const dataUrl = `/packages/${id}/campus.json`;
  const manifest = {
    schemaVersion: 1,
    version: data.version,
    createdAt: data.createdAt,
    campus,
    summary: 'Synthetic local development fixture',
    bytes: bytes.length,
    dataUrl,
    assets: [{ url: dataUrl, bytes: bytes.length, sha256: digest }],
  };
  await mkdir(path.join(runtime, 'public', 'packages', id), {
    recursive: true,
  });
  await writeFile(path.join(runtime, 'public', dataUrl), bytes);
  await writeFile(
    path.join(runtime, 'public', campus.manifestUrl!),
    JSON.stringify(manifest),
  );
  catalogue.campuses.push(campus);
}
await writeFile(
  path.join(runtime, 'public/packages/campuses.json'),
  JSON.stringify(catalogue),
);
console.log(
  'Local accounts and synthetic campus fixtures are ready. Existing workspace edits and uploads were retained.',
);
