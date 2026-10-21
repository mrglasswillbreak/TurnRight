import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import admin from '../api/admin';
import type { MapEdit } from '../src/types';
import { campusFixture } from './fixture';

const operationId = 'b42efb5a-b4d3-43c0-9e41-732aca364f84';
const revision = '2026-10-21T00:00:00.000Z';
const edit = (): MapEdit => ({
  id: 'reviewed-walk',
  kind: 'path',
  geometry: {
    type: 'LineString',
    coordinates: [
      [3.2, 6.46],
      [3.2005, 6.46],
    ],
  },
  properties: { name: 'Reviewed walk', walkingAccess: 'yes' },
});
const batch = () => ({
  operationId,
  edits: [{ edit: edit(), expectedUpdatedAt: revision }],
});

interface Call {
  url: URL;
  method: string;
  headers: Headers;
  body?: Record<string, unknown>;
}
let calls: Call[];
let roles: string[];
let conflict: boolean;
beforeEach(() => {
  calls = [];
  roles = ['editor'];
  conflict = false;
  vi.stubEnv('SUPABASE_URL', 'https://edit-boundary.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-service-key');
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({
        url,
        method: init?.method || 'GET',
        headers: new Headers(init?.headers),
        body,
      });
      const json = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), { status });
      if (url.pathname === '/auth/v1/user')
        return json({ id: 'verified-editor' });
      if (url.pathname.endsWith('/campuses')) {
        const id = url.searchParams.get('or')!.match(/id\.eq\.([a-z-]+)/)![1];
        const campus = campusFixture();
        return json([
          {
            id,
            slug: id,
            name: id,
            bounds: campus.bounds,
            boundary: campus.boundary,
          },
        ]);
      }
      if (url.pathname.endsWith('/campus_memberships'))
        return json([{ roles }]);
      if (url.pathname.endsWith('/rpc/gis_hydrate_editor'))
        return json({ features: [], edits: [] });
      if (url.pathname.endsWith('/rpc/save_editor_batch')) {
        if (conflict)
          return json(
            { message: 'Draft changed; reload its latest revision.' },
            409,
          );
        return json(
          body.items.map((item: { edit: MapEdit }) => ({
            ...item.edit,
            updated_at: revision,
          })),
        );
      }
      throw Error(`Unexpected fixture request: ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function request(
  payload: unknown,
  campus = 'lasu',
  action = 'save-edits',
) {
  const result = {
    code: 0,
    body: undefined as unknown,
    headers: new Map<string, string>(),
    status(code: number) {
      this.code = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
    setHeader(name: string, value: string) {
      this.headers.set(name.toLowerCase(), value);
    },
  };
  await admin(
    {
      method: 'POST',
      headers: { authorization: 'Bearer test-only-editor' },
      body: { action, payload, campus },
    },
    result,
  );
  return result;
}
const writes = () =>
  calls.filter((call) => call.url.pathname.endsWith('/rpc/save_editor_batch'));

it('preserves the optimistic revision and operation identity while deriving actor and campus on the server', async () => {
  const payload = {
    ...batch(),
    actor_id: 'forged-user',
    campus_id: 'other-campus',
  };
  Object.assign(payload.edits[0].edit, {
    campus_id: 'other-campus',
    approved: true,
  });
  const result = await request(payload, 'north');
  expect(result.code).toBe(200);
  expect(writes()).toHaveLength(1);
  const write = writes()[0];
  expect(write.headers.get('X-TurnRight-Campus')).toBe('north');
  expect(write.body).toEqual({
    operation_id: operationId,
    actor_id: 'verified-editor',
    items: [
      { edit: { ...edit(), deleted: false }, expectedUpdatedAt: revision },
    ],
  });
  expect(result.headers.get('cache-control')).toContain('no-store');
  expect(result.headers.get('x-request-id')).toMatch(/^[a-f0-9-]{36}$/);
  expect(result.body).toEqual([
    { ...edit(), deleted: false, updated_at: revision },
  ]);
});

it.each([
  ['invalid operation identity', { ...batch(), operationId: 'not-a-uuid' }],
  ['missing edits', { operationId }],
  ['empty batch', { operationId, edits: [] }],
  ['oversized batch', { operationId, edits: Array(501).fill(null) }],
  [
    'invalid revision',
    {
      operationId,
      edits: [{ edit: edit(), expectedUpdatedAt: 'invalid-date' }],
    },
  ],
  ['missing revision', { operationId, edits: [{ edit: edit() }] }],
  [
    'duplicate feature',
    { operationId, edits: [batch().edits[0], batch().edits[0]] },
  ],
  [
    'outside campus',
    {
      operationId,
      edits: [
        {
          edit: {
            ...edit(),
            geometry: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [0, 1],
              ],
            },
          },
          expectedUpdatedAt: null,
        },
      ],
    },
  ],
])('rejects %s before starting a mutation', async (_name, payload) => {
  const result = await request(payload);
  expect(result.code).toBe(400);
  expect(writes()).toHaveLength(0);
  expect(calls.every((call) => call.method === 'GET')).toBe(true);
});

it('keeps concurrent requests scoped to their resolved campuses', async () => {
  const results = await Promise.all([
    request(batch(), 'north'),
    request(batch(), 'south'),
  ]);
  expect(results.map((result) => result.code)).toEqual([200, 200]);
  expect(
    writes()
      .map((write) => write.headers.get('X-TurnRight-Campus'))
      .sort(),
  ).toEqual(['north', 'south']);
  const memberships = calls.filter((call) =>
    call.url.pathname.endsWith('/campus_memberships'),
  );
  expect(
    memberships.map((call) => call.url.searchParams.get('campus_id')).sort(),
  ).toEqual(['eq.north', 'eq.south']);
});

it('returns a conflict without replaying the write or losing its correlation reference', async () => {
  conflict = true;
  const result = await request(batch());
  expect(result.code).toBe(409);
  expect(writes()).toHaveLength(1);
  expect(result.body).toMatchObject({
    requestId: result.headers.get('x-request-id'),
    error: expect.stringContaining('Draft changed'),
  });
});

it('blocks a viewer before hydrating or mutating selected features', async () => {
  roles = ['viewer'];
  const result = await request(batch());
  expect(result.code).toBe(403);
  expect(calls).toHaveLength(3);
  expect(calls.every((call) => call.method === 'GET')).toBe(true);
});

it('retains the single-edit response contract with a server-generated operation identity', async () => {
  const result = await request(
    { ...edit(), updated_at: revision },
    'lasu',
    'save-edit',
  );
  expect(result.code).toBe(200);
  expect(result.body).toEqual({
    ...edit(),
    deleted: false,
    updated_at: revision,
  });
  expect(writes()[0].body?.operation_id).toMatch(/^[a-f0-9-]{36}$/);
});
