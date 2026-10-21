import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const folder = mkdtempSync(path.join(tmpdir(), 'turnright-secret-test-'));
const git = (...args) => {
  const result = spawnSync('git', ['-C', folder, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, 'Fixture Git operation failed.');
};
const scan = () =>
  spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./secret-history.mjs', import.meta.url)), folder],
    {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
try {
  git('init');
  git('config', 'user.name', 'Secret scanner test');
  git('config', 'user.email', 'scanner@example.invalid');
  copyFileSync(
    new URL('../.gitleaks.toml', import.meta.url),
    path.join(folder, '.gitleaks.toml'),
  );
  mkdirSync(path.join(folder, 'data/seed'), { recursive: true });
  const policy = path.join(folder, 'data/seed/campus.json');
  writeFileSync(
    policy,
    JSON.stringify({ accessReviewId: 'lasu-student-roads-2026-09-09' }),
  );
  git('add', '.');
  git('commit', '-m', 'Public policy identity');
  assert.equal(
    scan().status,
    0,
    'The documented public policy identity should pass.',
  );
  // Construct a nonfunctional canary in memory; do not place a contiguous
  // credential-shaped string in maintained source or print it in test output.
  const canary = [
    'ghp',
    createHash('sha256')
      .update('nonfunctional historical scanner canary')
      .digest('hex')
      .slice(0, 36),
  ].join('_');
  writeFileSync(
    policy,
    JSON.stringify({
      accessReviewId: 'lasu-student-roads-2026-09-09',
      token: canary,
    }),
  );
  git('add', '.');
  git('commit', '-m', 'Historical canary');
  writeFileSync(policy, '{}');
  git('add', '.');
  git('commit', '-m', 'Remove current canary');
  const result = scan();
  assert.equal(
    result.status,
    1,
    'A deleted historical secret must fail the scan.',
  );
  assert.match(result.stderr, /github-pat/);
  assert.match(result.stderr, /data\/seed\/campus\.json/);
  assert.equal(
    (result.stdout + result.stderr).includes(canary),
    false,
    'Scanner output must not expose secret values.',
  );
  console.log(
    'Secret-history self-test passed: deleted secrets detected, narrow exceptions, value-free output.',
  );
} finally {
  assert.equal(path.dirname(folder), path.resolve(tmpdir()));
  assert.match(path.basename(folder), /^turnright-secret-test-/);
  rmSync(folder, { recursive: true, force: true });
}
