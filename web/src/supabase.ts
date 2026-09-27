import { createClient } from '@supabase/supabase-js';
import { adminRequest, boundedSession } from './admin-client';
import { requestedCampus } from './campus-context';
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
  const result = await client.storage
    .from(signed.bucket)
    .uploadToSignedUrl(signed.path, signed.token, file, {
      contentType: file.type,
    });
  if (result.error) throw result.error;
  return result;
}
export async function api<T = unknown>(
  action: string,
  payload: unknown = {},
  options: Parameters<typeof adminRequest>[3] = {},
): Promise<T> {
  const campus = requestedCampus();
  const session = supabase
    ? (await boundedSession(action, supabase.auth.getSession())).data.session
    : null;
  options.signal?.throwIfAborted();
  const tracked =
    /^(prepare-release|publish-release|rollback|refresh-source|import-run|import-upload|import-queue|media-process|media-approve|model-upload|model-save|survey-upload)$/.test(
      action,
    )
      ? (await import('./process-monitor')).processes.begin(
          action.replaceAll('-', ' '),
          'Waiting for server',
        )
      : undefined;
  try {
    const result = await adminRequest<T>(
      action,
      payload,
      session?.access_token,
      options,
      campus,
    );
    tracked?.finish(
      /release|import-run|rollback/.test(action)
        ? 'Request accepted; background job status appears in Activity'
        : 'Complete',
    );
    return result;
  } catch (error) {
    tracked?.fail(error);
    throw error;
  }
}
