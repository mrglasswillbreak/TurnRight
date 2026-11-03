import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createManualJournal,
  readPinnedFile,
  inspectJournal,
} from '../../scripts/manual-release-journal.mjs';
import { sha256 } from '../../scripts/manual-release-request.mjs';
import { manualSchedule } from '../../scripts/manual-release-operations.mts';
const hostState = vi.hoisted(() => ({ directory: '' }));
vi.mock('../../scripts/manual-release-lock-location.mjs', () => ({
  manualReleaseLockDirectory: () => hostState.directory,
}));
let temporary: string, repository: string;
const run = '11111111-1111-4111-8111-111111111111';
const next = '22222222-2222-4222-8222-222222222222';
beforeEach(async () => {
  temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), 'manual-release-journal-'),
  );
  repository = path.join(temporary, 'repository');
  hostState.directory = path.join(temporary, 'host-locks');
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_fixture');
  await fs.mkdir(repository);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  if (!temporary.startsWith(path.join(os.tmpdir(), 'manual-release-journal-')))
    throw Error('Unsafe cleanup');
  await fs.rm(temporary, { recursive: true, force: true });
});
function request(operation = 'preview', localRunId = run) {
  return {
    operation,
    localRunId,
    journalDirectory: path.join(temporary, 'journals'),
  };
}
const bytes = Buffer.from('{"immutable":true}');
it('hash-verifies private files and rejects changed bytes, oversized files and repository paths', async () => {
  const filename = path.join(temporary, 'private.json');
  await fs.writeFile(filename, bytes);
  await expect(
    readPinnedFile({ path: filename, sha256: sha256(bytes) }, repository),
  ).resolves.toEqual(bytes);
  await expect(
    readPinnedFile({ path: filename, sha256: 'f'.repeat(64) }, repository),
  ).rejects.toThrow('SHA');
  await expect(
    readPinnedFile({ path: filename, sha256: sha256(bytes) }, repository, 1),
  ).rejects.toThrow('SIZE');
  await expect(
    readPinnedFile(
      { path: path.join(repository, 'file'), sha256: sha256(bytes) },
      repository,
    ),
  ).rejects.toThrow('OUTSIDE');
});
it('rejects a symlink escaping the private area into the repository', async () => {
  const target = path.join(repository, 'file');
  await fs.writeFile(target, bytes);
  const link = path.join(temporary, 'link');
  try {
    await fs.symlink(target, link);
  } catch {
    return;
  }
  await expect(
    readPinnedFile({ path: link, sha256: sha256(bytes) }, repository),
  ).rejects.toThrow('OUTSIDE');
});
it('records ordered immutable intentions before actions, then releases only its own lock', async () => {
  const journal = await createManualJournal(request(), bytes, repository);
  await journal.intent('before-write', { operation: 'preview' });
  const recorded = await inspectJournal(journal.directory);
  expect(recorded.events.map((event) => event.stage)).toEqual(['before-write']);
  await journal.append('readback', { passed: true });
  await journal.complete({ passed: true });
  expect(
    (await inspectJournal(journal.directory)).events.map(
      (event) => event.stage,
    ),
  ).toEqual(['before-write', 'readback', 'complete']);
  await expect(fs.stat(journal.lock)).rejects.toThrow();
  await expect(journal.append('late', {})).rejects.toThrow('FINISHED');
});
it('refuses duplicate runs and competing writers while retaining uncertain-write evidence', async () => {
  const journal = await createManualJournal(request(), bytes, repository);
  await journal.intent('before-write');
  await journal.fail('MANUAL_RELEASE_UNCERTAIN_INSPECT_REQUIRED');
  expect(JSON.parse(await fs.readFile(journal.lock, 'utf8')).localRunId).toBe(
    run,
  );
  await expect(
    createManualJournal(request(), bytes, repository),
  ).rejects.toThrow();
  await expect(
    createManualJournal(request('publish', next), bytes, repository),
  ).rejects.toThrow();
  const names = await fs.readdir(journal.directory);
  const failure = JSON.parse(
    await fs.readFile(
      path.join(
        journal.directory,
        names.find((name) => name.endsWith('-failed.json'))!,
      ),
      'utf8',
    ),
  );
  expect(failure.details).toMatchObject({
    uncertain: true,
    lockRetained: true,
  });
});
it('allows a fresh read-only audit journal while a failed writer lock is retained', async () => {
  const writer = await createManualJournal(request(), bytes, repository);
  await writer.fail('MANUAL_RELEASE_TEST');
  const audit = await createManualJournal(
    request('audit', next),
    bytes,
    repository,
  );
  await audit.complete({ noRemoteWrites: true });
  expect(JSON.parse(await fs.readFile(writer.lock, 'utf8')).localRunId).toBe(
    run,
  );
});
it('retains one project lock across journals, worktrees and verification runs', async () => {
  const first = await createManualJournal(request('verify'), bytes, repository);
  await first.intent('preview-verification-requested');
  await first.fail('MANUAL_RELEASE_UNCERTAIN_INSPECT_REQUIRED');
  const otherRepository = path.join(temporary, 'another-checkout');
  await fs.mkdir(otherRepository);
  const other = {
    ...request('verify', next),
    journalDirectory: path.join(temporary, 'different-journals'),
  };
  await expect(
    createManualJournal(other, bytes, otherRepository),
  ).rejects.toMatchObject({ code: 'EEXIST' });
  const lock = JSON.parse(await fs.readFile(first.lock, 'utf8'));
  expect(lock).toMatchObject({
    projectId: 'prj_fixture',
    localRunId: run,
    requestSha256: sha256(bytes),
    operation: 'verify',
    journalDirectory: await fs.realpath(request().journalDirectory),
  });
  expect(path.dirname(first.lock)).toBe(hostState.directory);
  const audit = await createManualJournal(
    {
      ...other,
      operation: 'audit',
      localRunId: '33333333-3333-4333-8333-333333333333',
    },
    bytes,
    otherRepository,
  );
  expect(audit.lock).toBe(first.lock);
  await audit.complete({ noRemoteWrites: true });
  expect(await fs.readFile(first.lock, 'utf8')).toBe(JSON.stringify(lock));
});
it('serializes concurrent requests for the same project in different journals', async () => {
  const results = await Promise.allSettled([
    createManualJournal(request('verify'), bytes, repository),
    createManualJournal(
      {
        ...request('verify', next),
        journalDirectory: path.join(temporary, 'other-journals'),
      },
      bytes,
      repository,
    ),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(
    1,
  );
  const winner = results.find((result) => result.status === 'fulfilled');
  if (winner?.status !== 'fulfilled') throw Error('Missing lock owner');
  await winner.value.complete();
});
it('separates different project identities and refuses an unscoped lock', async () => {
  const first = await createManualJournal(request(), bytes, repository);
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_another');
  const second = await createManualJournal(
    request('verify', next),
    bytes,
    repository,
  );
  expect(second.lock).not.toBe(first.lock);
  await second.complete();
  await first.complete();
  vi.stubEnv('VERCEL_PROJECT_ID', '');
  await expect(
    createManualJournal(request(), bytes, repository),
  ).rejects.toThrow('LOCK_PROJECT');
});
it('does not remove a replaced lock even when its local run UUID is unchanged', async () => {
  const journal = await createManualJournal(request(), bytes, repository);
  const actual = JSON.parse(await fs.readFile(journal.lock, 'utf8'));
  actual.requestSha256 = 'f'.repeat(64);
  await fs.writeFile(journal.lock, JSON.stringify(actual));
  await expect(journal.complete()).rejects.toThrow('LOCK_CHANGED');
  expect(JSON.parse(await fs.readFile(journal.lock, 'utf8'))).toEqual(actual);
});
it('detects edited event content in the hash chain', async () => {
  const journal = await createManualJournal(
    request('inspect'),
    bytes,
    repository,
  );
  await journal.append('first', { a: 1 });
  await journal.append('second', { a: 2 });
  const first = path.join(journal.directory, '0001-first.json');
  await fs.writeFile(
    first,
    (await fs.readFile(first, 'utf8')).replace('"a": 1', '"a": 9'),
  );
  await expect(inspectJournal(journal.directory)).rejects.toThrow('CHAIN');
});
it('only accepts one correctly scoped durable local worker intent', async () => {
  const events: { stage: string; details?: object }[] = [];
  const journal = {
    directory: temporary,
    append: async () => {},
    intent: async (stage: string, details?: object) => {
      events.push({ stage, details });
    },
  };
  const scheduler = manualSchedule('preview', journal);
  expect(() => scheduler.take()).toThrow('NOT_SCHEDULED');
  const input = { release_id: run, operation: 'preview', campus_id: 'lasu' };
  await scheduler.schedule('release.yml', input);
  expect(events).toEqual([
    {
      stage: 'worker-scheduled',
      details: {
        workflow: 'release.yml',
        inputs: input,
        githubDispatch: false,
      },
    },
  ]);
  expect(scheduler.take()).toEqual(input);
  await expect(scheduler.schedule('release.yml', input)).rejects.toThrow(
    'WORKER_INTENT',
  );
});
it('rejects different workflows, campuses, operations and unexpected scheduler fields', async () => {
  const journal = {
    directory: temporary,
    append: async () => {},
    intent: async () => {},
  };
  for (const [workflow, input] of [
    ['other.yml', { release_id: run, operation: 'preview', campus_id: 'lasu' }],
    [
      'release.yml',
      { release_id: run, operation: 'publish', campus_id: 'lasu' },
    ],
    [
      'release.yml',
      { release_id: run, operation: 'preview', campus_id: 'unilag' },
    ],
    [
      'release.yml',
      {
        release_id: run,
        operation: 'preview',
        campus_id: 'lasu',
        command: 'bad',
      },
    ],
  ] as [string, Record<string, string>][])
    await expect(
      manualSchedule('preview', journal).schedule(workflow, input),
    ).rejects.toThrow('WORKER_INTENT');
});
