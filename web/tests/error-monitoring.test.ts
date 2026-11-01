import { afterEach, expect, it, vi } from 'vitest';
import {
  captureOperationalError,
  flushErrorMonitoring,
  monitoringConfiguration,
  monitoringEnvelope,
} from '../server/error-monitoring.mjs';
const reference = '11111111-1111-4111-8111-111111111111';
const failure = {
  event: 'worker-failed',
  worker: 'gis',
  status: 503,
  dependency: 'database',
  jobId: reference,
};
afterEach(async () => {
  await flushErrorMonitoring();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('groups only allowlisted operational metadata, without arbitrary action, exception or payload fields', () => {
  const result = monitoringEnvelope(
    {
      ...failure,
      action: 'private-user-name',
      payload: { token: 'secret' },
      error: 'secret',
      url: 'https://private',
      coordinates: [1, 2],
    },
    { GITHUB_SHA: 'a'.repeat(40) },
  );
  expect(result).toEqual({
    event: 'worker-failed',
    component: 'gis',
    status: 503,
    dependency: 'database',
    revision: 'a'.repeat(40),
    reference,
  });
  expect(
    monitoringEnvelope(
      { event: 'admin-request-failed', status: 500, requestId: reference },
      { VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40) },
    ),
  ).toMatchObject({
    component: 'api',
    dependency: 'unknown',
    reference,
    revision: 'b'.repeat(40),
  });
  expect(
    monitoringEnvelope(
      { ...failure, worker: 'secret', dependency: 'secret', jobId: 'secret' },
      { GITHUB_SHA: 'private-branch' },
    ),
  ).toEqual({
    event: 'worker-failed',
    component: 'api',
    dependency: 'unknown',
    status: 503,
    revision: 'unknown',
  });
  for (const record of [
    {},
    { ...failure, event: 'worker-completed' },
    { ...failure, status: 499 },
    { ...failure, status: 600 },
    { ...failure, status: 500.5 },
    { ...failure, action: 'monitoring-list' },
  ])
    expect(monitoringEnvelope(record)).toBeUndefined();
});

it('rejects invalid origins and supports only TLS or a local loopback development backend', () => {
  for (const url of [
    'invalid',
    'http://example.com',
    'https://user:secret@example.com',
    'https://example.com/path',
    'https://example.com?secret=1',
    'https://example.com#secret',
  ])
    expect(
      monitoringConfiguration({
        SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: 'test',
      }),
    ).toBeUndefined();
  for (const url of [
    'https://example.com/',
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'http://[::1]:54321',
  ])
    expect(
      monitoringConfiguration({
        SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: 'test',
      }),
    ).toBeDefined();
  expect(monitoringConfiguration({})).toBeUndefined();
  expect(
    monitoringConfiguration({ SUPABASE_URL: 'https://example.com' }),
  ).toBeUndefined();
  expect(
    monitoringConfiguration({
      SUPABASE_URL: 'https://example.com',
      SUPABASE_SERVICE_ROLE_KEY: 'test',
      ERROR_MONITORING_ENABLED: 'false',
    }),
  ).toBeUndefined();
});

it('flushes bounded deliveries, refuses redirects, and never lets a storage outage replace the original failure', async () => {
  vi.stubEnv('ERROR_MONITORING_ENABLED', 'true');
  vi.stubEnv('SUPABASE_URL', 'https://monitoring.example');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'disposable-test-key');
  const fetcher = vi.fn().mockResolvedValue(new Response('"group"'));
  vi.stubGlobal('fetch', fetcher);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  captureOperationalError(failure);
  await flushErrorMonitoring();
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe(
    'https://monitoring.example/rest/v1/rpc/record_operational_error',
  );
  expect(init.redirect).toBe('error');
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(init.body).p_event.reference).toBe(reference);
  fetcher.mockRejectedValueOnce(Error('secret upstream detail'));
  captureOperationalError(failure);
  await expect(flushErrorMonitoring()).resolves.toBeUndefined();
  expect(log).toHaveBeenCalled();
  expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
  fetcher.mockResolvedValue(new Response('private error', { status: 503 }));
  captureOperationalError(failure);
  await flushErrorMonitoring();
  expect(log).toHaveBeenCalledTimes(1);
  for (let index = 0; index < 25; index++) captureOperationalError(failure);
  await flushErrorMonitoring();
  expect(fetcher).toHaveBeenCalledTimes(19);
  vi.stubEnv('ERROR_MONITORING_ENABLED', 'false');
  captureOperationalError(failure);
  await flushErrorMonitoring();
  expect(fetcher).toHaveBeenCalledTimes(19);
});
