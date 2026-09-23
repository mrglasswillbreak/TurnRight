import { structuralIssues } from './validation';
import { openDB } from 'idb';
import { boundedMap } from './asset-pool';
import type {
  CampusData,
  CampusPackage,
  PackageAsset,
  ReportDraft,
} from './types';
export const ASSET_CACHE = 'turnright-assets-v1';
const audits = new Map<string, Promise<boolean[]>>();
function auditAssets(manifest: CampusPackage): Promise<boolean[]> {
  const key = JSON.stringify(manifest.assets);
  const current = audits.get(key);
  if (current) return current;
  const result = caches
    .open(ASSET_CACHE)
    .then((cache) =>
      boundedMap(manifest.assets, async (a) => {
        const response = await cache.match(a.url);
        return !!response && (await verifiedAsset(response, a));
      }),
    )
    .finally(() => audits.delete(key));
  audits.set(key, result);
  return result;
}
let connection: ReturnType<typeof openDB> | undefined;
const database = () =>
  (connection ??= openDB('turnright', 1, {
    upgrade(db) {
      db.createObjectStore('meta');
      db.createObjectStore('packages');
      db.createObjectStore('preferences');
    },
    blocking() {
      void connection?.then((db) => db.close());
      connection = undefined;
    },
    terminated() {
      connection = undefined;
    },
  }).catch((error) => {
    connection = undefined;
    throw error;
  }));
