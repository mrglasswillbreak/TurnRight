import { boundedMap } from './asset-pool';
import type { CampusPackage, PackageAsset } from './types';

/** Resume against remaining bytes; verified cached assets already consume quota. */
export async function assertPackageStorage(
  manifest: CampusPackage,
  cache: Cache,
  verified: (response: Response, asset: PackageAsset) => Promise<boolean>,
  signal?: AbortSignal,
) {
  const estimate = await navigator.storage?.estimate();
  if (estimate?.quota === undefined || estimate.usage === undefined) return;
  const available = estimate.quota - estimate.usage;
  // IndexedDB also stores a parsed copy of the campus document.
  const metadata =
    manifest.assets.find((a) => a.url === manifest.dataUrl)?.bytes || 0;
  if (available >= (manifest.bytes + metadata) * 1.15) return;
  let missing = manifest.bytes;
  await boundedMap(manifest.assets, async (asset) => {
    signal?.throwIfAborted();
    const response = await cache.match(asset.url);
    if (response && (await verified(response, asset))) missing -= asset.bytes;
  });
  signal?.throwIfAborted();
  if (available < (missing + metadata) * 1.15)
    throw new Error(
      'Not enough storage. Free some space on this device and retry.',
    );
}
