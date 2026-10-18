import { afterEach, expect, it, vi } from 'vitest';
import { emitEvent, eventRecord } from '../server/diagnostics.mjs';
afterEach(() => vi.restoreAllMocks());
it('records operational metadata and discards secrets and error objects', () => {
  const context = {
    startedAt: 1000,
    status: 503,
    requestId: 'ref-123',
    action: 'save-edits',
    dependency: 'database',
    upstreamStatus: 504,
    worker: 'gis',
    token: 'private-token',
    payload: { coordinates: [3, 6] },
    error: new Error('raw upstream secret'),
  };
  expect(eventRecord('admin-request-failed', context, 1023)).toEqual({
    event: 'admin-request-failed',
    timestamp: '1970-01-01T00:00:01.023Z',
    durationMs: 23,
    status: 503,
    requestId: 'ref-123',
    action: 'save-edits',
    dependency: 'database',
    upstreamStatus: 504,
    worker: 'gis',
  });
});
it('rejects arbitrary event names and drops unsafe metadata', () => {
  expect(() => eventRecord('private' as 'worker-failed')).toThrow('Unknown');
  expect(
    eventRecord(
      'worker-failed',
      {
        startedAt: Infinity,
        status: 999,
        requestId: 'Bearer secret',
        action: '/private?token=secret',
        dependency: 'secret',
        upstreamStatus: 99,
        worker: 'sh',
      },
      2000,
    ),
  ).toEqual({ event: 'worker-failed', timestamp: '1970-01-01T00:00:02.000Z' });
  expect(
    eventRecord(
      'worker-completed',
      { startedAt: 3000, status: 99, upstreamStatus: 999 },
      2000,
    ),
  ).not.toHaveProperty('durationMs');
  expect(eventRecord('request-completed', {}, 0)).toEqual({
    event: 'request-completed',
    timestamp: '1970-01-01T00:00:00.000Z',
  });
});
it('uses separate structured success and failure sinks', () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  emitEvent('worker-completed', { worker: 'source-review', status: 200 });
  emitEvent('worker-failed');
  expect(JSON.parse(info.mock.calls[0][0])).toMatchObject({
    event: 'worker-completed',
    status: 200,
    worker: 'source-review',
  });
  expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
    event: 'worker-failed',
  });
});
