import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { authoredCode, repositoryFiles } from './source-files.mjs';
import { root } from './toolchain.mjs';

const failures = [];
const code = authoredCode();
for (const file of code) {
  const source = await readFile(path.join(root, file), 'utf8');
  const lines = source.trimEnd().split('\n').length;
  if (lines >= 500)
    failures.push(
      `${file}: ${lines} lines; split by responsibility before reaching 500.`,
    );
}
const manifest = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
);
const lock = JSON.parse(
  await readFile(path.join(root, 'package-lock.json'), 'utf8'),
);
if (
  !manifest.private ||
  !manifest.workspaces?.includes('web') ||
  !lock.packages?.web
)
  failures.push('The root private workspace and lock must include web.');
try {
  await access(path.join(root, 'web/package-lock.json'));
  failures.push('Use the single root npm lock, not a nested web lock.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
for (const file of repositoryFiles().filter((name) =>
  /^\.github\/workflows\/.*\.ya?ml$/.test(name),
)) {
  const source = await readFile(path.join(root, file), 'utf8');
  for (const match of source.matchAll(/\buses:\s*([^\s#]+)/g)) {
    const action = match[1];
    if (!action.startsWith('./') && !/@[a-f0-9]{40}$/.test(action))
      failures.push(`${file}: pin ${action} to a verified commit.`);
  }
}
if (failures.length) throw Error(failures.join('\n'));
console.log(
  `Architecture checks passed: ${code.length} authored code/test/tool files below 500 lines, one workspace lock and pinned external CI actions.`,
);
