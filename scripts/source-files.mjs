import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { root } from './toolchain.mjs';

export function repositoryFiles() {
  const listed = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  if (listed.status !== 0) throw Error('Cannot enumerate repository files.');
  return [...new Set(listed.stdout.split('\0'))]
    .filter((file) => file && existsSync(path.join(root, file)))
    .sort();
}

export function authoredCode() {
  return repositoryFiles().filter(
    (file) =>
      /\.[cm]?[jt]sx?$/.test(file) &&
      /^(?:scripts\/|web\/(?:src|components|lib|hooks|api|server|tests|scripts)\/|web\/[^/]+\.config\.ts$)/.test(
        file,
      ) &&
      !/(?:^|\/)(?:node_modules|vendor|generated|work)\//.test(file),
  );
}
