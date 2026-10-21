import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createCoverageMap } from '@vitest/istanbul-lib-coverage';
import { root } from './toolchain.mjs';
import { coverageSnapshot } from './coverage-scope.mjs';
import { convertBrowserEntry } from './browser-coverage-entry.mjs';
import { collectBrowserEntry } from './browser-coverage-merge.mjs';

const web = path.join(root, 'web');
const directory = path.join(web, 'coverage/browser-raw');
const map = createCoverageMap({});
const snapshot = await coverageSnapshot();
const journeys = new Set();
const entries = new Map();
const files = (await readdir(directory)).filter((file) =>
  file.endsWith('.json.gz'),
);
if (!files.length) throw Error('No browser coverage receipts found.');
for (const file of files) {
  const receipt = JSON.parse(
    gunzipSync(await readFile(path.join(directory, file))).toString('utf8'),
  );
  if (receipt.snapshot !== snapshot)
    throw Error(`Stale browser coverage: ${receipt.title}`);
  if (receipt.status !== 'passed')
    throw Error(`Browser journey did not pass: ${receipt.title}`);
  if (!receipt.testId || journeys.has(receipt.testId))
    throw Error(
      `Missing or duplicate browser journey identity: ${receipt.title}`,
    );
  journeys.add(receipt.testId);
  for (const entry of receipt.entries) {
    collectBrowserEntry(entries, entry);
  }
}
for (const { source, coverage } of entries.values()) {
  map.merge(await convertBrowserEntry({ source, ...coverage }));
}
await writeFile(
  path.join(web, 'coverage/browser-final.json'),
  JSON.stringify(map.toJSON()),
);
await writeFile(
  path.join(web, 'coverage/browser-receipt.json'),
  JSON.stringify({ snapshot, status: 'passed', journeys: [...journeys] }),
);
console.log(
  `Collected ${files.length} passing browser journeys across ${map.files().length} source files.`,
);
