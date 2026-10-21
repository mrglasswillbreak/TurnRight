import { fail, type ResponseLike } from './backend.js';
import { flushErrorMonitoring } from './error-monitoring.mjs';

/** Complete bounded delivery before ending the HTTP response on serverless hosts. */
export async function monitoredFailure(
  res: ResponseLike,
  error: unknown,
  context: { requestId: string; action?: string; startedAt?: number },
) {
  let body: unknown;
  const buffered: ResponseLike = {
    status(code) {
      res.status(code);
      return buffered;
    },
    setHeader(name, value) {
      res.setHeader(name, value);
    },
    json(value) {
      body = value;
    },
  };
  fail(buffered, error, context);
  await flushErrorMonitoring();
  res.json(body);
}
