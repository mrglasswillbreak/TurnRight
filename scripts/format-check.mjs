import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const listed = spawnSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' },
);
if (listed.status !== 0)
  throw Error('Cannot enumerate source files for formatting.');
// Static/generated packages, vendored codecs and dated evidence retain their bytes.
const paths = [...new Set(listed.stdout.split('\0'))].filter(
  (file) =>
    /\.(?:[cm]?[jt]sx?|css|json|ya?ml)$/.test(file) &&
    (/^(?:web\/(?:src|components|lib|hooks|api|server|tests|scripts)\/|scripts\/|\.github\/|\.devcontainer\/)/.test(
      file,
    ) ||
      /^(?:web\/)?(?:package|tsconfig(?:\.[\w-]+)?)\.json$/.test(file) ||
      /^web\/[^/]+\.config\.ts$/.test(file)) &&
    !/(?:^|\/)(?:fixtures|vendor|generated|work|node_modules)\//.test(file) &&
    !file.endsWith('package-lock.json'),
);
const write = process.argv.includes('--write');
for (let index = 0; index < paths.length; index += 60) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, 'web/node_modules/oxfmt/bin/oxfmt'),
      '--config',
      'web/.oxfmtrc.json',
      write ? '--write' : '--check',
      ...paths.slice(index, index + 60),
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.status !== 0) process.exitCode = 1;
}
