import { expect, it, vi } from 'vitest';
// @ts-expect-error The deployment worker deliberately uses dependency-free JavaScript.
import { runSourceReview } from '../../scripts/source-review-worker.mjs';

it('retries the same durable operation after an unknown outcome without uploading geometry', async () => {
  let calls = 0;
  const request = vi.fn(
    async (path: string, _method: string, body: unknown) => {
      expect(path).toBe('rpc/source_review_step');
      expect(body).toEqual({ operation_id: 'operation', token: 'token' });
      calls++;
      if (calls === 1) throw Error('Response lost');
      return {
        status: calls === 2 ? 'running' : 'completed',
        applied: calls === 2 ? 25 : 50,
      };
    },
  );
  expect(
    await runSourceReview({
      operationId: 'operation',
      token: 'token',
      request,
      delay: async () => {},
    }),
  ).toMatchObject({ status: 'completed', applied: 50 });
  expect(request).toHaveBeenCalledTimes(3);
});
it('stops on cancellation and records an exhausted worker without looping indefinitely', async () => {
  const cancelled = vi.fn(async () => ({ status: 'cancelled' }));
  await runSourceReview({
    operationId: 'operation',
    token: 'token',
    request: cancelled,
  });
  expect(cancelled).toHaveBeenCalledTimes(1);
  const failed = vi.fn(async (path: string) => {
    if (path.endsWith('_fail')) return;
    throw Error('Unavailable');
  });
  await expect(
    runSourceReview({
      operationId: 'operation',
      token: 'token',
      request: failed,
      delay: async () => {},
    }),
  ).rejects.toThrow('Unavailable');
  expect(failed).toHaveBeenCalledTimes(6);
});
