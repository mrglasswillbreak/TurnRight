import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { authoredCode } from './source-files.mjs';
import { root } from './toolchain.mjs';

// Shared by Vitest's zero-hit inventory and the combined Node/browser gate.
export const coverageIncludes = [
  'src/**/*.{ts,tsx,mjs}',
  'components/**/*.{ts,tsx}',
  'lib/**/*.{ts,tsx,mjs}',
  'hooks/**/*.{ts,tsx,mjs}',
  'server/**/*.{ts,mjs}',
  'api/**/*.ts',
];
export const coverageExcludes = ['**/*.d.ts', '**/*.d.mts'];
export function coveredSource(file) {
  return (
    /^(src|components|lib|hooks|server|api)\/.*\.(?:ts|tsx|mjs)$/.test(file) &&
    !/\.d\.(?:ts|mts)$/.test(file)
  );
}

export async function coverageSnapshot() {
  const hash = createHash('sha256');
  const files = [
    ...authoredCode(),
    'package.json',
    'web/package.json',
    'package-lock.json',
    '.node-version',
  ].sort();
  for (const file of files) {
    hash.update(file).update('\0');
    hash
      .update(
        (await readFile(path.join(root, file), 'utf8')).replaceAll(
          '\r\n',
          '\n',
        ),
      )
      .update('\0');
  }
  return hash.digest('hex');
}
