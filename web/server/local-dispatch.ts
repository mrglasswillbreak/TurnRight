/** Local workers are an explicit development transport, never a production fallback. */
export const localWorkflows = {
  'gis-processing.yml': ['campus_id', 'job_id'],
  'map-import.yml': ['campus_id', 'import_id', 'run_token'],
  'source-review.yml': ['campus_id', 'operation_id', 'run_token'],
} as const;

export function validateLocalJob(
  workflow: string,
  inputs: Record<string, string>,
) {
  if (!Object.hasOwn(localWorkflows, workflow))
    throw Error(
      'Cloud publication and external source downloads are disabled in the local editor.',
    );
  const keys = localWorkflows[workflow as keyof typeof localWorkflows];
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs))
    throw Error('Invalid local job inputs.');
  if (
    Object.keys(inputs).some(
      (key) => !(keys as readonly string[]).includes(key),
    )
  )
    throw Error('Unexpected local job input.');
  for (const key of keys) {
    const value = inputs[key];
    if (
      typeof value !== 'string' ||
      !(
        key === 'campus_id'
          ? /^[a-z0-9][a-z0-9-]{0,79}$/
          : /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
      ).test(value)
    )
      throw Error('Invalid local job identity.');
  }
}

export function localDispatchConfiguration(env: NodeJS.ProcessEnv) {
  if (env.TURNRIGHT_LOCAL_RUNTIME !== '1') return null;
  if (env.VERCEL || env.NODE_ENV === 'production')
    throw Error('Local workers cannot run in production.');
  const target = new URL(env.TURNRIGHT_LOCAL_DISPATCH_URL || '');
  const service = new URL(env.SUPABASE_URL || '');
  if (
    target.href !== 'http://127.0.0.1:5180/__local/jobs' ||
    service.origin !== 'http://127.0.0.1:54321' ||
    !/^[a-f0-9]{64}$/.test(env.TURNRIGHT_LOCAL_DISPATCH_TOKEN || '')
  )
    throw Error('Local dispatch requires isolated loopback services.');
  return { url: target.href, token: env.TURNRIGHT_LOCAL_DISPATCH_TOKEN! };
}

export function isLocalPublishedOrigin(url: URL, env: NodeJS.ProcessEnv) {
  return (
    url.href === 'http://127.0.0.1:5180/' && !!localDispatchConfiguration(env)
  );
}
