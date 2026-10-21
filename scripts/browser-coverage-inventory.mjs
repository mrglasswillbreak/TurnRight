import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, packageBin } from './toolchain.mjs';

export function requiredBrowserJourneys() {
  const listed = spawnSync(
    process.execPath,
    [
      packageBin('@playwright/test', 'playwright'),
      'test',
      '--list',
      '--reporter=json',
      '--config=playwright.config.ts',
    ],
    { cwd: path.join(root, 'web'), encoding: 'utf8', windowsHide: true },
  );
  if (listed.status !== 0)
    throw Error('Cannot enumerate the complete browser acceptance suite.');
  const report = JSON.parse(listed.stdout);
  if (report.errors?.length)
    throw Error('Browser acceptance discovery failed.');
  const required = [];
  const visit = (suite) => {
    for (const spec of suite.specs || [])
      required.push({ id: spec.id, title: spec.title });
    for (const child of suite.suites || []) visit(child);
  };
  visit(report);
  if (!required.length) throw Error('Browser acceptance inventory is empty.');
  return required;
}
