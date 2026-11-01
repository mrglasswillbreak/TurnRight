import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { vercelApi, withDeploymentAccess } from './vercel-api.mjs';
import { verifyDeploymentHealth } from './deployment-health.mjs';

assert(
  !process.env.RELEASE_ID,
  'Choose an application preview or a campus release, not both.',
);
const id = process.env.APPLICATION_DEPLOYMENT_ID;
assert(
  id && /^[a-zA-Z0-9_-]+$/.test(id),
  'Choose a Vercel application deployment ID.',
);
const deployment = await vercelApi(`/v13/deployments/${id}`);
assert.equal(deployment.projectId, process.env.VERCEL_PROJECT_ID);
assert.equal(deployment.readyState, 'READY');
const revision = deployment.meta?.githubCommitSha || deployment.gitSource?.sha;
assert.match(revision || '', /^[a-f0-9]{40}$/);
const origin = `https://${deployment.url}`;
const output = path.resolve('web/work/campus-detail-verification');
await mkdir(output, { recursive: true });
async function run(script, args, env, cwd = process.cwd()) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(Error(`Application verification exited ${code}`)),
    );
  });
}
await withDeploymentAccess(
  origin,
  async (headers) => {
    await verifyDeploymentHealth(origin, revision, headers);
    const denied = await fetch(origin + '/api/admin', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'workspace-capabilities', payload: {} }),
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(
      denied.status,
      401,
      'Anonymous administration must remain denied',
    );
    const env = {
      ...process.env,
      VERIFY_ORIGIN: origin,
      VERIFY_BYPASS: headers['x-vercel-protection-bypass'],
      VERIFY_SCOPE: 'all',
    };
    await run(
      'scripts/audit-public-packages.mjs',
      [
        path.join(output, 'package-preservation.json'),
        'docs/assets/licensing-public-baseline-2026-10-18.json',
      ],
      env,
    );
    await run('scripts/verify-campus-detail.mjs', [], env, path.resolve('web'));
    await writeFile(
      path.join(output, 'application-preview.json'),
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          deploymentId: id,
          origin,
          revision,
          verifierRevision: process.env.GITHUB_SHA,
          anonymousAdmin: denied.status,
          health: 'ok',
          publishedPackagesPreserved: true,
          campusPublicationPerformed: false,
        },
        null,
        2,
      ) + '\n',
    );
  },
  id,
);
console.log(
  'Application preview verified; temporary deployment access revoked.',
);
