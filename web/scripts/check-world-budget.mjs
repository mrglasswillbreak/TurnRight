import { readdir, stat, readFile } from 'node:fs/promises';
const directory = new URL('../dist/world/', import.meta.url);
const assets = await readdir(directory);
let bytes = 0;
for (const name of assets) bytes += (await stat(new URL(name, directory))).size;
if (!assets.includes('countries-v5.1.2.geojson') || bytes > 500 * 1024)
  throw new Error('World assets missing or exceed 500 KB budget');
const worker = await readFile(
  new URL('../dist/sw.js', import.meta.url),
  'utf8',
);
for (const name of assets)
  if (!worker.includes(`world/${name}`))
    throw new Error(`World asset not precached: ${name}`);
console.log(
  `Offline world assets: ${(bytes / 1024).toFixed(1)} KB / 500 KB; precache verified`,
);
