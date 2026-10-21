import { afterEach, expect, it, vi } from 'vitest';
import {
  clearDiagnostics,
  diagnosticReport,
  diagnosticRequestId,
  downloadDiagnostics,
  installGlobalDiagnostics,
  recordDiagnostic,
} from '../src/diagnostics';
import { adminRequest } from '../src/admin-client';

afterEach(() => {
  clearDiagnostics();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const report = () => JSON.parse(diagnosticReport());

it('exports only bounded operational fields, never errors or request payloads', () => {
  const context = {
    status: 503,
    reason: 'server' as const,
    requestId: 'ref-123',
    message: 'Bearer private-token',
    stack: '/private/path?secret=value',
    coordinates: [6, 3],
    user: 'private-email',
    payload: { name: 'private-name' },
  };
  recordDiagnostic('admin-request-failed', context, 1000);
  expect(report()).toEqual({
    schemaVersion: 1,
    events: [
      {
        event: 'admin-request-failed',
        timestamp: '1970-01-01T00:00:01.000Z',
        occurrences: 1,
        status: 503,
        reason: 'server',
        requestId: 'ref-123',
      },
    ],
  });
  const exported = report();
  exported.events[0].status = 200;
  expect(report().events[0].status).toBe(503);
});

it('rejects malformed identifiers, unknown events and unsafe metadata', () => {
  for (const value of [null, 42, 'Bearer token', 'ref-123\n', 'f'.repeat(36)])
    expect(diagnosticRequestId(value)).toBeUndefined();
  const uuid = '01234567-89ab-cdef-0123-456789abcdef';
  expect(diagnosticRequestId(uuid)).toBe(uuid);
  recordDiagnostic('private' as 'render-failed');
  for (const now of [Infinity, NaN, 9e15])
    recordDiagnostic('render-failed', {}, now);
  expect(report().events).toEqual([]);
  recordDiagnostic(
    'unhandled-error',
    {
      status: 999,
      reason: 'secret' as 'server',
      requestId: 'secret',
    },
    0,
  );
  expect(report().events).toEqual([
    {
      event: 'unhandled-error',
      timestamp: '1970-01-01T00:00:00.000Z',
      occurrences: 1,
    },
  ]);
});

it('coalesces bursts and retains only the most recent fifty records', () => {
  for (let index = 0; index < 10001; index++)
    recordDiagnostic('render-failed', {}, 1000);
  expect(report().events).toHaveLength(1);
  expect(report().events[0].occurrences).toBe(9999);
  for (let index = 1; index <= 60; index++)
    recordDiagnostic('render-failed', {}, index * 6000);
  expect(report().events).toHaveLength(50);
  expect(report().events[0].timestamp).toBe(new Date(11 * 6000).toISOString());
  clearDiagnostics();
  expect(report().events).toEqual([]);
});

it('observes global failures without suppressing them and cleans up listeners', () => {
  const target = new EventTarget();
  const remove = installGlobalDiagnostics(target as Window);
  const error = new Event('error', { cancelable: true });
  target.dispatchEvent(error);
  target.dispatchEvent(new Event('unhandledrejection'));
  expect(error.defaultPrevented).toBe(false);
  expect(
    report().events.map((event: { event: string }) => event.event),
  ).toEqual(['unhandled-error', 'unhandled-rejection']);
  remove();
  target.dispatchEvent(new Event('error'));
  expect(report().events).toHaveLength(2);
});

it('downloads only on demand and releases the temporary object URL', () => {
  vi.useFakeTimers();
  const click = vi.fn();
  const anchor = { href: '', download: '', click };
  vi.stubGlobal('document', { createElement: vi.fn(() => anchor) });
  const create = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:local-report');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  downloadDiagnostics();
  expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
  expect(anchor.download).toBe('turnright-diagnostics.json');
  expect(click).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(1000);
  expect(revoke).toHaveBeenCalledWith('blob:local-report');
});

it.each([401, 403, 500])(
  'correlates HTTP %i failures with the API reference',
  async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'private detail', requestId: 'ref-456' }),
          { status, headers: { 'X-Request-ID': 'ref-123' } },
        ),
      );
    await expect(
      adminRequest(
        'state',
        {},
        'private-token',
        { fetcher, retries: 0 },
        'lasu',
      ),
    ).rejects.toMatchObject({ status, requestId: 'ref-123' });
    expect(report().events[0]).toMatchObject({
      event: 'admin-request-failed',
      status,
      requestId: 'ref-123',
    });
    expect(diagnosticReport()).not.toContain('private');
  },
);

it('preserves correlation for malformed responses and body-only references', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response('not-json', { headers: { 'X-Request-ID': 'ref-789' } }),
    )
    .mockResolvedValueOnce(
      new Response('null', { headers: { 'X-Request-ID': 'ref-101' } }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'failure', requestId: 'ref-456' }), {
        status: 500,
      }),
    );
  for (const requestId of ['ref-789', 'ref-101', 'ref-456'])
    await expect(
      adminRequest('state', {}, undefined, { fetcher, retries: 0 }, 'lasu'),
    ).rejects.toMatchObject({ requestId });
  expect(
    report().events.map((event: { requestId: string }) => event.requestId),
  ).toEqual(['ref-789', 'ref-101', 'ref-456']);
});

it('records exhausted retries but does not report recovered retries or cancellation as failures', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error('private network detail'))
    .mockResolvedValueOnce(new Response('{}'));
  await adminRequest(
    'state',
    {},
    undefined,
    { fetcher, delay: async () => {} },
    'lasu',
  );
  expect(report().events).toEqual([]);
  const controller = new AbortController();
  controller.abort();
  await expect(
    adminRequest(
      'state',
      {},
      undefined,
      { fetcher, signal: controller.signal },
      'lasu',
    ),
  ).rejects.toThrow();
  expect(report().events).toEqual([]);
  fetcher.mockRejectedValue(new Error('private network detail'));
  await expect(
    adminRequest('state', {}, undefined, { fetcher, retries: 0 }, 'lasu'),
  ).rejects.toThrow();
  expect(report().events[0]).toMatchObject({ reason: 'network' });
  expect(diagnosticReport()).not.toContain('private');
});
