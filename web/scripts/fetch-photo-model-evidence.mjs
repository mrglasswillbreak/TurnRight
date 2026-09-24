import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source = JSON.parse(
  await fs.readFile('../data/photo-models/baseline.json', 'utf8'),
);
const directory = 'work/photo-model';
await fs.mkdir(directory, { recursive: true });
async function verified(asset) {
  if (!asset.url.startsWith('/packages/') || asset.url.includes('..'))
    throw Error('Invalid evidence asset path');
  const response = await fetch(new URL(asset.url, source.origin), {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error(`Unavailable evidence asset: ${asset.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    bytes.length !== asset.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== asset.sha256
  )
    throw Error(`Evidence integrity failed: ${asset.url}`);
  return bytes;
}
await fs.writeFile(
  `${directory}/manifest.json`,
  await verified(source.manifest),
);
const bytes = await verified(source.data);
const data = JSON.parse(bytes);
if (data.version !== source.version)
  throw Error('Evidence snapshot version changed');
await fs.writeFile(`${directory}/campus.json`, bytes);
for (const photo of data.photos)
  await fs.writeFile(
    `${directory}/${photo.id.replaceAll(/[^a-z0-9-]/gi, '_')}.webp`,
    await verified(photo),
  );
console.log(
  `Verified ${data.photos.length} published photographs from ${data.version}.`,
);
