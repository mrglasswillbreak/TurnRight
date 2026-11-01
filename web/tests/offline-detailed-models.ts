import { expect, it, vi } from 'vitest';
import {
  installPackage,
  loadCampus,
  hashBytes,
  activatePending,
} from '../src/offline';
import { compileModelDocument } from '../src/model-document-compiler';
import { detailedAssets } from '../src/model-lod';
import type { OfflineFixture } from './offline.test';
import { detailFixture } from './model-detail-fixture';
import { campusFixture } from './fixture';
import type { CampusPackage } from '../src/types';
import type { ModelDetailTier } from '../src/model-document';

async function detailPackage(version: string) {
  const data = campusFixture(),
    { descriptor, document, visual, feature } = detailFixture();
  data.version = version;
  data.map.features.push(feature);
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const [i, tier] of (
    ['fine', 'facade', 'structure'] as ModelDetailTier[]
  ).entries()) {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        id: descriptor.id,
        geometryRevision: descriptor.geometryRevision,
        origin: descriptor.origin,
        meshes: compileModelDocument(document, document.origin, tier),
      }),
    );
    const sha256 = await hashBytes(bytes.buffer),
      url = `/packages/detail-${sha256}.json`;
    files.set(url, bytes);
    descriptor.levels[i].geometryBytes = bytes.length;
    descriptor.levels[i].assets = [{ url, sha256, bytes: bytes.length }];
  }
  data.visuals = {
    schemaVersion: 1,
    revision: version,
    bytes: 0,
    buildings: [visual],
    sectors: [],
    references: [],
    detailedModels: [descriptor],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(data)),
    dataUrl = `/packages/${version}/campus.json`;
  files.set(dataUrl, bytes);
  const details = detailedAssets([descriptor]),
    assets = [
      {
        url: dataUrl,
        bytes: bytes.length,
        sha256: await hashBytes(bytes.buffer),
      },
      ...details,
    ];
  const manifest: CampusPackage = {
    version,
    schemaVersion: 1,
    createdAt: '2026-11-01',
    summary: 'Detailed models',
    dataUrl,
    assets,
    bytes: assets.reduce((n, a) => n + a.bytes, 0),
    detailedModels: {
      assetUrls: details.map((a) => a.url),
      bytes: details.reduce((n, a) => n + a.bytes, 0),
    },
  };
  return { manifest, files, descriptor };
}
export function registerDetailedDownloads(fixture: () => OfflineFixture) {
  it('resumes verified cached details when free space cannot fit a second complete download', async () => {
    const old = await fixture().pkg('space-old');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(old.bytes)),
    );
    await installPackage(old.manifest, () => {});
    const next = await detailPackage('space-resume');
    for (const [url, bytes] of next.files)
      await fixture().cache.put(url, new Response(bytes));
    const metadata = next.files.get(next.manifest.dataUrl)!.byteLength;
    const free = Math.ceil(metadata * 1.15) + 1;
    expect(free).toBeLessThan(next.manifest.bytes * 1.15);
    vi.stubGlobal('navigator', {
      storage: {
        estimate: async () => ({ quota: free + 100000, usage: 100000 }),
      },
    });
    vi.mocked(fetch).mockRejectedValue(new Error('Unexpected network request'));
    vi.mocked(fetch).mockClear();
    const geometryUrl = next.descriptor.levels[0].assets[0].url;
    await fixture().cache.put(geometryUrl, new Response('corrupt'));
    await expect(installPackage(next.manifest, () => {})).rejects.toThrow(
      'storage',
    );
    expect((await loadCampus()).manifest.version).toBe(old.manifest.version);
    await fixture().cache.put(
      geometryUrl,
      new Response(next.files.get(geometryUrl)!),
    );
    await installPackage(next.manifest, () => {});
    expect(fetch).not.toHaveBeenCalled();
    const loaded = await loadCampus();
    expect(loaded.manifest.version).toBe(next.manifest.version);
    expect(await loaded.verification).toBe(true);
  });
  it('resumes interrupted detail downloads, retains the prior package, and verifies every level offline', async () => {
    const old = await fixture().pkg('detail-old');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(old.bytes)),
    );
    await installPackage(old.manifest, () => {});
    const next = await detailPackage('detail-resume'),
      controller = new AbortController();
    vi.mocked(fetch).mockImplementation(
      async (url) => new Response(next.files.get(String(url))!),
    );
    await expect(
      installPackage(
        next.manifest,
        () => controller.abort(),
        controller.signal,
      ),
    ).rejects.toThrow();
    expect((await loadCampus()).manifest.version).toBe(old.manifest.version);
    const retained = new Set(
      [...next.files.keys()].filter((url) => fixture().saved.has(url)),
    );
    vi.mocked(fetch).mockClear();
    await installPackage(next.manifest, () => {});
    expect(
      vi.mocked(fetch).mock.calls.every(([url]) => !retained.has(String(url))),
    ).toBe(true);
    vi.stubGlobal('navigator', { onLine: false });
    vi.mocked(fetch).mockRejectedValue(new Error('Offline'));
    const loaded = await loadCampus();
    expect(loaded.manifest.version).toBe(next.manifest.version);
    expect(await loaded.verification).toBe(true);
    for (const level of next.descriptor.levels)
      expect(fixture().saved.has(level.assets[0].url)).toBe(true);
  });
  it('rejects corrupt detail bytes and insufficient storage without replacing a valid package', async () => {
    const old = await fixture().pkg('detail-safe');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(old.bytes)),
    );
    await installPackage(old.manifest, () => {});
    const next = await detailPackage('detail-corrupt'),
      bad = next.descriptor.levels[2].assets[0].url;
    vi.mocked(fetch).mockImplementation(
      async (url) =>
        new Response(
          String(url) === bad ? 'corrupt' : next.files.get(String(url))!,
        ),
    );
    await expect(installPackage(next.manifest, () => {})).rejects.toThrow(
      'verification',
    );
    expect((await loadCampus()).manifest.version).toBe(old.manifest.version);
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ quota: 10, usage: 0 }) },
    });
    vi.mocked(fetch).mockClear();
    await expect(installPackage(next.manifest, () => {})).rejects.toThrow(
      'storage',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('holds updates until activation and refuses activation after a detailed asset is lost', async () => {
    const next = await detailPackage('detail-pending');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => new Response(next.files.get(String(url))!)),
    );
    await installPackage(next.manifest, () => {}, undefined, false);
    const url = next.descriptor.levels[1].assets[0].url;
    fixture().saved.delete(url);
    expect(await activatePending()).toBe(false);
    await fixture().cache.put(url, new Response(next.files.get(url)!));
    expect(await activatePending()).toBe(true);
    expect((await loadCampus()).manifest.version).toBe(next.manifest.version);
  });
}
