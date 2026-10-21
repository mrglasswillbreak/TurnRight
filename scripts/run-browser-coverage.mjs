import { readdir, unlink, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, packageBin } from './toolchain.mjs';

const web = path.join(root, 'web');
const directory = path.join(web, 'coverage/browser-raw');
await mkdir(directory, { recursive: true });
// Remove only receipts produced by this harness, never unrelated local files.
for (const file of await readdir(directory)) {
  if (/^[a-f0-9]{64}\.json\.gz$/.test(file))
    await unlink(path.join(directory, file));
}
const result = spawnSync(
  process.execPath,
  [
    packageBin('@playwright/test', 'playwright'),
    'test',
    '--workers=1',
    '--timeout=120000',
    '--reporter=line',
    ...process.argv.slice(2),
  ],
  {
    cwd: web,
    env: { ...process.env, TURNRIGHT_COVERAGE: '1' },
    stdio: 'inherit',
    windowsHide: true,
  },
);
if (result.status !== 0) process.exit(result.status || 1);
await import('./browser-coverage.mjs');
