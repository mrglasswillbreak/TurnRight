import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createCoverageMap } from '@vitest/istanbul-lib-coverage';
import { create, createContext } from '@vitest/istanbul-lib-report';
import { root } from './toolchain.mjs';
import { coverageSnapshot, coveredSource } from './coverage-scope.mjs';
import { authoredCode } from './source-files.mjs';
import { requiredBrowserJourneys } from './browser-coverage-inventory.mjs';

const web = path.join(root, 'web');
const read = async (file) =>
  JSON.parse(await readFile(path.join(web, 'coverage', file), 'utf8'));
const snapshot = await coverageSnapshot();
const unit = await read('unit/receipt.json');
const browser = await read('browser-receipt.json');
if (
  [unit, browser].some(
    (receipt) => receipt.status !== 'passed' || receipt.snapshot !== snapshot,
  )
)
  throw Error(
    'Coverage must come from passing tests on exactly the current source and dependency snapshot.',
  );
const completed = new Set(browser.journeys);
const missingJourneys = requiredBrowserJourneys().filter(
  ({ id }) => !completed.has(id),
);
if (missingJourneys.length)
  throw Error(
    `Coverage requires the complete browser suite; missing: ${missingJourneys.map(({ title }) => title).join('; ')}`,
  );
const map = createCoverageMap({});
for (const report of [
  await read('unit/coverage-final.json'),
  await read('browser-final.json'),
]) {
  for (const data of Object.values(report)) {
    const relative = data.path.replaceAll('\\', '/').split('/web/').at(-1);
    if (!coveredSource(relative))
      throw Error(`Unexpected coverage source: ${data.path}`);
    const filename = path.join(web, relative);
    map.addFileCoverage({ ...data, path: filename });
  }
}
const absent = authoredCode()
  .filter((file) => file.startsWith('web/') && coveredSource(file.slice(4)))
  .filter((file) => !map.files().includes(path.join(root, file)));
if (absent.length)
  throw Error(`Coverage omitted authored files: ${absent.join(', ')}`);
const context = createContext({
  dir: path.join(web, 'coverage/combined'),
  coverageMap: map,
});
for (const report of ['text-summary', 'json-summary', 'json', 'lcov', 'html'])
  create(report).execute(context);
const target = { statements: 80, lines: 80, functions: 80, branches: 70 };
const summary = map.getCoverageSummary().toJSON();
const failures = Object.entries(target).filter(
  ([metric, required]) => summary[metric].pct < required,
);
if (failures.length)
  throw Error(
    `Application coverage below target: ${failures.map(([metric, required]) => `${metric} ${summary[metric].pct}% < ${required}%`).join('; ')}`,
  );
