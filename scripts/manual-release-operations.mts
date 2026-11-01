/** Bounded child workers and release-specific readbacks. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { db } from '../web/server/backend';
import { withCampusId } from '../web/server/campus-scope';
import { vercelApi } from './vercel-api.mjs';
import {
  requireManual,
  sha256,
  assertNoConflictingReleases,
} from './manual-release-request.mjs';
import { assertNoCompetingWork } from './manual-release-provenance.mjs';
import { manualDeploymentProvenance } from './manual-release-deployment.mjs';
import type { Receipt } from './model-proposal-reconciliation-input.mts';
type Journal = {
  directory: string;
  append: (stage: string, details?: object) => Promise<unknown>;
  intent: (stage: string, details?: object) => Promise<void>;
};
export async function noCompetingManualWork(allowedReleaseId?: string) {
  const campuses = await db<{ id: string }[]>('campuses?select=id&limit=101');
  requireManual(
    Array.isArray(campuses) && campuses.length > 0 && campuses.length <= 100,
    'CAMPUS_SET',
  );
  const read = async () => {
    const jobs = [];
    for (const campus of campuses) {
      const rows = await withCampusId(campus.id, () =>
        db<unknown[]>(
          'jobs?status=in.(queued,running)&select=id,kind,status&limit=100',
        ),
      );
      requireManual(Array.isArray(rows), 'JOBS_RESPONSE');
      jobs.push(...rows);
      const releases = await withCampusId(campus.id, () =>
        db(
          'releases?status=in.(queued,building)&select=id,campus_id,status&limit=100',
        ),
      );
      assertNoConflictingReleases(releases, campus.id, allowedReleaseId);
    }
    return jobs;
  };
  return assertNoCompetingWork(read, vercelApi, process.env.VERCEL_PROJECT_ID);
}
export async function assertReleasePin(
  release: Record<string, string>,
  reviewId: string,
  expectedMainCommit: string,
) {
  const rows = await db<Record<string, string>[]>(
    'releases?id=eq.' +
      release.id +
      '&select=id,campus_id,status,review_id,version,deployment_id,preview_url',
  );
  const actual = rows[0];
  requireManual(
    rows.length === 1 &&
      actual.campus_id === 'lasu' &&
      actual.status === 'preview' &&
      actual.review_id === reviewId &&
      actual.version === release.version &&
      actual.deployment_id === release.deploymentId &&
      actual.preview_url === release.origin,
    'LIVE_RELEASE_CHANGED',
  );
  const deployment = await vercelApi(
    '/v13/deployments/' + encodeURIComponent(release.deploymentId),
  );
  requireManual(
    deployment.id === release.deploymentId &&
      deployment.projectId === process.env.VERCEL_PROJECT_ID &&
      deployment.readyState === 'READY' &&
      'https://' + deployment.url === release.origin,
    'LIVE_DEPLOYMENT_CHANGED',
  );
  return {
    ...actual,
    sourceProvenance: manualDeploymentProvenance(
      deployment,
      expectedMainCommit,
    ),
  };
}
export async function assertOwnerAndModels(
  apply: Receipt,
  expectedHash: string,
) {
  const owners = await db<{ id: string }[]>('admin_users?select=id&limit=2');
  requireManual(
    owners.length === 1 && owners[0].id === apply.owner,
    'ORIGINAL_OWNER',
  );
  requireManual(
    (await db('rpc/gis_workspace_content_hash', 'POST', {})) === expectedHash,
    'WORKSPACE_CHANGED',
  );
}
export function manualSchedule(
  expected: 'preview' | 'publish',
  journal: Journal,
) {
  let intent: Record<string, string> | undefined;
  return {
    async schedule(workflow: string, inputs: Record<string, string> = {}) {
      requireManual(
        !intent &&
          workflow === 'release.yml' &&
          inputs.campus_id === 'lasu' &&
          inputs.operation === expected &&
          /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(
            inputs.release_id,
          ) &&
          Object.keys(inputs).sort().join() ===
            'campus_id,operation,release_id',
        'WORKER_INTENT',
      );
      await journal.intent('worker-scheduled', {
        workflow,
        inputs,
        githubDispatch: false,
      });
      intent = { ...inputs };
    },
    take() {
      requireManual(intent, 'WORKER_NOT_SCHEDULED');
      return intent!;
    },
  };
}
export async function writeManualResult(
  journal: Journal,
  name: string,
  value: unknown,
) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  const filename = path.join(journal.directory, name + '.json');
  const handle = await fs.open(filename, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { path: filename, sha256: sha256(bytes) };
}
export async function runManualWorker(
  script: string,
  repository: string,
  environment: NodeJS.ProcessEnv,
  journal: Journal,
  name: string,
  timeoutMs: number,
  cwd = path.join(repository, 'web'),
) {
  requireManual(
    [
      'scripts/release.mts',
      'scripts/verify-release-preview.mjs',
      'scripts/cleanup-preview-access.mjs',
    ].includes(script),
    'FIXED_WORKER',
  );
  const log = await fs.open(
    path.join(journal.directory, name + '.log'),
    'wx',
    0o600,
  );
  const loader = createRequire(path.join(repository, 'package.json')).resolve(
    'tsx',
  );
  const child = spawn(
    process.execPath,
    ['--import', loader, path.join(repository, script)],
    {
      cwd,
      env: environment,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let size = 0,
    interrupted = false,
    writeFailure = false,
    chain = Promise.resolve(),
    killTimer: NodeJS.Timeout | undefined;
  const digest = createHash('sha256');
  const stop = () => {
    interrupted = true;
    try {
      process.kill(-child.pid!, 'SIGTERM');
    } catch {
      /* Already exited. */
    }
    killTimer ||= setTimeout(() => {
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        /* Exited. */
      }
    }, 15000);
  };
  const capture = (bytes: Buffer) => {
    size += bytes.length;
    if (size > 128 * 1024 * 1024) {
      writeFailure = true;
      stop();
      return;
    }
    digest.update(bytes);
    chain = chain
      .then(async () => {
        await log.writeFile(bytes);
      })
      .catch(() => {
        writeFailure = true;
        stop();
      });
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  const timer = setTimeout(stop, timeoutMs);
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  const result = await new Promise<{
    code: number | null;
    signal: string | null;
  }>((resolve) => {
    child.once('error', () => resolve({ code: null, signal: 'SPAWN_ERROR' }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timer);
  clearTimeout(killTimer);
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
  await chain;
  await log.sync();
  await log.close();
  await journal.append('worker-result', {
    script,
    name,
    ...result,
    interrupted,
    writeFailure,
    log: { name: name + '.log', bytes: size, sha256: digest.digest('hex') },
  });
  requireManual(
    result.code === 0 &&
      result.signal === null &&
      !interrupted &&
      !writeFailure,
    'WORKER_UNCERTAIN_INSPECT',
  );
}
