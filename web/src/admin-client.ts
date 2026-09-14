export class AdminRequestError extends Error {
  constructor(
    public action: string,
    message: string,
    public status = 0,
    public reason:
      | 'network'
      | 'timeout'
      | 'auth'
      | 'server'
      | 'response' = 'server',
  ) {
    super(message);
  }
}
const readable = new Set([
  'state',
  'sources',
  'review-baseline',
  'export',
  'survey-list',
  'survey-get',
  'review-status',
]);
export function isConnectionFailure(error: unknown) {
  return (
    error instanceof AdminRequestError &&
    ['network', 'timeout', 'response', 'server'].includes(error.reason) &&
    (error.status === 0 ||
      error.status >= 500 ||
      (error.reason === 'response' &&
        error.status >= 200 &&
        error.status < 300))
  );
}
export async function boundedSession<T>(
  action: string,
  session: Promise<T>,
  timeoutMs = 10_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      session,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new AdminRequestError(
                action,
                'Could not refresh your session. Your local work is retained.',
                0,
                'timeout',
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export async function adminRequest<T>(
  action: string,
  payload: unknown,
  token?: string,
  options: {
    timeoutMs?: number;
    retries?: number;
    fetcher?: typeof fetch;
    delay?: (ms: number) => Promise<void>;
  } = {},
): Promise<T> {
  const fetcher = options.fetcher || fetch;
  const retries =
    readable.has(action) || action === 'save-edits'
      ? (options.retries ?? 1)
      : 0;
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 30_000,
    );
    try {
      const response = await fetcher('/api/admin', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action, payload }),
      });
      if (response.status === 401 || response.status === 403)
        throw new AdminRequestError(
          action,
          response.status === 401
            ? 'Your session has expired. Sign in again; your local work is retained.'
            : 'This account cannot access the owner workspace.',
          response.status,
          'auth',
        );
      const body = await response.json().catch((error: unknown) => {
        if (controller.signal.aborted) throw error;
        throw new AdminRequestError(
          action,
          'The server returned an unexpected response. Your local work is retained.',
          response.status,
          'response',
        );
      });
      if (body === null || typeof body !== 'object')
        throw new AdminRequestError(
          action,
          'The server returned an incomplete response. Your local work is retained.',
          response.status,
          'response',
        );
      if (!response.ok || body?.error)
        throw new AdminRequestError(
          action,
          body?.error || 'The server could not complete this action.',
          response.status,
        );
      return body;
    } catch (error) {
      const failure =
        error instanceof AdminRequestError
          ? error
          : new AdminRequestError(
              action,
              controller.signal.aborted
                ? 'The request timed out. Your local work is retained.'
                : 'Could not reach the server. Your local work is retained.',
              0,
              controller.signal.aborted ? 'timeout' : 'network',
            );
      if (attempt >= retries || !isConnectionFailure(failure)) throw failure;
    } finally {
      clearTimeout(timer);
    }
    await (
      options.delay ||
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    )(1000 * (attempt + 1));
  }
}
