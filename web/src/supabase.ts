import { createClient } from '@supabase/supabase-js';
import { adminRequest, boundedSession } from './admin-client';
const url = import.meta.env.VITE_SUPABASE_URL,
  anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && anon ? createClient(url, anon) : null;
export async function api<T = unknown>(
  action: string,
  payload: unknown = {},
): Promise<T> {
  const session = supabase
    ? (await boundedSession(action, supabase.auth.getSession())).data.session
    : null;
  return adminRequest<T>(action, payload, session?.access_token);
}
