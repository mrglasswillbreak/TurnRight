import { readdir, stat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory = new URL('../dist/world/', import.meta.url);
const assets = await readdir(directory, { recursive: true });
const files = [];
let bytes = 0;
for (const name of assets) {
  const info = await stat(new URL(name.replaceAll('\\', '/'), directory));
  if (info.isFile()) {
    files.push(name.replaceAll('\\', '/'));
    bytes += info.size;
  }
}
if (!files.includes('manifest.json') || bytes > 8 * 1024 * 1024)
  throw new Error('World assets missing or exceed 8 MiB budget');
const manifest = JSON.parse(
  await readFile(new URL('manifest.json', directory), 'utf8'),
);
const worker = await readFile(
  new URL('../dist/sw.js', import.meta.url),
  'utf8',
);
for (const name of files)
  if (!worker.includes(`world/${name}`))
    throw new Error(`World asset not precached: ${name}`);
for (const asset of manifest.assets) {
  const content = await readFile(
    new URL(asset.url.slice('/world/'.length), directory),
  );
  if (
    content.length !== asset.bytes ||
    createHash('sha256').update(content).digest('hex') !== asset.sha256
  )
    throw new Error(`Corrupt world asset: ${asset.url}`);
}
console.log(
  `Offline world: ${(bytes / 1024 / 1024).toFixed(2)} / 8 MiB; hashes and precache verified`,
);
