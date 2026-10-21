import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
const webRequire = createRequire(
  new URL('../web/package.json', import.meta.url),
);

/** Resolve a declared tool, regardless of npm's physical hoisting layout. */
export function packageBin(name, command = name) {
  const manifest = webRequire.resolve(`${name}/package.json`);
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8'));
  const relative = typeof bin === 'string' ? bin : bin?.[command];
  if (!relative) throw Error(`Package ${name} does not provide ${command}.`);
  return path.resolve(path.dirname(manifest), relative);
}
