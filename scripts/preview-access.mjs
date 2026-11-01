/** Temporary access is scoped to one recorded CI or local execution identity. */
export function temporaryAccessNote(
  environment = process.env,
  cleanup = false,
) {
  const prefix = 'Temporary campus release check ';
  if (environment.GITHUB_ACTIONS === 'true') {
    const run = cleanup
      ? environment.CLEANUP_RUN_ID || environment.GITHUB_RUN_ID
      : environment.GITHUB_RUN_ID;
    if (!/^[0-9]{1,20}$/.test(run || ''))
      throw Error(
        'A valid workflow run identity is required for temporary access',
      );
    return prefix + run;
  }
  if (environment.CLEANUP_RUN_ID)
    throw Error(
      'Workflow cleanup identities cannot be used by a local execution',
    );
  const run = environment.TURNRIGHT_LOCAL_RUN_ID;
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(run || ''))
    throw Error(
      'A recorded TURNRIGHT_LOCAL_RUN_ID UUID is required for temporary access',
    );
  return prefix + 'local:' + run;
}

export function maskTemporaryAccessSecret(
  secret,
  environment = process.env,
  log = console.log,
) {
  // Workflow commands hide credentials only in the real Actions log processor.
  if (environment.GITHUB_ACTIONS === 'true') log('::add-mask::' + secret);
}

export async function cleanupTemporaryAccess(
  api,
  environment = process.env,
  log = console.log,
) {
  const note = temporaryAccessNote(environment, true);
  const project = await api(
    '/v9/projects/' + encodeURIComponent(environment.VERCEL_PROJECT_ID),
  );
  let revoked = 0;
  for (const [secret, metadata] of Object.entries(
    project.protectionBypass || {},
  )) {
    if (metadata?.note !== note) continue;
    maskTemporaryAccessSecret(secret, environment, log);
    await api(
      '/v1/projects/' +
        encodeURIComponent(environment.VERCEL_PROJECT_ID) +
        '/protection-bypass',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revoke: { secret, regenerate: false } }),
      },
    );
    revoked++;
  }
  log(
    'Preview credential cleanup complete (' +
      revoked +
      ' remaining credentials revoked)',
  );
  return revoked;
}
