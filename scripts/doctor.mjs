import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const node = readFileSync(new URL('.node-version', root), 'utf8').trim();
const manifest = JSON.parse(
  readFileSync(new URL('package.json', root), 'utf8'),
);
const full = process.argv.includes('--full');
const checks = [];
checks.push([
  'Node',
  process.versions.node === node,
  `required ${node}; found ${process.versions.node}`,
]);
const npm = process.env.npm_config_user_agent?.match(/^npm\/([^ ]+)/)?.[1];
if (npm)
  checks.push([
    'npm',
    `npm@${npm}` === manifest.packageManager,
    `required ${manifest.packageManager}; found ${npm}`,
  ]);
for (const [name, args] of full
  ? [
      ['python3', ['--version']],
      ['docker', ['info', '--format', '{{.ServerVersion}}']],
    ]
  : []) {
  const result = spawnSync(name, args, {
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
  });
  const version = result.stdout?.trim() || '';
  checks.push([
    name,
    result.status === 0 &&
      (name !== 'python3' || version.startsWith('Python 3.12.')),
    name === 'python3'
      ? 'Python 3.12 is required'
      : 'Docker Engine must be running',
  ]);
}
if (full)
  checks.push([
    'Host',
    process.platform === 'linux',
    'Full local workers require Linux/WSL2',
  ]);
for (const [name, ok, detail] of checks)
  console.log(`${ok ? 'OK' : 'FAIL'} ${name}: ${detail}`);
console.log(`Checkout: ${fileURLToPath(root)}`);
process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
