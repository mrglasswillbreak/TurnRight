/** Exact local-main provenance and live exclusion checks. Never changes Git refs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  currentManualValidationIdentity,
  assertManualValidationReceipt,
} from './manual-release-validation.mjs';
import {
  requireManual,
  assertEquivalentSource,
  assertExclusiveWindow,
  filePin,
} from './manual-release-request.mjs';
import { readPinnedFile } from './manual-release-journal.mjs';
const json = (bytes) => JSON.parse(Buffer.from(bytes).toString('utf8'));
export async function verifyManualProvenance(request, repository) {
  requireManual(process.platform === 'linux', 'LINUX_REQUIRED');
  const validation = json(await readPinnedFile(request.validation, repository));
  assertManualValidationReceipt(validation, validation.identity);
  // Validate each immutable gate log too, rather than trusting only receipt labels.
  for (const gate of validation.gates) {
    const filename = path.join(
      path.dirname(request.validation.path),
      gate.log.path,
    );
    const stat = await fs.stat(filename);
    requireManual(
      stat.isFile() &&
        stat.size === gate.log.bytes &&
        stat.size <= 128 * 1024 * 1024,
      'VALIDATION_LOG_SIZE',
    );
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(filename)) hash.update(chunk);
    requireManual(hash.digest('hex') === gate.log.sha256, 'VALIDATION_LOG_SHA');
  }
  const current = await currentManualValidationIdentity();
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: repository,
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    }).trim();
  const remote = git(
    'ls-remote',
    '--exit-code',
    'origin',
    'refs/heads/main',
  ).split(/\s+/);
  requireManual(
    remote.length === 2 && remote[1] === 'refs/heads/main',
    'REMOTE_MAIN',
  );
  const ancestry = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', validation.identity.commit, current.commit],
    { cwd: repository, timeout: 30000 },
  );
  const provenance = {
    expectedMainCommit: request.expectedMainCommit,
    remoteMain: remote[0],
    localMain: git('rev-parse', 'refs/remotes/origin/main'),
    clean: true,
    ancestor: ancestry.status === 0,
  };
  assertEquivalentSource(validation.identity, current, provenance);
  return {
    validated: validation.identity,
    current,
    ...provenance,
    validationSha256: request.validation.sha256,
  };
}
export async function verifyExclusiveReceipt(request, repository) {
  const receipt = json(
    await readPinnedFile(request.exclusiveWindow, repository),
  );
  assertExclusiveWindow(receipt, request);
  const workflow = receipt.workflows[0];
  const readback = json(
    await readPinnedFile(filePin(workflow.evidence, repository), repository),
  );
  requireManual(
    readback.id === workflow.id &&
      readback.path === workflow.path &&
      readback.state === 'disabled_manually',
    'WORKFLOW_READBACK',
  );
  for (const name of ['jobsEvidence', 'deploymentsEvidence'])
    await readPinnedFile(filePin(receipt[name], repository), repository);
  return receipt;
}
export async function assertNoCompetingWork(readJobs, vercel, projectId) {
  requireManual(
    typeof projectId === 'string' && projectId.length > 0,
    'VERCEL_PROJECT',
  );
  const jobs = await readJobs();
  requireManual(Array.isArray(jobs) && jobs.length === 0, 'ACTIVE_JOBS');
  const deployments = await vercel(
    '/v6/deployments?' +
      new URLSearchParams({
        projectId,
        state: 'BUILDING,QUEUED,INITIALIZING',
        limit: '100',
      }),
  );
  requireManual(
    Array.isArray(deployments?.deployments) &&
      deployments.deployments.length === 0 &&
      !deployments.pagination?.next,
    'ACTIVE_DEPLOYMENTS',
  );
  return {
    activeJobs: 0,
    activeDeployments: 0,
    checkedAt: new Date().toISOString(),
  };
}
export function localReleaseEnvironment(environment, request) {
  const result = { ...environment };
  for (const key of Object.keys(result))
    if (
      /^(GITHUB_|GH_|CLEANUP_|VERIFY_|RELEASE_|MODEL_|VITE_|CAMPUS_|TURNRIGHT_)/.test(
        key,
      )
    )
      delete result[key];
  for (const key of [
    'NODE_OPTIONS',
    'NODE_V8_COVERAGE',
    'NODE_ENV',
    'TSX_TSCONFIG_PATH',
    'DEBUG',
    'PWDEBUG',
    'NODE_DEBUG',
    'NODE_DEBUG_NATIVE',
    'DEBUG_COLORS',
    'DEBUG_DEPTH',
    'DEBUG_SHOW_HIDDEN',
    'DEBUG_HIDE_DATE',
    'PW_LOG_NAME',
    'PW_API_TO_IMPL_LOG',
    'PLAYWRIGHT_DEBUG',
    'PLAYWRIGHT_DEBUG_LOG',
    'PLAYWRIGHT_TRACE',
    'SSLKEYLOGFILE',
  ])
    delete result[key];
  result.CAMPUS_ID = 'lasu';
  result.PUBLISHED_MAP_URL = 'https://turnright.vercel.app';
  result.TURNRIGHT_LOCAL_RUN_ID = request.localRunId;
  return result;
}
