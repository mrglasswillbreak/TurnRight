import fs from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const manifest = JSON.parse(
  await fs.readFile('dist/.vite/manifest.json', 'utf8'),
);
const collect = (key, found = new Set()) => {
  if (found.has(key)) return found;
  if (!manifest[key]) throw Error(`Missing chunk ${key}`);
  found.add(key);
  for (const child of manifest[key].imports || []) collect(child, found);
  return found;
};
const startup = collect('index.html'),
  renderer = collect('src/campus-model-layer.ts'),
  workspace = collect('src/PhotoModelWorkspace.tsx');
if (workspace.has('src/Admin.tsx'))
  throw Error(
    'Shared model tools must not import the owner authentication entry',
  );
const extra = [...new Set([...renderer, ...workspace])].filter(
  (k) => !startup.has(k),
);
let bytes = 0;
for (const key of extra)
  bytes += gzipSync(await fs.readFile(`dist/${manifest[key].file}`)).length;
if (bytes > 300 * 1024)
  throw Error(`3D renderer and guided editor exceed 300 KiB gzip: ${bytes}`);
const sw = await fs.readFile('dist/sw.js', 'utf8');
for (const key of extra)
  if (!sw.includes(manifest[key].file))
    throw Error(`3D offline chunk missing: ${key}`);
console.log(
  `Lazy 3D renderer and guided editor (shared dependencies counted): ${(bytes / 1024).toFixed(1)} / 300 KiB gzip`,
);
