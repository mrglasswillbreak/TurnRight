import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import admin from '../api/admin';
import reports from '../api/reports';
function response() {
  return {
    code: 0,
    body: null as any,
    status(code: number) {
      this.code = code;
      return this;
    },
    json(body: any) {
      this.body = body;
    },
    setHeader: vi.fn(),
  };
}
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  vi.stubEnv('ADMIN_USER_ID', 'owner');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('server authorization', () => {
  it('requires owner authentication before photograph upload, review or revision', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    for (const action of [
      'media-begin',
      'media-list',
      'media-process',
      'media-approve',
      'media-revise',
    ]) {
      const res = response();
      await admin({ method: 'POST', headers: {}, body: { action } }, res);
      expect(res.code).toBe(401);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects anonymous admin requests before reading private data', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const res = response();
    await admin(
      { method: 'POST', headers: {}, body: { action: 'state' } },
      res,
    );
    expect(res.code).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects an authenticated non-admin', async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ id: 'stranger' })),
    );
    vi.stubGlobal('fetch', fetcher);
    const res = response();
    await admin(
      {
        method: 'POST',
        headers: { authorization: 'Bearer fake' },
        body: { action: 'export' },
      },
      res,
    );
    expect(res.code).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not trust an administrator UUID without a database allowlist entry', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'owner' })))
      .mockResolvedValueOnce(new Response('[]'));
    vi.stubGlobal('fetch', fetcher);
    const res = response();
    await admin(
      {
        method: 'POST',
        headers: { authorization: 'Bearer fake' },
        body: { action: 'state' },
      },
      res,
    );
    expect(res.code).toBe(403);
  });
  it('validates reports before writing or using the rate limit table', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const res = response();
    await reports(
      {
        method: 'POST',
        headers: {},
        body: {
          coordinates: [0, 0],
          description: 'A test report that is out of bounds.',
          category: 'other',
        },
      },
      res,
    );
    expect(res.code).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects reports when the atomic rate limiter refuses a slot', async () => {
    vi.stubEnv('REPORT_RATE_SALT', 'test');
    const fetcher = vi.fn(async () => new Response('false'));
    vi.stubGlobal('fetch', fetcher);
    const res = response();
    await reports(
      {
        method: 'POST',
        headers: { 'x-vercel-forwarded-for': '192.0.2.1' },
        body: {
          coordinates: [3.2, 6.46],
          description: 'The entrance has moved to the other side.',
          category: 'missing-path',
        },
      },
      res,
    );
    expect(res.code).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
