import { createClient } from '@supabase/supabase-js';
import { adminRequest, boundedSession } from './admin-client';
const url = import.meta.env.VITE_SUPABASE_URL,
  anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && anon ? createClient(url, anon) : null;
/** Signed uploads use their scoped token and an isolated, abortable transport. */
export async function uploadPhotoOriginal(
  signed: { bucket: string; path: string; token: string },
  file: File,
  signal: AbortSignal,
) {
  if (!url || !anon) throw Error('Private uploads are not configured.');
  signal.throwIfAborted();
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
  const client = createClient(url, anon, {
    auth: {
      storageKey: `turnright-isolated-upload-${crypto.randomUUID()}`,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: bounded }),
    },
  });
  return client.storage
    .from(signed.bucket)
    .uploadToSignedUrl(signed.path, signed.token, file, {
      contentType: file.type,
    });
}
export async function api<T = unknown>(
  action: string,
  payload: unknown = {},
  options: Parameters<typeof adminRequest>[3] = {},
): Promise<T> {
  const session = supabase
    ? (await boundedSession(action, supabase.auth.getSession())).data.session
    : null;
  options.signal?.throwIfAborted();
  return adminRequest<T>(action, payload, session?.access_token, options);
}
