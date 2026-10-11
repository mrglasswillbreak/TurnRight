import { currentCampusId, scopeDatabaseRequest } from './campus-scope.js';
import { createHash } from 'node:crypto';
export interface RequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
}
export interface ResponseLike {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public dependency?: string,
    public upstreamStatus?: number,
  ) {
    super(message);
  }
}
/** Map upstream transport failures to availability, never to an expired identity. */
async function serviceRequest(url: string, init: RequestInit, dependency: string) {
  try {
    const response = await fetch(url, init);
    let validJson = true;
    const result: any = await response.json().catch(() => {
      validJson = false;
      return null;
    });
    return { response, result, validJson };
  } catch {
    throw new HttpError(
      503,
      'The service is temporarily unavailable. Your local work is retained. Check Activity before retrying a change.',
      dependency,
    );
  }
}
export function requireConfig() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new HttpError(
      503,
      'The backend is not connected yet. Follow docs/DEPLOYMENT.md to configure Supabase.',
    );
}
export async function db<T = any>(
  path: string,
  method = 'GET',
  body?: unknown,
  prefer = 'return=representation',
): Promise<T> {
  requireConfig();
  ({ path, body } = scopeDatabaseRequest(path, method, body));
  const { response, result, validJson } = await serviceRequest(
    `${process.env.SUPABASE_URL}/rest/v1/${path}`,
    {
      method,
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: prefer,
        'X-TurnRight-Campus': currentCampusId(),
      },
      ...(body !== undefined && method !== 'GET' ? { body: JSON.stringify(body) } : {}),
      // The import RPC has a 60-second database budget (migration 017).
      signal: AbortSignal.timeout(path.startsWith('rpc/gis_') ? 75000 : 20000),
    },
    'database',
  );
  if (!response.ok)
    throw new HttpError(
      [401, 403, 404, 409, 413].includes(response.status)
        ? response.status
        : response.status >= 500
          ? 503
          : 400,
      response.status >= 500
        ? 'The database is temporarily unavailable. Your local work is retained. Check Activity before retrying a change.'
        : result?.message || 'Database request failed.',
      'database',
      response.status,
    );
  if (!validJson && response.status !== 204)
    throw new HttpError(
      503,
      'The database returned an incomplete response. Your local work is retained.',
      'database',
      response.status,
    );
  return result;
}
export async function allRows(table: string, filter = '') {
  const rows: any[] = [];
  for (let offset = 0; offset < 300000; offset += 1000) {
    const page = await db(
      `${table}?select=*&order=${table === 'map_edits' ? 'id,kind' : 'id'}&limit=1000&offset=${offset}${filter}`,
    );
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
  throw new HttpError(413, 'Dataset exceeds the supported campus size.');
}
export async function requireIdentity(req: RequestLike) {
  requireConfig();
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer '))
    throw new HttpError(401, 'Sign in as the map administrator.');
  const { response, result: user } = await serviceRequest(
    `${process.env.SUPABASE_URL}/auth/v1/user`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: header,
      },
      signal: AbortSignal.timeout(10000),
    },
    'authentication',
  );
  if ([401, 403].includes(response.status))
    throw new HttpError(401, 'Your session expired. Sign in again.');
  if (!response.ok || typeof user?.id !== 'string')
    throw new HttpError(
      503,
      'Sign-in verification is temporarily unavailable. Your local work is retained. Retry the connection shortly.',
      'authentication',
      response.status,
    );
  return user;
}
export function bodyOf(req: RequestLike, limit = 100000) {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST');
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    throw new HttpError(400, 'Invalid JSON request.');
  }
  if (!body || JSON.stringify(body).length > limit)
    throw new HttpError(413, 'Request is too large.');
  return body;
}
export function fail(
  res: ResponseLike,
  error: unknown,
  context?: { requestId: string; action?: string },
) {
  const status = error instanceof HttpError ? error.status : 500;
  if (status >= 500) {
    // Do not log tokens, query strings, payloads, raw upstream errors or user data.
    console.error('admin-request-failed', {
      status,
      requestId: context?.requestId,
      action: /^[a-z-]{1,64}$/.test(context?.action || '') ? context?.action : undefined,
      dependency: error instanceof HttpError ? error.dependency : undefined,
      upstreamStatus: error instanceof HttpError ? error.upstreamStatus : undefined,
    });
    res.setHeader('Retry-After', '5');
  }
  const message =
    error instanceof HttpError
      ? error.message
      : 'The operation could not be confirmed. Your local work is retained. Check Activity before retrying a change.';
  res.status(status).json({
    error: message + (status >= 500 && context ? ' Reference: ' + context.requestId : ''),
    ...(context ? { requestId: context.requestId } : {}),
  });
}
export function privateHeaders(res: ResponseLike) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export async function dispatch(workflow: string, inputs: Record<string, string> = {}) {
  if (!process.env.GITHUB_WORKFLOW_TOKEN || !process.env.GITHUB_REPOSITORY)
    throw new HttpError(
      503,
      'Configure the GitHub workflow token and repository to run imports and releases.',
    );
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_WORKFLOW_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new HttpError(
      502,
      'GitHub could not start the job. Check workflow permissions and available Actions minutes.',
    );
}
