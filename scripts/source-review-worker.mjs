import { db } from './cloud.mjs';
import { emitEvent } from '../web/server/diagnostics.mjs';

export async function runSourceReview({
  operationId,
  token,
  request = db,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  budgetMs = 18 * 60000,
}) {
  const started = now();
  try {
    for (;;) {
      if (now() - started > budgetMs)
        throw Error(
          'Worker time limit reached. Resume unfinished decisions from Source updates.',
        );
      let result;
      for (let attempt = 0; ; attempt++) {
        try {
          result = await request('rpc/source_review_step', 'POST', {
            operation_id: operationId,
            token,
          });
          break;
        } catch (error) {
          if (attempt >= 4 || /cancelled or replaced/i.test(error.message))
            throw error;
          await delay(Math.min(1000 * 2 ** attempt, 8000));
        }
      }
      if (!['queued', 'running'].includes(result.status)) return result;
      // Yield between short transactions so imports, editing and Auth have room.
      await delay(100);
    }
  } catch (error) {
    await request('rpc/source_review_fail', 'POST', {
      operation_id: operationId,
      token,
      reason: error.message,
    }).catch(() => {});
    throw error;
  }
}

if (process.env.SOURCE_REVIEW_OPERATION_ID) {
  const startedAt = Date.now();
  const operationId = process.env.SOURCE_REVIEW_OPERATION_ID,
    token = process.env.SOURCE_REVIEW_RUN_TOKEN;
  if (
    ![operationId, token].every((value) => /^[a-f0-9-]{36}$/i.test(value || ''))
  )
    throw Error('Valid review operation and run token required');
  try {
    const result = await runSourceReview({ operationId, token });
    emitEvent(
      result.status === 'failed' ? 'worker-failed' : 'worker-completed',
      {
        worker: 'source-review',
        jobId: operationId,
        startedAt,
        status: result.status === 'failed' ? 500 : 200,
      },
    );
    if (result.status === 'failed') process.exitCode = 1;
  } catch {
    emitEvent('worker-failed', {
      worker: 'source-review',
      jobId: operationId,
      startedAt,
      status: 500,
      dependency: 'database',
    });
    process.exitCode = 1;
  }
}
