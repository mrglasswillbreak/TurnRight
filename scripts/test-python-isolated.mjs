import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { root } from './toolchain.mjs';

// Match the mandatory Linux CI native gate, including zero network and zero skips.
if (process.platform !== 'linux')
  throw Error(
    'Run native Python acceptance from a Linux/WSL2 checkout with Docker Engine.',
  );
function run(args) {
  const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run([
  'build',
  '--target',
  'test',
  '-t',
  'turnright-gis-import-test',
  '-f',
  'scripts/map_import/Dockerfile',
  'scripts/map_import',
]);
mkdirSync(new URL('../coverage/python/', import.meta.url), { recursive: true });
run([
  'run',
  '--rm',
  '--user',
  `${process.getuid()}:${process.getgid()}`,
  '--network',
  'none',
  '--cap-drop',
  'ALL',
  '--security-opt',
  'no-new-privileges',
  '--read-only',
  '--tmpfs',
  '/tmp:rw,size=512m',
  '-e',
  'PYTHONDONTWRITEBYTECODE=1',
  '-v',
  `${root}:/repo:ro`,
  '-v',
  `${root}/coverage/python:/repo/coverage/python:rw`,
  '-w',
  '/repo',
  '--entrypoint',
  'python3',
  'turnright-gis-import-test',
  'scripts/test_python.py',
]);
