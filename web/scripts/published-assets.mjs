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
export async function requestPublishedAsset(
  origin,
  pathname,
  timeout,
  { headers = {} } = {},
) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password)
    throw new Error('Published map URL must be HTTPS');
  let target = new URL(pathname, base);
  for (let attempt = 0; attempt < 10; attempt++) {
    if (target.origin !== base.origin || target.username || target.password)
      throw Error('Published asset origin changed');
    assetTarget('.', target.pathname);
    const response = await fetch(target, {
      headers,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeout),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const next = new URL(response.headers.get('location') || '', target);
    if (next.origin === base.origin) {
      target = next;
      continue;
    }
    // Protection configuration propagates independently to edge asset paths.
    if (
      headers['x-vercel-protection-bypass'] &&
      next.hostname === 'vercel.com' &&
      /^\/(sso-api|login)/.test(next.pathname)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    throw Error(
      `Published asset ${target.pathname} redirected outside its origin (${next.origin}${next.pathname})`,
    );
  }
  throw Error(
    `Published asset ${pathname} remained protected or redirected repeatedly`,
  );
}

/** Keep additive detail assets outside the unchanged compatible-package limits. */
export function validatePublishedManifest(manifest) {
  if (
    !manifest ||
    ![1, 2, 3].includes(manifest.schemaVersion) ||
    !/^[a-z0-9][a-z0-9-]*-[a-f0-9]+$/.test(manifest.version) ||
    !Array.isArray(manifest.assets) ||
    !Number.isSafeInteger(manifest.bytes) ||
    manifest.bytes <= 0
  )
    throw new Error('Unsupported published map manifest');
  if (
    new Set(manifest.assets.map((a) => a?.url)).size !==
      manifest.assets.length ||
    manifest.assets.some(
      (a) =>
        !a ||
        typeof a.url !== 'string' ||
        !Number.isSafeInteger(a.bytes) ||
        a.bytes <= 0 ||
        !/^[a-f0-9]{64}$/.test(a.sha256),
    ) ||
    manifest.bytes !== manifest.assets.reduce((n, a) => n + a.bytes, 0)
  )
    throw new Error('Invalid published asset manifest');
  const assets = new Map(manifest.assets.map((a) => [a.url, a])),
    grouped = new Map();
  for (const name of ['photos', 'visuals', 'textures', 'detailedModels']) {
    const group = manifest[name];
    if (group === undefined) continue;
    if (
      !group ||
      !Array.isArray(group.assetUrls) ||
      !Number.isSafeInteger(group.bytes) ||
      group.bytes < 0 ||
      group.assetUrls.some((url) => {
        const prior = grouped.get(url),
          sharedTexture =
            name === 'detailedModels' &&
            prior === 'textures' &&
            /^\/packages\/model-texture-[a-f0-9]{64}\.(png|jpg|webp)$/.test(
              url,
            );
        if (
          !assets.has(url) ||
          (prior && !sharedTexture) ||
          url === manifest.dataUrl
        )
          return true;
        grouped.set(url, name);
        return false;
      }) ||
      group.bytes !==
        group.assetUrls.reduce((n, url) => n + assets.get(url).bytes, 0)
    )
      throw new Error('Invalid published asset group');
  }
  const photoUrls = new Set(manifest.photos?.assetUrls || []),
    detailUrls = new Set(manifest.detailedModels?.assetUrls || []),
    baseTextures = new Set(manifest.textures?.assetUrls || []);
  const regular = manifest.assets.filter(
    (a) =>
      !photoUrls.has(a.url) &&
      (!detailUrls.has(a.url) || baseTextures.has(a.url)),
  );
  if (
    regular.length > 200 ||
    regular.reduce((n, a) => n + a.bytes, 0) > 25 * 1024 * 1024 ||
    (manifest.visuals?.bytes || 0) + (manifest.textures?.bytes || 0) >
      12 * 1024 * 1024 ||
    [...photoUrls].some(
      (url) =>
        url !== `/packages/photos/${assets.get(url).sha256}.webp` ||
        assets.get(url).bytes > 250 * 1024,
    ) ||
    manifest.assets.some(
      (a) => a.url.startsWith('/packages/detail-') && !detailUrls.has(a.url),
    ) ||
    (manifest.detailedModels &&
      (!detailUrls.size || !assets.has(manifest.dataUrl))) ||
    [...detailUrls].some((url) => {
      const asset = assets.get(url),
        texture =
          /^\/packages\/model-texture-([a-f0-9]{64})\.(png|jpg|webp)$/.exec(
            url,
          ),
        geometry = /^\/packages\/detail-([a-f0-9]{64})\.json(?:\.gz)?$/.exec(
          url,
        );
      return (
        (texture || geometry)?.[1] !== asset.sha256 ||
        asset.bytes > (texture ? 4 : 16) * 1024 * 1024
      );
    })
  )
    throw new Error('Invalid published asset manifest');
  return detailUrls;
}

export async function preservePublished(
  publicDir,
  origin,
  activate = false,
  expectedVersion,
  manifestPath = '/packages/latest.json',
  { headers = {} } = {},
) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password)
    throw new Error('Published map URL must be HTTPS');
  assetTarget(publicDir, manifestPath);
  const request = (pathname, timeout) =>
    requestPublishedAsset(origin, pathname, timeout, { headers });
  const response = await request(manifestPath, 20000);
  if (!response.ok)
    throw new Error(
      'Published map is unavailable. Build stopped to preserve the working release.',
    );
  const manifest = await response.json().catch(() => {
    throw new Error(
      'Published map did not return a JSON manifest. Check PUBLISHED_MAP_URL; a deployment sign-in page cannot supply the published assets.',
    );
  });
  const detailUrls = validatePublishedManifest(manifest);
  if (expectedVersion && manifest.version !== expectedVersion)
    throw new Error(
      'The public campus changed during this build. Create a fresh reviewed preview.',
    );
  const readAsset = async (asset) => {
    const target = assetTarget(publicDir, asset.url);
    const valid = (bytes) =>
      bytes.length === asset.bytes &&
      createHash('sha256').update(bytes).digest('hex') === asset.sha256;
    let bytes = await fs.readFile(target).catch(() => null);
    if (bytes && valid(bytes)) return { bytes, cached: true };
    const result = await request(asset.url, 30000);
    if (!result.ok) throw new Error('A preceding release asset is unavailable');
    bytes = Buffer.from(await result.arrayBuffer());
    if (!valid(bytes)) throw new Error('Published asset checksum mismatch');
    return { bytes, cached: false };
  };
  let core;
  if (detailUrls.size) {
    core = await readAsset(
      manifest.assets.find((a) => a.url === manifest.dataUrl),
    );
    const data = JSON.parse(core.bytes.toString('utf8'));
    // Reuse the pure descriptor contract used by publication and offline validation.
    const { tsImport } = await import('tsx/esm/api');
    const { detailedManifestMatches } = await tsImport(
      '../src/model-lod.ts',
      import.meta.url,
    );
    if (
      data.version !== manifest.version ||
      data.schemaVersion !== manifest.schemaVersion ||
      !detailedManifestMatches(data, manifest)
    )
      throw new Error(
        'Published detailed catalogue does not match its manifest',
      );
  }
  for (const asset of manifest.assets) {
    const result =
      asset.url === manifest.dataUrl && core ? core : await readAsset(asset);
    if (result.cached) continue;
    const target = assetTarget(publicDir, asset.url);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, result.bytes);
  }
  const json = JSON.stringify(manifest, null, 2),
    versionDir = path.join(publicDir, 'packages', manifest.version);
  await fs.mkdir(versionDir, { recursive: true });
  await fs.writeFile(path.join(versionDir, 'manifest.json'), json);
  if (activate)
    await fs.writeFile(path.join(publicDir, 'packages/latest.json'), json);
  return manifest;
}
