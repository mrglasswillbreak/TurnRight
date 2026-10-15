import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { preserveCampusCatalogue } from './published-campus-catalogue.mjs';

// Public, integrity-checked assets only. Never copy private editor exports here.
const directory = resolve(import.meta.dirname, '../work/docs-fixture/public');
const origin = process.env.DOCS_PUBLIC_ORIGIN || 'https://turnright.vercel.app';
const result = await preserveCampusCatalogue(directory, origin);
await writeFile(
  resolve(directory, '../receipt.json'),
  JSON.stringify(
    {
      fetchedAt: new Date().toISOString(),
      origin,
      catalogueRevision: result.revision,
      campuses: result.catalogue.campuses.map(({ id, name, manifestUrl }) => ({
        id,
        name,
        manifestUrl,
      })),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Prepared ${result.catalogue.campuses.length} verified public campus packages in ${directory}.`,
);
