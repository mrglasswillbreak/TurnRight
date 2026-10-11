import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db, fail, requireIdentity } from '../server/backend';
import admin from '../api/admin';
const request = { method: 'POST', headers: { authorization: 'Bearer private-token' } };
function response() {
  return {
    code: 0,
    body: null as any,
    status(n: number) {
      this.code = n;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
    setHeader: vi.fn(),
  };
}
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://fixture.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'private-service-key');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it.each([429, 500, 502, 503, 504])(
  'reports Auth %s as unavailable, not expired',
  async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Gateway Timeout', { status })));
    await expect(requireIdentity(request)).rejects.toMatchObject({
      status: 503,
      dependency: 'authentication',
    });
  },
);
it.each([401, 403])('retains invalid identity handling for Auth %s', async (status) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
  await expect(requireIdentity(request)).rejects.toMatchObject({ status: 401 });
});
it('treats broken transport and malformed identities as availability failures', async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('private diagnostic'))
    .mockResolvedValueOnce(new Response('not json'));
  vi.stubGlobal('fetch', fetcher);
  await expect(requireIdentity(request)).rejects.toMatchObject({ status: 503 });
  await expect(requireIdentity(request)).rejects.toMatchObject({ status: 503 });
});
it('accepts a valid identity and valid null RPC responses', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response('{"id":"owner"}'))
      .mockResolvedValueOnce(new Response('null'))
      .mockResolvedValueOnce(new Response(null, { status: 204 })),
  );
  expect(await requireIdentity(request)).toEqual({ id: 'owner' });
  expect(await db('rpc/void_operation', 'POST', {})).toBeNull();
  expect(await db('records', 'PATCH', {})).toBeNull();
});
it('does not replay an uncertain database write and records a safe correlation reference', async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValue(new Error('token private-service-key payload geometry'));
  vi.stubGlobal('fetch', fetcher);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const res = response();
  try {
    await db('rpc/write', 'POST', { private: 'geometry' });
  } catch (error) {
    fail(res, error, { requestId: 'ref-123', action: 'save-edits' });
  }
  expect(fetcher).toHaveBeenCalledOnce();
  expect(res.code).toBe(503);
  expect(res.body.requestId).toBe('ref-123');
  expect(res.body.error).not.toContain('expired');
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-service-key|geometry|Bearer/);
  expect(log).toHaveBeenCalledWith(
    'admin-request-failed',
    expect.objectContaining({ requestId: 'ref-123', dependency: 'database' }),
  );
});
it.each(['review-baseline', 'reconcile-baseline'])(
  'refuses obsolete %s without loading source geometry or making a write',
  async (action) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"id":"owner"}'))
      .mockResolvedValueOnce(new Response('[{"id":"lasu","slug":"lasu"}]'))
      .mockResolvedValueOnce(new Response('[{"roles":["administrator"]}]'));
    vi.stubGlobal('fetch', fetcher);
    const res = response();
    await admin(
      { ...request, body: { action, payload: { version: 'old', expectedHash: 'old' } } },
      res,
    );
    expect(res.code).toBe(409);
    expect(res.body.error).toContain('Accepted source updates');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(
      true,
    );
  },
);
