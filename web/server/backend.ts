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
  ) {
    super(message);
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
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: prefer,
      'X-TurnRight-Campus': currentCampusId(),
    },
    ...(body !== undefined && method !== 'GET'
      ? { body: JSON.stringify(body) }
      : {}),
    // The import RPC has a 60-second database budget (migration 017).
    signal: AbortSignal.timeout(
      path === 'rpc/queue_campus_import' || path.startsWith('rpc/gis_')
        ? 75000
        : 20000,
    ),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new HttpError(
      [401, 403, 404, 409, 413].includes(response.status)
        ? response.status
        : response.status >= 500
          ? 503
          : 400,
      result?.message ||
        'Database request failed. Check service availability and quotas.',
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
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: header,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new HttpError(401, 'Your session expired. Sign in again.');
  const user = await response.json();
  if (typeof user.id !== 'string')
    throw new HttpError(401, 'Invalid identity.');
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
export function fail(res: ResponseLike, error: unknown) {
  res.status(error instanceof HttpError ? error.status : 500).json({
    error:
      error instanceof HttpError
        ? error.message
        : 'The operation failed. Check the server logs and retry.',
  });
}
export function privateHeaders(res: ResponseLike) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
export const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export async function dispatch(
  workflow: string,
  inputs: Record<string, string> = {},
) {
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
