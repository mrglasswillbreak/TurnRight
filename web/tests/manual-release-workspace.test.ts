import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import {
  assertWorkerSource,
  createManualWorkerWorkspace,
  workerSourceIdentity,
} from '../../scripts/manual-release-workspace.mjs';
const run = '11111111-1111-4111-8111-111111111111';
it('requires the exact complete source byte snapshot as well as commit and tree', () => {
  const identity = {
    commit: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    sourceSnapshot: 'c'.repeat(64),
  };
  expect(() => assertWorkerSource(identity, identity)).not.toThrow();
  for (const key of ['commit', 'tree', 'sourceSnapshot'])
    expect(() =>
      assertWorkerSource({ ...identity, [key]: 'different' }, identity),
    ).toThrow('WORKER_SOURCE_CHANGED');
});
it.runIf(process.platform === 'linux')(
  'isolates generated files, owns one new workspace and links only original dependencies',
  async () => {
    const temporary = await fs.mkdtemp(
      path.join(os.tmpdir(), 'manual-worker-fixture-'),
    );
    try {
      const repository = path.join(temporary, 'repository');
      await fs.mkdir(repository);
      const git = (...args: string[]) =>
        execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
          cwd: repository,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
      git('init');
      await fs.mkdir(path.join(repository, 'web'));
      await fs.mkdir(path.join(repository, 'node_modules'));
      await fs.writeFile(path.join(repository, '.gitignore'), 'node_modules\n');
      await fs.writeFile(
        path.join(repository, 'package.json'),
        '{"private":true}\n',
      );
      await fs.writeFile(
        path.join(repository, 'web/tracked.txt'),
        'original\n',
      );
      git('add', '.');
      git(
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '-m',
        'fixture',
      );
      const identity = {
        ...(await workerSourceIdentity(repository)),
        dependencySnapshot: 'd'.repeat(64),
      };
      const request = {
        operation: 'preview',
        localRunId: run,
        expectedMainCommit: identity.commit,
        journalDirectory: path.join(temporary, 'journals'),
      };
      const workspace = await createManualWorkerWorkspace(
        request,
        repository,
        identity,
      );
      expect(workspace.identity).toEqual({
        commit: identity.commit,
        tree: identity.tree,
        sourceSnapshot: identity.sourceSnapshot,
      });
      expect(
        await fs.realpath(path.join(workspace.source, 'node_modules')),
      ).toBe(await fs.realpath(path.join(repository, 'node_modules')));
      const owner = JSON.parse(
        await fs.readFile(
          path.join(workspace.directory, 'ownership.json'),
          'utf8',
        ),
      );
      expect(owner).toMatchObject({
        localRunId: run,
        sourceRoot: repository,
        dependencySnapshot: identity.dependencySnapshot,
      });
      await fs.writeFile(
        path.join(workspace.source, 'web/tracked.txt'),
        'generated\n',
      );
      expect(
        await fs.readFile(path.join(repository, 'web/tracked.txt'), 'utf8'),
      ).toBe('original\n');
      expect(git('status', '--porcelain')).toBe('');
      await expect(
        createManualWorkerWorkspace(request, repository, identity),
      ).rejects.toThrow();
      await expect(
        createManualWorkerWorkspace(
          { ...request, operation: 'publish' },
          repository,
          identity,
        ),
      ).rejects.toThrow('PREVIEW_WORKSPACE_ONLY');
    } finally {
      if (
        temporary.startsWith(path.join(os.tmpdir(), 'manual-worker-fixture-'))
      )
        await fs.rm(temporary, { recursive: true, force: true });
    }
  },
);
