import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { coverageSnapshot } from './coverage-scope.mjs';
import { root, packageBin } from './toolchain.mjs';

const snapshot = await coverageSnapshot();
const result = spawnSync(
  process.execPath,
  [
    packageBin('vitest'),
    'run',
    '--coverage',
    '--maxWorkers=1',
    ...process.argv.slice(2),
  ],
  {
    cwd: path.join(root, 'web'),
    stdio: 'inherit',
    windowsHide: true,
  },
);
if (result.status !== 0) process.exit(result.status || 1);
if (snapshot !== (await coverageSnapshot()))
  throw Error(
    'Source changed during coverage collection. Run again on the final revision.',
  );
await writeFile(
  path.join(root, 'web/coverage/unit/receipt.json'),
  JSON.stringify({ snapshot, status: 'passed' }),
);
