import { execFileSync } from 'node:child_process';

/** The source commit comes from Git, never caller-supplied provider variables. */
export function releaseSourceRevision(repository) {
  const revision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 1024,
  }).trim();
  releaseSourceFields(revision);
  return revision;
}

export function releaseSourceFields(revision) {
  if (typeof revision !== 'string' || !/^[a-f0-9]{40}$/.test(revision))
    throw Error('Release source revision must be an exact Git commit');
  const environment = { TURNRIGHT_RELEASE_SOURCE_SHA: revision };
  return {
    meta: { turnrightSourceRevision: revision },
    env: environment,
    build: { env: { ...environment } },
  };
}

export function assertDeploymentSource(deployment, revision) {
  // Historical releases have no custom source receipt and remain supported.
  if (revision === undefined) return;
  releaseSourceFields(revision);
  if (deployment.meta?.turnrightSourceRevision !== revision)
    throw Error('Deployment source revision differs from the reviewed preview');
}
