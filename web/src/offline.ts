import { openDB } from "idb";
import type { CampusData, CampusPackage, ReportDraft } from "./types";
export const ASSET_CACHE = "turnright-assets-v1";
let connection: ReturnType<typeof openDB> | undefined;
const database = () =>
  (connection ??= openDB("turnright", 1, {
    upgrade(db) {
      db.createObjectStore("meta");
      db.createObjectStore("packages");
      db.createObjectStore("preferences");
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
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
export async function getPreference<T>(key: string, fallback: T): Promise<T> {
  try {
    return (await (await database()).get("preferences", key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export async function setPreference(key: string, value: unknown) {
  await (await database()).put("preferences", value, key);
}
export async function discardReportDraft(key: string) {
  const transaction = (await database()).transaction("preferences", "readwrite");
  const drafts: ReportDraft[] = (await transaction.store.get("report-drafts")) || [];
  await transaction.store.delete(key);
  await transaction.store.put(drafts.filter((draft) => draft.key !== key), "report-drafts");
  await transaction.done;
}
export async function latestPackage(): Promise<CampusPackage> {
  const response = await fetch("/packages/latest.json", {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error("Could not check for campus updates. Your downloaded map is unchanged.");
  const manifest = (await response.json()) as CampusPackage;
  if (manifest.schemaVersion !== 1 || !manifest.assets?.length)
    throw new Error("This map version needs a newer app.");
  return manifest;
}
export async function getActivePackage(): Promise<{
  manifest: CampusPackage;
  data: CampusData;
  complete: boolean;
} | null> {
  const db = await database();
  const version = await db.get("meta", "active");
  const record = version && (await db.get("packages", version));
  if (!record) return null;
  const cache = await caches.open(ASSET_CACHE);
  const present = await Promise.all(
    record.manifest.assets.map(async (a: { url: string }) => !!(await cache.match(a.url))),
  );
  return { ...record, complete: present.every(Boolean) };
}
export async function loadCampus(): Promise<{
  data: CampusData;
  manifest: CampusPackage;
  downloaded: boolean;
}> {
  const active = await getActivePackage().catch(() => null);
  if (active) return { data: active.data, manifest: active.manifest, downloaded: active.complete };
  const manifest = await latestPackage();
  const response = await fetch(manifest.dataUrl);
  if (!response.ok)
    throw new Error("Campus data could not load. Connect to the internet and retry.");
  const bytes = await response.arrayBuffer();
  const asset = manifest.assets.find((a) => a.url === manifest.dataUrl);
  if (!asset || (await hashBytes(bytes)) !== asset.sha256)
    throw new Error("Campus data did not pass its integrity check. Please retry.");
  return { data: JSON.parse(new TextDecoder().decode(bytes)), manifest, downloaded: false };
}
export async function installPackage(
  manifest: CampusPackage,
  progress: (percent: number) => void,
  signal?: AbortSignal,
  activate = true,
) {
  if (manifest.schemaVersion !== 1) throw new Error("Update the app before downloading this map.");
  const estimate = await navigator.storage?.estimate();
  if (estimate?.quota && estimate.usage && estimate.quota - estimate.usage < manifest.bytes * 1.15)
    throw new Error("Not enough storage. Free some space on this device and retry.");
  const cache = await caches.open(ASSET_CACHE);
  let loaded = 0;
  let data: CampusData | undefined;
  for (const asset of manifest.assets) {
    if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");
    if (!/^\/(packages|audio|glyphs)\//.test(asset.url) || asset.url.includes(".."))
      throw new Error("Invalid package asset path");
    let response = await cache.match(asset.url);
    let bytes = response && (await response.clone().arrayBuffer());
    if (!bytes || (await hashBytes(bytes)) !== asset.sha256) {
      response = await fetch(asset.url, { signal, cache: "no-store" });
      if (!response.ok) throw new Error("The download was interrupted. Retry to continue.");
      bytes = await response.arrayBuffer();
      if (bytes.byteLength !== asset.bytes || (await hashBytes(bytes)) !== asset.sha256)
        throw new Error(
          "A downloaded file failed verification. Your previous map is safe; please retry.",
        );
      await cache.put(asset.url, new Response(bytes, { headers: response.headers }));
    }
    if (asset.url === manifest.dataUrl) data = JSON.parse(new TextDecoder().decode(bytes));
    loaded += asset.bytes;
    progress(Math.round((loaded / manifest.bytes) * 100));
  }
  if (!data || data.version !== manifest.version) throw new Error("Incomplete campus package");
  const db = await database();
  // The sole active pointer is committed after every file has been verified.
  const tx = db.transaction(["packages", "meta"], "readwrite");
  await tx.objectStore("packages").put({ manifest, data }, manifest.version);
  await tx.objectStore("meta").put(manifest.version, activate ? "active" : "pending");
  await tx.done;
  await navigator.storage?.persist?.().catch(() => false);
  return data;
}
export async function activatePending() {
  const db = await database(),
    pending = await db.get("meta", "pending");
  if (!pending) return false;
  const record = await db.get("packages", pending),
    cache = await caches.open(ASSET_CACHE);
  if (
    !record ||
    (
      await Promise.all(
        record.manifest.assets.map(async (a: { url: string }) => !!(await cache.match(a.url))),
      )
    ).some((present) => !present)
  )
    return false;
  const tx = db.transaction("meta", "readwrite");
  await tx.store.put(pending, "active");
  await tx.store.delete("pending");
  await tx.done;
  return true;
}
export async function deletePackages() {
  const db = await database();
  const tx = db.transaction(["packages", "meta"], "readwrite");
  await tx.objectStore("packages").clear();
  await tx.objectStore("meta").clear();
  await tx.done;
  await caches.delete(ASSET_CACHE);
}
