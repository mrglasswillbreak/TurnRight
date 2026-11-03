/** Preview output is isolated from the validated CLI checkout and retained for audit. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  outsideRepository,
  requireManual,
  sha256,
} from './manual-release-request.mjs';
const git = (repository, ...args) =>
  execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: repository,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim();
export async function workerSourceIdentity(repository) {
  const source = createHash('sha256');
  for (const filename of git(repository, 'ls-files', '-z')
    .split('\0')
    .filter(Boolean)
    .sort()) {
    source
      .update(filename)
      .update('\0')
      .update(await fs.readFile(path.join(repository, filename)))
      .update('\0');
  }
  return {
    commit: git(repository, 'rev-parse', 'HEAD'),
    tree: git(repository, 'rev-parse', 'HEAD^{tree}'),
    sourceSnapshot: source.digest('hex'),
  };
}
export function assertWorkerSource(actual, expected) {
  requireManual(
    ['commit', 'tree', 'sourceSnapshot'].every(
      (key) => actual[key] === expected[key],
    ),
    'WORKER_SOURCE_CHANGED',
  );
}
export async function createManualWorkerWorkspace(
  request,
  repository,
  expected,
) {
  requireManual(
    request.operation === 'preview' &&
      request.expectedMainCommit === expected.commit,
    'PREVIEW_WORKSPACE_ONLY',
  );
  const parent = outsideRepository(
    path.join(request.journalDirectory, 'workspaces'),
    repository,
  );
  await fs.mkdir(parent, { recursive: true, mode: 0o700 });
  outsideRepository(await fs.realpath(parent), await fs.realpath(repository));
  const directory = path.join(parent, request.localRunId);
  await fs.mkdir(directory, { mode: 0o700 });
  const sourceRoot = await fs.realpath(repository);
  const dependencyLinks = [];
  for (const relative of ['node_modules', 'web/node_modules']) {
    const dependencyDirectory = path.join(sourceRoot, relative);
    if (!(await fs.stat(dependencyDirectory).catch(() => null))) {
      requireManual(relative !== 'node_modules', 'WORKER_DEPENDENCIES_MISSING');
      continue;
    }
    requireManual(
      (await fs.realpath(dependencyDirectory)) === dependencyDirectory,
      'WORKER_DEPENDENCY_TARGET',
    );
    dependencyLinks.push({ relative, target: dependencyDirectory });
  }
  const owner = {
    schemaVersion: 1,
    kind: 'turnright-manual-worker-workspace',
    localRunId: request.localRunId,
    sourceRoot,
    source: expected,
    dependencySnapshot: expected.dependencySnapshot,
    dependencyLinks,
    createdAt: new Date().toISOString(),
  };
  const ownerBytes = Buffer.from(JSON.stringify(owner, null, 2) + '\n');
  const ownership = await fs.open(
    path.join(directory, 'ownership.json'),
    'wx',
    0o600,
  );
  try {
    await ownership.writeFile(ownerBytes);
    await ownership.sync();
  } finally {
    await ownership.close();
  }
  const source = path.join(directory, 'source');
  // Absolute local source plus --no-checkout prevents any remote fetch or unpinned branch checkout.
  git(
    repository,
    '-c',
    'core.autocrlf=false',
    'clone',
    '--shared',
    '--no-checkout',
    '--',
    repository,
    source,
  );
  git(
    source,
    '-c',
    'core.autocrlf=false',
    'checkout',
    '--detach',
    expected.commit,
  );
  const actual = await workerSourceIdentity(source);
  assertWorkerSource(actual, expected);
  requireManual(
    git(source, 'status', '--porcelain=v1', '--untracked-files=all') === '',
    'WORKER_CLEAN_SOURCE',
  );
  for (const dependency of dependencyLinks) {
    const link = path.join(source, dependency.relative);
    await fs.symlink(dependency.target, link, 'dir');
    requireManual(
      (await fs.realpath(link)) === dependency.target,
      'WORKER_DEPENDENCY_LINK',
    );
  }
  return {
    directory,
    source,
    ownershipSha256: sha256(ownerBytes),
    identity: actual,
    sourceRoot,
    dependencySnapshot: expected.dependencySnapshot,
    dependencyLinks,
    dependencies: 'linked-to-validated-checkout',
    generatedFilesRetained: true,
  };
}
