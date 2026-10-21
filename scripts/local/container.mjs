import { spawnSync } from 'node:child_process';
import { root, requireDevelopmentHost } from './runtime.mjs';

requireDevelopmentHost();
if (process.platform !== 'linux') {
  throw Error(
    'Run local:container from a Linux/WSL2 checkout with Docker Engine.',
  );
}
const result = spawnSync(
  'docker',
  ['compose', 'run', '--rm', '--build', 'development'],
  {
    cwd: root,
    env: { ...process.env, TURNRIGHT_WORKSPACE: root.replace(/\/$/, '') },
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