export const hashBytes = async (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
export async function getPreference<T>(key: string, fallback: T): Promise<T> {
  try {
    return (await (await database()).get('preferences', key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export async function setPreference(key: string, value: unknown) {
  await (await database()).put('preferences', value, key);
}
export async function discardReportDraft(key: string) {
  const transaction = (await database()).transaction(
    'preferences',
    'readwrite',
  );
  const drafts: ReportDraft[] =
    (await transaction.store.get('report-drafts')) || [];
  await transaction.store.delete(key);
  await transaction.store.put(
    drafts.filter((draft) => draft.key !== key),
    'report-drafts',
  );
  await transaction.done;
}
export async function latestPackage(): Promise<CampusPackage> {
  const response = await fetch('/packages/latest.json', {
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      'Could not check for campus updates. Your downloaded map is unchanged.',
    );
  const manifest = (await response.json()) as CampusPackage;
  if (![1, 2, 3].includes(manifest.schemaVersion) || !manifest.assets?.length)
    throw new Error('This map version needs a newer app.');
  return manifest;
}
export async function getActivePackage(): Promise<{
  manifest: CampusPackage;
  data: CampusData;
  complete: boolean;
  visualsComplete: boolean;
} | null> {
  const db = await database();
  const version = await db.get('meta', 'active');
  const record = version && (await db.get('packages', version));
  if (!record) return null;
  const visualUrls = new Set<string>(record.manifest.visuals?.assetUrls || []);
  const present = await auditAssets(record.manifest);
  const visualsComplete =
    visualUrls.size > 0 &&
    visualManifestMatches(record.data, record.manifest) &&
    [...visualUrls].every((url) => {
      const index = record.manifest.assets.findIndex(
        (a: PackageAsset) => a.url === url,
      );
      return index >= 0 && present[index];
    });
  return {
    ...record,
    complete:
      present.every(Boolean) &&
      (!visualUrls.size || visualsComplete) &&
      visualManifestMatches(record.data, record.manifest),
    visualsComplete,
  };
}
function visualManifestMatches(data: CampusData, manifest: CampusPackage) {
  const sectors = data.visuals?.sectors || [],
    urls = manifest.visuals?.assetUrls || [];
  return (
    photoManifestMatches(data, manifest) &&
    sectors.length === urls.length &&
    new Set(urls).size === urls.length &&
    sectors.every(
      (sector) =>
        urls.includes(sector.url) &&
        manifest.assets.some(
          (a) =>
            a.url === sector.url &&
            a.bytes === sector.bytes &&
            a.sha256 === sector.sha256,
        ),
    )
  );
}
export function photoManifestMatches(
  data: CampusData,
  manifest: CampusPackage,
) {
  const photos = data.photos || [],
    urls = [...new Set(photos.map((p) => p.url))];
  const declared = manifest.photos?.assetUrls || [];
  return (
    urls.length === declared.length &&
    new Set(declared).size === declared.length &&
    urls.every((url) => declared.includes(url)) &&
    photos.every((p) =>
      manifest.assets.some(
        (a) => a.url === p.url && a.bytes === p.bytes && a.sha256 === p.sha256,
      ),
    ) &&
    (manifest.photos?.bytes || 0) ===
      manifest.assets
        .filter((a) => urls.includes(a.url))
        .reduce((n, a) => n + a.bytes, 0)
  );
}
async function verifiedAsset(response: Response, asset: PackageAsset) {
  const bytes = await response.arrayBuffer();
  return (
    bytes.byteLength === asset.bytes &&
    (await hashBytes(bytes)) === asset.sha256
  );
}
export async function loadCampus(): Promise<{
  data: CampusData;
  manifest: CampusPackage;
  downloaded: boolean;
  verification?: Promise<boolean>;
}> {
  const db = await database().catch(() => null);
  const version = db && (await db.get('meta', 'active'));
  const active = version && (await db!.get('packages', version));
  if (active && [1, 2, 3].includes(active.manifest.schemaVersion)) {
    const manifest: CampusPackage = active.manifest;
    const core = manifest.assets.find((a) => a.url === manifest.dataUrl);
    const response =
      core && (await (await caches.open(ASSET_CACHE)).match(core.url));
    if (core && response && (await verifiedAsset(response.clone(), core))) {
      const data: CampusData = await response.json();
      if (
        data.version === manifest.version &&
        data.schemaVersion === manifest.schemaVersion &&
        !structuralIssues(data).length
      )
        return {
          data,
          manifest,
          downloaded: false,
          verification: auditAssets(manifest)
            .then(
              (present) =>
                present.every(Boolean) && visualManifestMatches(data, manifest),
            )
            .catch(() => false),
        };
    }
  }
  const manifest = await latestPackage();
  const response = await fetch(manifest.dataUrl, {
    signal: AbortSignal.timeout(20000),
  }).catch((error) => {
    if (error instanceof DOMException && error.name === 'TimeoutError')
      throw new Error(
        'Campus data took too long to load. Check your connection and retry.',
      );
    throw error;
  });
  if (!response.ok)
    throw new Error(
      'Campus data could not load. Connect to the internet and retry.',
    );
  const bytes = await response.arrayBuffer();
  const asset = manifest.assets.find((a) => a.url === manifest.dataUrl);
  if (!asset || (await hashBytes(bytes)) !== asset.sha256)
    throw new Error(
      'Campus data did not pass its integrity check. Please retry.',
    );
  const data = JSON.parse(new TextDecoder().decode(bytes)) as CampusData;
  if (
    data.schemaVersion !== manifest.schemaVersion ||
    structuralIssues(data).length
  )
    throw new Error('This campus package is invalid or needs a newer app.');
  return {
    data,
    manifest,
    downloaded: false,
  };
}
export async function installPackage(
  manifest: CampusPackage,
  progress: (percent: number) => void,
  signal?: AbortSignal,
  activate = true,
) {
  if (![1, 2, 3].includes(manifest.schemaVersion))
    throw new Error('Update the app before downloading this map.');
  if (
    manifest.visuals &&
    (manifest.visuals.bytes > 12 * 1024 * 1024 ||
      manifest.visuals.assetUrls.some(
        (url) => !manifest.assets.some((a) => a.url === url),
      ) ||
      manifest.assets
        .filter((a) => manifest.visuals!.assetUrls.includes(a.url))
        .reduce((sum, a) => sum + a.bytes, 0) !== manifest.visuals.bytes)
  )
    throw new Error('Incomplete visual download manifest.');
  if (
    new Set(manifest.assets.map((a) => a.url)).size !==
      manifest.assets.length ||
    manifest.assets.some(
      (a) =>
        !Number.isSafeInteger(a.bytes) ||
        a.bytes <= 0 ||
        !/^[a-f0-9]{64}$/.test(a.sha256),
    ) ||
    manifest.bytes !== manifest.assets.reduce((n, a) => n + a.bytes, 0)
  )
    throw new Error(
      'Invalid download manifest. Your previous map is unchanged.',
    );
  const estimate = await navigator.storage?.estimate();
  if (
    estimate?.quota &&
    estimate.usage &&
    estimate.quota - estimate.usage < manifest.bytes * 1.15
  )
    throw new Error(
      'Not enough storage. Free some space on this device and retry.',
    );
  const cache = await caches.open(ASSET_CACHE);
  let loaded = 0;
  let data: CampusData | undefined;
  await boundedMap(manifest.assets, async (asset) => {
    if (signal?.aborted)
      throw new DOMException('Download cancelled', 'AbortError');
    if (
      !/^\/(packages|audio|glyphs)\//.test(asset.url) ||
      asset.url.includes('..')
    )
      throw new Error('Invalid package asset path');
    let response = await cache.match(asset.url);
    let bytes = response && (await response.clone().arrayBuffer());
    if (
      !bytes ||
      bytes.byteLength !== asset.bytes ||
      (await hashBytes(bytes)) !== asset.sha256
    ) {
      const timeout = AbortSignal.timeout(30000);
      response = await fetch(asset.url, {
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error('The download was interrupted. Retry to continue.');
      bytes = await response.arrayBuffer();
      if (
        bytes.byteLength !== asset.bytes ||
        (await hashBytes(bytes)) !== asset.sha256
      )
        throw new Error(
          'A downloaded file failed verification. Your previous map is safe; please retry.',
        );
      await cache.put(
        asset.url,
        new Response(bytes, { headers: response.headers }),
      );
    }
    if (asset.url === manifest.dataUrl)
      data = JSON.parse(new TextDecoder().decode(bytes));
    loaded += asset.bytes;
    progress(Math.round((loaded / manifest.bytes) * 100));
  });
  if (
    !data ||
    data.version !== manifest.version ||
    data.schemaVersion !== manifest.schemaVersion ||
    structuralIssues(data).length
  )
    throw new Error('Incomplete campus package');
  if (!visualManifestMatches(data, manifest))
    throw new Error(
      'The model catalogue does not match the verified download manifest.',
    );
  const db = await database();
  // The sole active pointer is committed after every file has been verified.
  const tx = db.transaction(['packages', 'meta'], 'readwrite');
  await tx.objectStore('packages').put({ manifest, data }, manifest.version);
  await tx
    .objectStore('meta')
    .put(manifest.version, activate ? 'active' : 'pending');
  await tx.done;
  await navigator.storage?.persist?.().catch(() => false);
  return data;
}
export async function activatePending() {
  const db = await database(),
    pending = await db.get('meta', 'pending');
  if (!pending) return false;
  const record = await db.get('packages', pending);
  if (
    !record ||
    !visualManifestMatches(record.data, record.manifest) ||
    (await auditAssets(record.manifest)).some((present) => !present)
  )
    return false;
  const tx = db.transaction('meta', 'readwrite');
  await tx.store.put(pending, 'active');
  await tx.store.delete('pending');
  await tx.done;
  return true;
}
export async function deletePackages() {
  const db = await database();
  const tx = db.transaction(['packages', 'meta'], 'readwrite');
  await tx.objectStore('packages').clear();
  await tx.objectStore('meta').clear();
  await tx.done;
  await caches.delete(ASSET_CACHE);
}
