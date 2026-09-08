import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL,
  anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && anon ? createClient(url, anon) : null;
export async function api<T = unknown>(action: string, payload: unknown = {}): Promise<T> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const response = await fetch("/api/admin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ action, payload }),
  });
  const body = await response
    .json()
    .catch(() => ({
      error:
        "The backend is not configured. Follow the deployment guide to connect Vercel and Supabase.",
    }));
  if (!response.ok || body.error) throw new Error(body.error || "Request failed");
  return body;
}
