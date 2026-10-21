import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, deferred } from './render';
import {
  useCampusImportPolling,
  type ImportPolling,
} from '../../src/useCampusImportPolling';
import type { CampusImport } from '../../src/map-import-types';

const { request } = vi.hoisted(() => ({
  request: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock('../../src/supabase', () => ({ api: request }));

function job(
  status: CampusImport['status'] = 'running',
  id = 'import-one',
): CampusImport {
  return {
    id,
    status,
    campus_id: 'lasu',
    source_id: 'source-one',
    phase: 'inspect',
    run_token: 'run-one',
    created_at: '2026-10-20T12:00:00Z',
    updated_at: '2026-10-20T12:00:00Z',
    configuration: {
      layers: [],
      attribution: 'Source',
      license: 'CC0',
      redistributionConfirmed: true,
    },
  };
}
function fixture(value: CampusImport | null = job()): ImportPolling {
  return {
    job: value,
    setJob: vi.fn(),
    setConfiguration: vi.fn(),
    setNotice: vi.fn(),
    setError: vi.fn(),
  };
}
function Probe(props: ImportPolling) {
  useCampusImportPolling(props);
  return <span>Import status</span>;
}
const advance = (ms = 4000) => act(() => vi.advanceTimersByTimeAsync(ms));
beforeEach(() => {
  request.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

it('bounds slow status requests and accepts only the currently open job', async () => {
  const pending = deferred<{ job: CampusImport }>();
  request.mockReturnValue(pending.promise);
  const props = fixture();
  await render(<Probe {...props} />);
  await advance(12000);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0].slice(0, 2)).toEqual([
    'import-get',
    { importId: 'import-one', statusOnly: true },
  ]);
  await act(async () => {
    pending.resolve({ job: job('mapping') });
    await pending.promise;
  });
  const update = vi.mocked(props.setJob).mock.calls[0][0];
  if (typeof update !== 'function')
    throw Error('Status update must verify the current import');
  expect(update(props.job)?.status).toBe('mapping');
  const other = job('running', 'import-two');
  expect(update(other)).toBe(other);
  expect(update(null)).toBeNull();
  expect(props.setConfiguration).toHaveBeenCalledWith(job().configuration);
});

it('aborts the previous import and ignores its late success after switching', async () => {
  const pending = deferred<{ job: CampusImport }>();
  request.mockReturnValue(pending.promise);
  const props = fixture();
  const view = await render(<Probe {...props} />);
  await advance();
  const signal = (request.mock.calls[0][2] as { signal: AbortSignal }).signal;
  await view.rerender(<Probe {...props} job={job('running', 'import-two')} />);
  expect(signal.aborted).toBe(true);
  await act(async () => {
    pending.resolve({ job: job('reviewed') });
    await pending.promise;
  });
  expect(props.setJob).not.toHaveBeenCalled();
  expect(props.setNotice).not.toHaveBeenCalled();
});

it('cleans up both the timer and in-flight request when the workspace closes', async () => {
  const pending = deferred<never>();
  request.mockReturnValue(pending.promise);
  const props = fixture();
  const view = await render(<Probe {...props} />);
  await advance();
  const signal = (request.mock.calls[0][2] as { signal: AbortSignal }).signal;
  await view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    pending.reject(new Error('Request cancelled'));
    await Promise.resolve();
  });
  await advance(12000);
  expect(request).toHaveBeenCalledTimes(1);
  expect(props.setError).not.toHaveBeenCalled();
});

it('reports a temporary failure and resumes polling without duplicate requests', async () => {
  request
    .mockRejectedValueOnce(new Error('Temporarily unavailable'))
    .mockResolvedValue({ job: job('reviewed') });
  const props = fixture(job('queued'));
  await render(<Probe {...props} />);
  await advance();
  expect(props.setError).toHaveBeenCalledWith('Temporarily unavailable');
  await advance();
  expect(request).toHaveBeenCalledTimes(2);
  expect(props.setNotice).toHaveBeenCalledWith(
    'Changes are queued. Review source changes before publishing.',
  );
  expect(props.setConfiguration).not.toHaveBeenCalled();
});

it('provides an actionable fallback when a transport rejects without an Error', async () => {
  request.mockRejectedValue('unstructured failure');
  const props = fixture();
  await render(<Probe {...props} />);
  await advance();
  expect(props.setError).toHaveBeenCalledWith(
    'Could not refresh import status.',
  );
});

it.each([
  'draft',
  'mapping',
  'preview',
  'reviewed',
  'cancelled',
  'failed',
] as const)('does not poll an import in %s state', async (status) => {
  await render(<Probe {...fixture(job(status))} />);
  await advance(12000);
  expect(request).not.toHaveBeenCalled();
});
it('does not start a request when no import is open', async () => {
  await render(<Probe {...fixture(null)} />);
  await advance(12000);
  expect(request).not.toHaveBeenCalled();
});
