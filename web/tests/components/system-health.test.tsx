import { act, StrictMode } from 'react';
import '../../src/styles.css';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import SystemHealth from '../../src/SystemHealth';
import { SystemHealthButton } from '../../src/SystemHealthButton';
import { render, deferred } from './render';
import { click } from './interact';
const request = vi.hoisted(() => vi.fn());
vi.mock('../../src/supabase', () => ({ api: request }));
afterEach(() => vi.resetAllMocks());
const group = {
  fingerprint: 'a'.repeat(32),
  event: 'worker-failed',
  component: 'gis',
  dependency: 'worker',
  status: 500,
  revision: 'a'.repeat(40),
  first_seen: '2026-10-21T10:00:00Z',
  last_seen: '2026-10-21T10:05:00.123456Z',
  occurrences: 8,
  recent_count: 6,
  last_reference: '11111111-1111-4111-8111-111111111111',
  resolved_at: null,
};
const summary = (groups: unknown[]) => ({
  checkedAt: '2026-10-21T10:06:00Z',
  groups,
});

it('shows grouped failures and recurrence alerts, resolves the exact observed version and retains stale results on outages', async () => {
  request.mockResolvedValue(summary([group]));
  await render(<SystemHealth />);
  await expect
    .element(page.getByText('gis failure (500)', { exact: true }))
    .toBeVisible();
  await expect
    .poll(() => page.getByRole('alert').element().textContent)
    .toContain('Repeated failure: 6 occurrences');
  request
    .mockResolvedValueOnce({ resolved: true })
    .mockResolvedValueOnce(
      summary([{ ...group, resolved_at: '2026-10-21T10:07:00Z' }]),
    );
  await click('Mark resolved');
  expect(request).toHaveBeenCalledWith(
    'monitoring-resolve',
    { fingerprint: group.fingerprint, lastSeen: group.last_seen },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  await expect
    .poll(() => page.getByRole('status').element().textContent)
    .toBe('0 unresolved groups');
  request.mockRejectedValueOnce(Error('Storage temporarily unavailable'));
  await click('Refresh');
  await expect
    .poll(() => page.getByRole('alert').element().textContent)
    .toContain('Storage temporarily unavailable');
  await expect
    .element(page.getByText('gis failure (500)', { exact: true }))
    .toBeVisible();
  request.mockResolvedValue(summary([]));
  await click('Refresh');
  await expect
    .element(page.getByText('No retained failures.', { exact: true }))
    .toBeVisible();
});

it('keeps conflicts visible, distinguishes delivery probes and aborts pending work on close', async () => {
  request.mockResolvedValue(summary([group]));
  const view = await render(<SystemHealth />);
  request.mockRejectedValueOnce(
    Error('This group changed. Refresh before marking it resolved.'),
  );
  await click('Mark resolved');
  await expect
    .element(page.getByRole('alert').filter({ hasText: 'This group changed' }))
    .toBeVisible();
  request.mockResolvedValue(
    summary([
      {
        ...group,
        event: 'monitoring-probe',
        recent_count: 0,
        last_reference: null,
      },
    ]),
  );
  await click('Refresh');
  await expect
    .element(page.getByText('Monitoring delivery check', { exact: true }))
    .toBeVisible();
  const waiting = deferred<unknown>();
  request.mockReturnValue(waiting.promise);
  await click('Refresh');
  const signal = request.mock.calls.at(-1)![2].signal as AbortSignal;
  await view.unmount();
  expect(signal.aborted).toBe(true);
  await act(() => waiting.resolve(summary([])));
});

it('opens the owner monitoring dialog on demand and returns to the workspace', async () => {
  request.mockResolvedValue(summary([]));
  await render(<SystemHealthButton />);
  expect(request).not.toHaveBeenCalled();
  await click('System health');
  await expect.element(page.getByRole('dialog')).toBeVisible();
  await expect
    .element(page.getByText('No retained failures.', { exact: true }))
    .toBeVisible();
  await click('Close');
  await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
});

it('starts a fresh request after Strict Mode aborts the first effect', async () => {
  const first = deferred<unknown>();
  request.mockReturnValueOnce(first.promise).mockResolvedValue(summary([]));
  await render(
    <StrictMode>
      <SystemHealth />
    </StrictMode>,
  );
  await expect
    .element(page.getByText('No retained failures.', { exact: true }))
    .toBeVisible();
  expect(request.mock.calls[0][2].signal.aborted).toBe(true);
  expect(request.mock.calls[1][2].signal.aborted).toBe(false);
  await act(() => first.resolve(summary([group])));
  await expect
    .element(page.getByText('No retained failures.', { exact: true }))
    .toBeVisible();
});
