import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repository = path.resolve(process.argv[2] || '.');
const git = (args) => {
  const result = spawnSync('git', ['-C', repository, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0)
    throw Error(`Cannot read repository history (${args[0]}).`);
  return result.stdout.trim();
};
if (git(['rev-parse', '--is-shallow-repository']) !== 'false')
  throw Error('Full history is required; fetch with depth 0.');
const commits = Number(git(['rev-list', '--all', '--count']));
if (!Number.isSafeInteger(commits) || commits < 1)
  throw Error('No Git history available.');
const objects = git([
  '-c',
  'core.quotePath=false',
  'rev-list',
  '--objects',
  '--all',
]).split('\n');
const names = new Map(
  objects.map((line) => {
    const [oid, ...parts] = line.split(' ');
    let name = parts.join(' ');
    if (name.startsWith('"')) name = JSON.parse(name);
    return [oid, name || 'unnamed-blob'];
  }),
);
const inventory = spawnSync(
  'git',
  [
    '-C',
    repository,
    'cat-file',
    '--batch-check=%(objectname) %(objecttype) %(objectsize)',
  ],
  {
    input: [...names.keys()].join('\n') + '\n',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  },
);
if (inventory.status !== 0) throw Error('Cannot enumerate historical objects.');
const blobs = inventory.stdout
  .trim()
  .split('\n')
  .map((line) => line.split(' '))
  .filter(([, type]) => type === 'blob')
  .map(([oid, , size]) => ({ oid, size: Number(size), name: names.get(oid) }));
if (
  !blobs.length ||
  blobs.some(
    (b) =>
      !/^[a-f0-9]{40,64}$/.test(b.oid) ||
      !Number.isSafeInteger(b.size) ||
      b.size < 0,
  )
)
  throw Error('Invalid historical blob inventory.');

// Git diff scanning builds enormous fragments for generated data. Directory
// mode uses Gitleaks' own bounded file reader. Scan every reachable blob once,
// retaining its path, the original rules, and the default recursive decoding.
const temporary = mkdtempSync(path.join(tmpdir(), 'turnright-secret-history-'));
if (
  path.dirname(temporary) !== path.resolve(tmpdir()) ||
  !path.basename(temporary).startsWith('turnright-secret-history-')
)
  throw Error('Unsafe temporary cleanup path.');
const findings = [];
let scanned = 0;
try {
  for (let start = 0; start < blobs.length;) {
    const batch = [];
    let bytes = 0;
    while (
      start < blobs.length &&
      batch.length < 100 &&
      (bytes < 16 * 1024 * 1024 || !batch.length)
    ) {
      const blob = blobs[start++];
      batch.push(blob);
      bytes += blob.size;
    }
    const folder = path.join(temporary, 'batch');
    mkdirSync(folder);
    const content = spawnSync(
      'git',
      ['-C', repository, 'cat-file', '--batch'],
      {
        input: batch.map((b) => b.oid).join('\n') + '\n',
        maxBuffer: Math.max(1024 * 1024, bytes + batch.length * 160),
        windowsHide: true,
      },
    );
    if (content.status !== 0)
      throw Error('Cannot read historical blob contents.');
    let offset = 0;
    for (const blob of batch) {
      const newline = content.stdout.indexOf(10, offset);
      if (
        content.stdout.subarray(offset, newline).toString() !==
        `${blob.oid} blob ${blob.size}`
      )
        throw Error('Historical object header mismatch.');
      offset = newline + 1;
      const root = path.join(folder, blob.oid),
        file = path.resolve(root, blob.name);
      if (!file.startsWith(root + path.sep))
        throw Error('Unsafe historical filename.');
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content.stdout.subarray(offset, offset + blob.size));
      offset += blob.size;
      if (content.stdout[offset++] !== 10)
        throw Error('Incomplete historical object.');
    }
    const report = path.join(temporary, 'findings.json');
    const result = spawnSync(
      'gitleaks',
      [
        'dir',
        folder,
        `--config=${path.join(repository, '.gitleaks.toml')}`,
        '--redact',
        '--no-banner',
        '--log-level=error',
        '--report-format=json',
        `--report-path=${report}`,
      ],
      {
        cwd: repository,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, GOMEMLIMIT: '512MiB', GOMAXPROCS: '2' },
      },
    );
    if (result.error || ![0, 1].includes(result.status))
      throw Error('Historical secret scanner failed; coverage is incomplete.');
    const detected = JSON.parse(readFileSync(report, 'utf8'));
    for (const finding of detected) {
      const relative = path
        .relative(folder, path.resolve(folder, finding.File))
        .replaceAll('\\', '/');
      const [blob, ...parts] = relative.split('/');
      findings.push({
        rule: finding.RuleID,
        blob,
        file: parts.join('/'),
        line: finding.StartLine,
      });
    }
    scanned += batch.length;
    console.log(`Scanned ${scanned}/${blobs.length} unique historical files.`);
    // Both paths were created in this invocation; historical symlinks are
    // materialized as ordinary file contents, never followed.
    rmSync(folder, { recursive: true });
    rmSync(report);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
if (findings.length) {
  // Never print source lines, matches or secret values, including on failures.
  for (const finding of findings) console.error(JSON.stringify(finding));
  console.error(
    `${findings.length} findings in ${blobs.length} historical files across ${commits} reachable commits.`,
  );
  process.exitCode = 1;
} else
  console.log(
    `Secret scan passed: ${blobs.length} historical files across all ${commits} reachable commits.`,
  );
