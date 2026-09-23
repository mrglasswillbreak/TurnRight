import fs from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const manifest = JSON.parse(
  await fs.readFile('dist/.vite/manifest.json', 'utf8'),
);
const collect = (key, found = new Set()) => {
  if (found.has(key)) return found;
  if (!manifest[key]) throw Error(`Missing bundle ${key}`);
  found.add(key);
  for (const dependency of manifest[key].imports || [])
    collect(dependency, found);
  return found;
};
const publicKeys = collect('index.html');
const editorKeys = collect('src/Admin.tsx');
const photos = manifest['src/PhotoManager.tsx'];
if (
  !photos?.isDynamicEntry ||
  publicKeys.has('src/PhotoManager.tsx') ||
  publicKeys.has('src/Admin.tsx')
)
  throw Error('Owner photo management must remain lazy-loaded');
const sizes = new Map(
  await Promise.all(
    [...new Set([...publicKeys, ...editorKeys, 'src/PhotoManager.tsx'])].map(
      async (key) => [
        key,
        gzipSync(await fs.readFile(`dist/${manifest[key].file}`)).length,
      ],
    ),
  ),
);
const sum = (keys) =>
  [...keys].reduce((total, key) => total + sizes.get(key), 0);
const checks = [
  ['Public startup JS (all static dependencies)', sum(publicKeys), 425 * 1024],
  [
    'Additional owner editor JS',
    sum([...editorKeys].filter((key) => !publicKeys.has(key))),
    // Include the Supabase client retained by configured production builds.
    185 * 1024,
  ],
  ['Lazy photo workspace JS', sizes.get('src/PhotoManager.tsx'), 12 * 1024],
];
for (const [label, bytes, budget] of checks) {
  console.log(`${label}: ${bytes} gzip bytes / ${budget}`);
  if (bytes > budget) throw Error(`${label} exceeds its regression budget`);
}
const sw = await fs.readFile('dist/sw.js', 'utf8');
if (!sw.includes(photos.file))
  throw Error('Offline preparation must cache the lazy photo workspace');
