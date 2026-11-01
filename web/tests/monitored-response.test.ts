import { afterEach, expect, it, vi } from 'vitest';
import { monitoredFailure } from '../server/monitored-response';
import { HttpError, type ResponseLike } from '../server/backend';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('keeps the response open until private delivery completes and preserves the original safe failure', async () => {
  vi.stubEnv('ERROR_MONITORING_ENABLED', 'true');
  vi.stubEnv('SUPABASE_URL', 'https://monitoring.example');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let complete!: (response: Response) => void;
  const delivery = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  const transport = vi.fn().mockReturnValue(delivery);
  vi.stubGlobal('fetch', transport);
  const response: ResponseLike = {
    status: vi.fn(() => response),
    setHeader: vi.fn(),
    json: vi.fn(),
  };
  const context = {
    requestId: '11111111-1111-4111-8111-111111111111',
    action: 'state',
  };
  const finished = monitoredFailure(
    response,
    new HttpError(503, 'Try again.', 'database'),
    context,
  );
  await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce());
  expect(response.json).not.toHaveBeenCalled();
  complete(new Response(null, { status: 503 }));
  await finished;
  expect(response.status).toHaveBeenCalledWith(503);
  expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '5');
  expect(response.json).toHaveBeenCalledWith({
    error: `Try again. Reference: ${context.requestId}`,
    requestId: context.requestId,
  });
});

it('returns validation failures without sending monitoring traffic', async () => {
  const transport = vi.fn();
  vi.stubGlobal('fetch', transport);
  const response: ResponseLike = {
    status: vi.fn(() => response),
    setHeader: vi.fn(),
    json: vi.fn(),
  };
  await monitoredFailure(response, new HttpError(400, 'Invalid request.'), {
    requestId: 'test',
  });
  expect(transport).not.toHaveBeenCalled();
  expect(response.status).toHaveBeenCalledWith(400);
  expect(response.json).toHaveBeenCalledWith({
    error: 'Invalid request.',
    requestId: 'test',
  });
});
