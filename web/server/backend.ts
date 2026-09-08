import { createHash } from "node:crypto";
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
      "The backend is not connected yet. Follow docs/DEPLOYMENT.md to configure Supabase.",
    );
}
export async function db<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
  prefer = "return=representation",
): Promise<T> {
  requireConfig();
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    ...(body !== undefined && method !== "GET" ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new HttpError(
      response.status >= 500 ? 503 : 400,
      result?.message || "Database request failed. Check service availability and quotas.",
    );
  return result;
}
export async function allRows(table: string) {
  const rows: any[] = [];
  for (let offset = 0; offset < 30000; offset += 1000) {
    const page = await db(`${table}?select=*&order=id&limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
  throw new HttpError(413, "Dataset exceeds the supported campus size.");
}
export async function requireAdmin(req: RequestLike) {
  requireConfig();
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer "))
    throw new HttpError(401, "Sign in as the map administrator.");
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: header },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new HttpError(401, "Your session expired. Sign in again.");
  const user = await response.json();
  const expected = process.env.ADMIN_USER_ID;
  if (!expected || user.id !== expected)
    throw new HttpError(403, "This account does not have editor access.");
  const allowed = await db(`admin_users?id=eq.${encodeURIComponent(user.id)}&select=id`);
  if (!allowed.length) throw new HttpError(403, "Administrator allowlist is not configured.");
  return user;
}
export function bodyOf(req: RequestLike, limit = 100000) {
  if (req.method !== "POST") throw new HttpError(405, "Use POST");
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  if (!body || JSON.stringify(body).length > limit)
    throw new HttpError(413, "Request is too large.");
  return body;
}
export function fail(res: ResponseLike, error: unknown) {
  res.status(error instanceof HttpError ? error.status : 500).json({
    error:
      error instanceof HttpError
        ? error.message
        : "The operation failed. Check the server logs and retry.",
  });
}
export function privateHeaders(res: ResponseLike) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export async function dispatch(workflow: string, inputs: Record<string, string> = {}) {
  if (!process.env.GITHUB_WORKFLOW_TOKEN || !process.env.GITHUB_REPOSITORY)
    throw new HttpError(
      503,
      "Configure the GitHub workflow token and repository to run imports and releases.",
    );
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_WORKFLOW_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new HttpError(
      502,
      "GitHub could not start the job. Check workflow permissions and available Actions minutes.",
    );
}
