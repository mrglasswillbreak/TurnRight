import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
const directory = path.resolve('dist/voice/en-GB-v1');
const manifest = JSON.parse(
  await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'),
);
const precache = await fs.readFile('dist/sw.js', 'utf8');
const names = await fs.readdir(directory);
let total = 0;
for (const name of names) {
  const bytes = await fs.readFile(path.join(directory, name));
  total += bytes.length;
  if (!precache.includes(`voice/en-GB-v1/${name}`))
    throw new Error(`Voice asset not precached: ${name}`);
}
if (total > 8 * 1024 * 1024)
  throw new Error('Offline voice exceeds its 8 MiB budget');
for (const [key, clip] of Object.entries(manifest.clips)) {
  const bytes = await fs.readFile(path.join('dist', clip.url));
  if (
    bytes.length !== clip.bytes ||
    crypto.createHash('sha256').update(bytes).digest('hex') !== clip.sha256
  )
    throw new Error(`Voice integrity failure: ${key}`);
}
console.log(
  `Natural offline voice: ${(total / 1024 / 1024).toFixed(2)} MiB / 8 MiB; ${Object.keys(manifest.clips).length} clips; precache verified`,
);
