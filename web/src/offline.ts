import { visualManifestMatches } from './offline-manifest';
export { photoManifestMatches } from './offline-manifest';
import {
  campusKey,
  requestedCampus,
  packageCampus,
  DEFAULT_CAMPUS,
} from './campus-context';
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
const preferenceKey = (key: string, campus = requestedCampus()) =>
  /^(saved$|recent$|visitor-layers$|report|editor-workspace:|photo-)/.test(key)
    ? campusKey(key, campus)
    : key;
export async function getPreference<T>(
  key: string,
  fallback: T,
  campus = requestedCampus(),
): Promise<T> {
  key = preferenceKey(key, campus);
  try {
    return (await (await database()).get('preferences', key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export async function setPreference(
  key: string,
  value: unknown,
  campus = requestedCampus(),
) {
  key = preferenceKey(key, campus);
  await (await database()).put('preferences', value, key);
}
export async function discardReportDraft(
  key: string,
  campus = requestedCampus(),
) {
  const transaction = (await database()).transaction(
    'preferences',
    'readwrite',
  );
  const drafts: ReportDraft[] =
    (await transaction.store.get(campusKey('report-drafts', campus))) || [];
  await transaction.store.delete(preferenceKey(key, campus));
  await transaction.store.put(
    drafts.filter((draft) => draft.key !== key),
    campusKey('report-drafts', campus),
  );
  await transaction.done;
}
export async function latestPackage(
  campus = requestedCampus(),
  signal?: AbortSignal,
): Promise<CampusPackage> {
  let url = '/packages/latest.json';
  if (campus !== DEFAULT_CAMPUS) {
    const { loadCampusCatalogue } = await import('./campus-catalogue');
    const identity = (await loadCampusCatalogue()).campuses.find(
      (c) => c.slug === campus,
    );
    if (!identity?.manifestUrl)
      throw new Error('This campus is not published or is unavailable.');
    url = identity.manifestUrl;
  }
  const response = await fetch(url, {
    cache: 'no-store',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      'Could not check for campus updates. Your downloaded map is unchanged.',
    );
  const manifest = (await response.json()) as CampusPackage;
  if (![1, 2, 3].includes(manifest.schemaVersion) || !manifest.assets?.length)
    throw new Error('This map version needs a newer app.');
  if (packageCampus(manifest) !== campus)
    throw new Error('Campus package identity does not match this link.');
  return manifest;
}
export async function getActivePackage(campus = requestedCampus()): Promise<{
  manifest: CampusPackage;
  data: CampusData;
  complete: boolean;
  visualsComplete: boolean;
} | null> {
  const db = await database();
  const version = await db.get('meta', campusKey('active', campus));
  const record = version && (await db.get('packages', version));
  if (!record) return null;
  const visualUrls = new Set<string>([
    ...(record.manifest.visuals?.assetUrls || []),
    ...(record.manifest.textures?.assetUrls || []),
    ...(record.manifest.detailedModels?.assetUrls || []),
  ]);
  const present = await auditAssets(record.manifest);
  const catalogueMatches = await visualManifestMatches(
    record.data,
    record.manifest,
  );
  const visualsComplete =
    visualUrls.size > 0 &&
    catalogueMatches &&
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
      catalogueMatches,
    visualsComplete,
  };
}
async function verifiedAsset(response: Response, asset: PackageAsset) {
  const bytes = await response.arrayBuffer();
  return (
    bytes.byteLength === asset.bytes &&
    (await hashBytes(bytes)) === asset.sha256
  );
}
export async function loadCampus(
  campus = requestedCampus(),
  signal?: AbortSignal,
): Promise<{
  data: CampusData;
  manifest: CampusPackage;
  downloaded: boolean;
  verification?: Promise<boolean>;
}> {
  const db = await database().catch(() => null);
  const version = db && (await db.get('meta', campusKey('active', campus)));
  const active = version && (await db!.get('packages', version));
  if (
    active &&
    packageCampus(active.manifest) === campus &&
    [1, 2, 3].includes(active.manifest.schemaVersion)
  ) {
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
  signal?.throwIfAborted();
  if (navigator.onLine === false)
    throw new Error(
      'This campus is not downloaded. Connect to the internet to open it.',
    );
  const manifest = await latestPackage(campus, signal);
  const response = await fetch(manifest.dataUrl, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
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
  if (
    !asset ||
    bytes.byteLength !== asset.bytes ||
    (await hashBytes(bytes)) !== asset.sha256
  )
    throw new Error(
      'Campus data did not pass its integrity check. Please retry.',
    );
  const data = JSON.parse(new TextDecoder().decode(bytes)) as CampusData;
  if (
    data.version !== manifest.version ||
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
  const cache = await caches.open(ASSET_CACHE);
  const { assertPackageStorage } = await import('./offline-space');
  await assertPackageStorage(manifest, cache, verifiedAsset, signal);
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
  if (!(await visualManifestMatches(data, manifest)))
    throw new Error(
      'The model catalogue does not match the verified download manifest.',
    );
  if (data.visuals?.detailedModels?.length) {
    const { verifyOfflineModels } =
      await import('./model-offline-verification');
    await verifyOfflineModels(data, cache, signal);
  }
  signal?.throwIfAborted();
  const db = await database();
  // The sole active pointer is committed after every file has been verified.
  const tx = db.transaction(['packages', 'meta'], 'readwrite');
  await tx.objectStore('packages').put({ manifest, data }, manifest.version);
  await tx
    .objectStore('meta')
    .put(
      manifest.version,
      campusKey(activate ? 'active' : 'pending', packageCampus(manifest)),
    );
  await tx.done;
  await navigator.storage?.persist?.().catch(() => false);
  return data;
}
export async function activatePending(campus = requestedCampus()) {
  const db = await database(),
    pending = await db.get('meta', campusKey('pending', campus));
  if (!pending) return false;
  const record = await db.get('packages', pending);
  if (
    !record ||
    packageCampus(record.manifest) !== campus ||
    !(await visualManifestMatches(record.data, record.manifest)) ||
    (await auditAssets(record.manifest)).some((present) => !present)
  )
    return false;
  const tx = db.transaction('meta', 'readwrite');
  await tx.store.put(pending, campusKey('active', campus));
  await tx.store.delete(campusKey('pending', campus));
  await tx.done;
  return true;
}
export async function deletePackages(campus = requestedCampus()) {
  const db = await database();
  const records = await db.getAll('packages');
  const removed = records.filter((r) => packageCampus(r.manifest) === campus);
  const retainedUrls = new Set(
    records
      .filter((r) => packageCampus(r.manifest) !== campus)
      .flatMap((r) => r.manifest.assets.map((a: PackageAsset) => a.url)),
  );
  const tx = db.transaction(['packages', 'meta'], 'readwrite');
  for (const record of removed)
    await tx.objectStore('packages').delete(record.manifest.version);
  await tx.objectStore('meta').delete(campusKey('active', campus));
  await tx.objectStore('meta').delete(campusKey('pending', campus));
  await tx.done;
  const cache = await caches.open(ASSET_CACHE);
  for (const record of removed)
    for (const asset of record.manifest.assets)
      if (!retainedUrls.has(asset.url)) await cache.delete(asset.url);
}
