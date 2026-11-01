import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { verifyDeploymentHealth } from '../../scripts/deployment-health.mjs';

const origin = 'https://preview.vercel.app';
const revision = 'a'.repeat(40);
const headers = { 'x-vercel-protection-bypass': 'test-bypass' };
const sso = 'https://vercel.com/sso-api?opaque=private-query';
const redirect = (location = sso) =>
  new Response('private-body', { status: 302, headers: { location } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('retries transient Vercel SSO only at the original endpoint, then verifies exact health', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(redirect())
    .mockResolvedValueOnce(Response.json({ status: 'ok', revision }));
  vi.stubGlobal('fetch', fetch);
  const result = expect(
    verifyDeploymentHealth(origin, revision, headers),
  ).resolves.toBeUndefined();
  await vi.advanceTimersByTimeAsync(2000);
  await result;
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [url, options] of fetch.mock.calls) {
    expect(url).toBe(origin + '/api/health');
    expect(options.headers).toBe(headers);
    expect(options.redirect).toBe('manual');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  }
});

it('fails at the 30-second deadline when SSO persists without exposing its query or body', async () => {
  const fetch = vi.fn(async () => redirect());
  vi.stubGlobal('fetch', fetch);
  const started = Date.now();
  const result = expect(
    verifyDeploymentHealth(origin, revision, headers),
  ).rejects.toThrow(
    'Deployment health readiness deadline exceeded after 30000 ms (status 302; target https://vercel.com/sso-api).',
  );
  await vi.advanceTimersByTimeAsync(30000);
  await result;
  expect(Date.now() - started).toBe(30000);
  expect(fetch).toHaveBeenCalledTimes(15);
});

it.each([
  'https://other.example/sso-api?opaque=private-query',
  'http://vercel.com/sso-api?opaque=private-query',
  'https://vercel.com/login?opaque=private-query',
  'https://vercel.com.evil.example/sso-api?opaque=private-query',
  'https://private-user:private-password@vercel.com/sso-api',
  'data:text/plain,private-body',
  '/api/health/',
])(
  'rejects unexpected redirect %s immediately without following it',
  async (target) => {
    const fetch = vi.fn(async () => redirect(target));
    vi.stubGlobal('fetch', fetch);
    const started = Date.now();
    const error = await verifyDeploymentHealth(origin, revision, headers).catch(
      (reason: Error) => reason,
    );
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error))
      throw Error('Expected a rejected health check.');
    expect(error.message).toContain(
      'Deployment health returned status 302; target ',
    );
    expect(error.message).not.toMatch(/private-|opaque|\?/);
    expect(Date.now()).toBe(started);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      origin + '/api/health',
      expect.objectContaining({ headers, redirect: 'manual' }),
    );
  },
);

it.each([
  { status: 'ok', revision: 'b'.repeat(40) },
  { status: 'wrong', revision },
  { status: 'ok', revision, extra: 'private-body' },
])(
  'rejects a health body that differs from the exact revision contract',
  async (body) => {
    const fetch = vi.fn(async () => Response.json(body));
    vi.stubGlobal('fetch', fetch);
    await expect(
      verifyDeploymentHealth(origin, revision, headers),
    ).rejects.toThrow(
      'Deployment health status 200 did not match the expected revision.',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it.each([401, 404, 429, 500])(
  'rejects status %s immediately without reading its body',
  async (status) => {
    const response = new Response('private-body', { status });
    const read = vi.spyOn(response, 'json');
    const fetch = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetch);
    await expect(
      verifyDeploymentHealth(origin, revision, headers),
    ).rejects.toThrow(`Deployment health returned status ${status}.`);
    expect(read).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it('fails immediately on a transport error without exposing request details', async () => {
  const fetch = vi.fn().mockRejectedValue(Error('private-query private-body'));
  vi.stubGlobal('fetch', fetch);
  await expect(
    verifyDeploymentHealth(origin, revision, headers),
  ).rejects.toThrow('Deployment health request failed.');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('rejects invalid JSON without including the returned body', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('private-body')),
  );
  await expect(
    verifyDeploymentHealth(origin, revision, headers),
  ).rejects.toThrow('Deployment health status 200 did not contain valid JSON.');
});
