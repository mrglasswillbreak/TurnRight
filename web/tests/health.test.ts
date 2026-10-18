import { afterEach, expect, it, vi } from 'vitest';
import health from '../api/health';
afterEach(() => vi.unstubAllEnvs());
function invoke(method: string) {
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
    setHeader(key: string, value: string) {
      this.headers.set(key, value);
    },
  };
  health({ method, headers: {} }, result);
  return result;
}
it.each(['GET', 'HEAD'])(
  'returns liveness and a verified release identifier for %s',
  (method) => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'A'.repeat(40));
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'private-key');
    const result = invoke(method);
    expect(result.code).toBe(200);
    expect(result.body).toEqual({ status: 'ok', revision: 'a'.repeat(40) });
    expect(result.headers.get('Cache-Control')).toBe('no-store');
  },
);
it('does not expose missing or malformed environment values', () => {
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'secret-or-branch-name');
  expect(invoke('GET').body).toEqual({ status: 'ok', revision: 'unknown' });
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
  vi.stubEnv('GITHUB_SHA', 'b'.repeat(40));
  expect(invoke('GET').body).toEqual({
    status: 'ok',
    revision: 'b'.repeat(40),
  });
  vi.stubEnv('GITHUB_SHA', '');
  expect(invoke('GET').body).toEqual({ status: 'ok', revision: 'unknown' });
});
it('rejects mutations without querying dependencies', () => {
  const result = invoke('POST');
  expect(result.code).toBe(405);
  expect(result.headers.get('Allow')).toBe('GET, HEAD');
});
