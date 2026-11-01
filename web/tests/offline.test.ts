import { campusFixture } from './fixture';
import 'fake-indexeddb/auto';
import { beforeEach, vi } from 'vitest';
import { deletePackages, hashBytes } from '../src/offline';
import type { CampusPackage } from '../src/types';
import { registerPackageIntegrity } from './offline-package-integrity';
import { registerCacheRecovery } from './offline-cache-recovery';
import { registerCampusIsolation } from './offline-campus-isolation';
import { registerDetailedDownloads } from './offline-detailed-models';
const saved = new Map<string, Response>();
const cache = {
  delete: async (url: string) => saved.delete(url),
  match: async (url: string) => saved.get(url)?.clone(),
  put: async (url: string, response: Response) => {
    saved.set(url, response.clone());
  },
};
beforeEach(async () => {
  vi.stubGlobal('caches', {
    open: async () => cache,
    delete: async () => {
      saved.clear();
      return true;
    },
  });
  vi.stubGlobal('navigator', {
    storage: {
      estimate: async () => ({ quota: 10000000, usage: 1 }),
      persist: async () => true,
    },
  });
  await deletePackages();
});
async function pkg(version: string) {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ ...campusFixture(), version, schemaVersion: 1 }),
  );
  const url = `/packages/${version}/campus.json`;
  const manifest: CampusPackage = {
    version,
    schemaVersion: 1,
    createdAt: '2026-09-08',
    summary: 'Test',
    dataUrl: url,
    bytes: bytes.byteLength,
    assets: [
      { url, bytes: bytes.byteLength, sha256: await hashBytes(bytes.buffer) },
    ],
  };
  return { manifest, bytes };
}
const fixture = () => ({ saved, cache, pkg });
export type OfflineFixture = ReturnType<typeof fixture>;
registerPackageIntegrity(fixture);
registerCacheRecovery(fixture);
registerCampusIsolation(fixture);
registerDetailedDownloads(fixture);
