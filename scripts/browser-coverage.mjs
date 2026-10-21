import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { convert } from 'ast-v8-to-istanbul';
import { parseAstAsync } from 'vitest/node';
import { createCoverageMap } from '@vitest/istanbul-lib-coverage';
import { root } from './toolchain.mjs';
import { coverageSnapshot } from './coverage-scope.mjs';

const web = path.join(root, 'web');
const directory = path.join(web, 'coverage/browser-raw');
const map = createCoverageMap({});
const snapshot = await coverageSnapshot();
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
  for (const entry of receipt.entries) {
    const relative = decodeURIComponent(new URL(entry.url).pathname).slice(1);
    if (
      !/^(src|components|lib|hooks)\//.test(relative) ||
      relative.includes('..')
    )
      continue;
    const filename = path.join(web, relative);
    const url = pathToFileURL(filename).href;
    const encoded = entry.source?.match(
      /sourceMappingURL=data:application\/json[^,]*;base64,([^\s]+)/,
    )?.[1];
    if (!encoded) throw Error(`Missing source map for ${relative}`);
    const sourceMap = JSON.parse(
      Buffer.from(encoded, 'base64').toString('utf8'),
    );
    sourceMap.sources = sourceMap.sources.map(
      (source) => new URL(source, url).href,
    );
    const converted = await convert({
      code: entry.source,
      ast: parseAstAsync(entry.source),
      sourceMap,
      coverage: { url, functions: entry.functions },
    });
    map.merge(converted);
  }
}
await writeFile(
  path.join(web, 'coverage/browser-final.json'),
  JSON.stringify(map.toJSON()),
);
await writeFile(
  path.join(web, 'coverage/browser-receipt.json'),
  JSON.stringify({ snapshot, status: 'passed', journeys: files.length }),
);
console.log(
  `Collected ${files.length} passing browser journeys across ${map.files().length} source files.`,
);
