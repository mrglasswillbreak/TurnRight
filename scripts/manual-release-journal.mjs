/** Append-only durable events; uncertain mutations retain the exclusive lock. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { manualReleaseLockDirectory } from './manual-release-lock-location.mjs';
import {
  sha256,
  requireManual,
  outsideRepository,
} from './manual-release-request.mjs';
async function durableWrite(filename, bytes) {
  const handle = await fs.open(filename, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (process.platform === 'linux') {
    const directory = await fs.open(path.dirname(filename), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
}
export async function readPinnedFile(
  pin,
  repository,
  maxBytes = 2 * 1024 * 1024,
) {
  const filename = await fs.realpath(outsideRepository(pin.path, repository));
  outsideRepository(filename, await fs.realpath(repository));
  const stat = await fs.stat(filename);
  requireManual(
    stat.isFile() && stat.size > 0 && stat.size <= maxBytes,
    'PINNED_FILE_SIZE',
  );
  const bytes = await fs.readFile(filename);
  requireManual(sha256(bytes) === pin.sha256, 'PINNED_FILE_SHA');
  return bytes;
}
export async function createManualJournal(request, requestBytes, repository) {
  const directory = outsideRepository(request.journalDirectory, repository);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  outsideRepository(
    await fs.realpath(directory),
    await fs.realpath(repository),
  );
  const runDirectory = path.join(directory, request.localRunId);
  const exclusive = !['inspect', 'audit'].includes(request.operation);
  const projectId = process.env.VERCEL_PROJECT_ID;
  requireManual(
    typeof projectId === 'string' && /^prj_[A-Za-z0-9]{1,100}$/.test(projectId),
    'LOCK_PROJECT',
  );
  const lockDirectory = path.resolve(manualReleaseLockDirectory());
  const lockScope = sha256('vercel-project\0' + projectId);
  const lock = path.join(lockDirectory, lockScope + '.lock');
  if (exclusive) {
    await fs.mkdir(lockDirectory, { mode: 0o700 }).catch((error) => {
      if (error.code !== 'EEXIST') throw error;
    });
    const stat = await fs.lstat(lockDirectory);
    requireManual(
      stat.isDirectory() &&
        !stat.isSymbolicLink() &&
        (await fs.realpath(lockDirectory)) === lockDirectory &&
        (process.platform !== 'linux' ||
          ((stat.mode & 0o077) === 0 && stat.uid === process.getuid())),
      'LOCK_DIRECTORY',
    );
  }
  const lockBytes = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      projectId,
      localRunId: request.localRunId,
      requestSha256: sha256(requestBytes),
      operation: request.operation,
      journalDirectory: await fs.realpath(directory),
      createdAt: new Date().toISOString(),
    }),
  );
  // mkdir without recursive prevents replay of a previously attempted run identity.
  await fs.mkdir(runDirectory, { mode: 0o700 });
  await durableWrite(path.join(runDirectory, 'request.json'), requestBytes);
  if (exclusive) await durableWrite(lock, lockBytes);
  let sequence = 0,
    previousHash = null,
    uncertain = false,
    finished = false;
  const append = async (stage, details = {}) => {
    requireManual(!finished, 'JOURNAL_FINISHED');
    requireManual(/^[a-z-]{1,64}$/.test(stage), 'JOURNAL_STAGE');
    const event = {
      schemaVersion: 1,
      kind: 'turnright-manual-release-event',
      localRunId: request.localRunId,
      requestSha256: sha256(requestBytes),
      sequence: ++sequence,
      previousHash,
      checkedAt: new Date().toISOString(),
      stage,
      details,
    };
    const bytes = Buffer.from(JSON.stringify(event, null, 2) + '\n');
    const filename = String(sequence).padStart(4, '0') + '-' + stage + '.json';
    await durableWrite(path.join(runDirectory, filename), bytes);
    previousHash = sha256(bytes);
    return { path: path.join(runDirectory, filename), sha256: previousHash };
  };
  return {
    directory: runDirectory,
    lock,
    lockScope,
    append,
    async intent(stage, details = {}) {
      await append(stage, details);
      uncertain = true;
    },
    async complete(details = {}) {
      await append('complete', details);
      if (exclusive) {
        requireManual(
          sha256(await fs.readFile(lock)) === sha256(lockBytes),
          'LOCK_CHANGED',
        );
        await fs.unlink(lock);
      }
      finished = true;
    },
    async fail(code) {
      await append('failed', { code, uncertain, lockRetained: exclusive });
      // Even preflight failures keep the lock: explicit read-only audit is required.
      finished = true;
    },
  };
}
export async function inspectJournal(directory) {
  const names = (await fs.readdir(directory))
    .filter((name) => /^\d{4}-[a-z-]+\.json$/.test(name))
    .sort();
  const requestHash = sha256(
    await fs.readFile(path.join(directory, 'request.json')),
  );
  const localRunId = path.basename(directory);
  let previousHash = null,
    sequence = 0;
  const events = [];
  for (const name of names) {
    const bytes = await fs.readFile(path.join(directory, name));
    const event = JSON.parse(bytes);
    requireManual(
      event.sequence === ++sequence &&
        event.previousHash === previousHash &&
        event.localRunId === localRunId &&
        event.requestSha256 === requestHash,
      'JOURNAL_CHAIN',
    );
    previousHash = sha256(bytes);
    events.push({ sequence, stage: event.stage, sha256: previousHash });
  }
  return { events, finalHash: previousHash };
}
