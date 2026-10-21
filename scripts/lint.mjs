import { spawnSync } from 'node:child_process';
import { authoredCode } from './source-files.mjs';
import { packageBin, root } from './toolchain.mjs';
const files = authoredCode();
for (let index = 0; index < files.length; index += 60) {
  const result = spawnSync(
    process.execPath,
    [
      packageBin('oxlint'),
      '--deny-warnings',
      '--config',
      'web/.oxlintrc.json',
      ...files.slice(index, index + 60),
    ],
    { cwd: root, stdio: 'inherit', windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = 1;
}
