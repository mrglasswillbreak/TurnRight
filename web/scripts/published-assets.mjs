import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function assetTarget(publicDir, url) {
  const decoded = decodeURIComponent(url);
  if (
    !/^\/(packages|audio|glyphs)\//.test(decoded) ||
    decoded.includes('..') ||
    decoded.includes('\\') ||
    decoded.includes('?') ||
    decoded.includes('#')
  )
    throw new Error('Invalid published asset path');
  const target = path.resolve(publicDir, '.' + decoded);
  if (!target.startsWith(path.resolve(publicDir) + path.sep))
    throw new Error('Asset escaped public directory');
  return target;
}
export async function preservePublished(
  publicDir,
  origin,
  activate = false,
  expectedVersion,
) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password)
    throw new Error('Published map URL must be HTTPS');
  const response = await fetch(new URL('/packages/latest.json', base), {
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(
      'Published map is unavailable. Build stopped to preserve the working release.',
    );
  const manifest = await response.json().catch(() => {
    throw new Error(
      'Published map did not return a JSON manifest. Check PUBLISHED_MAP_URL; a deployment sign-in page cannot supply the published assets.',
    );
  });
  if (
    !manifest ||
    ![1, 2, 3].includes(manifest.schemaVersion) ||
    !/^lasu-[a-f0-9]+$/.test(manifest.version) ||
    !Array.isArray(manifest.assets) ||
    !Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0
  )
    throw new Error('Unsupported published map manifest');
  const photoUrls = new Set(manifest.photos?.assetUrls || []);
  const regular = manifest.assets.filter((a) => !photoUrls.has(a.url));
  if (regular.length > 200 || regular.reduce((n, a) => n + a.bytes, 0) > 25 * 1024 * 1024 ||
      new Set(manifest.assets.map((a) => a.url)).size !== manifest.assets.length ||
      manifest.assets.some((a) => !Number.isSafeInteger(a.bytes) || a.bytes <= 0 || !/^[a-f0-9]{64}$/.test(a.sha256)) ||
      manifest.bytes !== manifest.assets.reduce((n, a) => n + a.bytes, 0) ||
      [...photoUrls].some((url) => !manifest.assets.some((a) => a.url === url && a.url === `/packages/photos/${a.sha256}.webp` && a.bytes <= 250 * 1024)) ||
      (manifest.photos?.bytes || 0) !== manifest.assets.filter((a) => photoUrls.has(a.url)).reduce((n, a) => n + a.bytes, 0))
    throw new Error('Invalid published asset manifest');
  if (expectedVersion && manifest.version !== expectedVersion)
    throw new Error(
      'The public campus changed during this build. Create a fresh reviewed preview.',
    );
  for (const asset of manifest.assets) {
    const target = assetTarget(publicDir, asset.url);
    const valid = (bytes) =>
      bytes.length === asset.bytes &&
      createHash('sha256').update(bytes).digest('hex') === asset.sha256;
    let bytes = await fs.readFile(target).catch(() => null);
    if (bytes && valid(bytes)) continue;
    const result = await fetch(new URL(asset.url, base), {
      signal: AbortSignal.timeout(30000),
    });
    if (!result.ok) throw new Error('A preceding release asset is unavailable');
    bytes = Buffer.from(await result.arrayBuffer());
    if (!valid(bytes)) throw new Error('Published asset checksum mismatch');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
  const json = JSON.stringify(manifest, null, 2),
    versionDir = path.join(publicDir, 'packages', manifest.version);
  await fs.mkdir(versionDir, { recursive: true });
  await fs.writeFile(path.join(versionDir, 'manifest.json'), json);
  if (activate)
    await fs.writeFile(path.join(publicDir, 'packages/latest.json'), json);
  return manifest;
}
