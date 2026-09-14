import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activatePending,
  deletePackages,
  getActivePackage,
  hashBytes,
  installPackage,
  loadCampus,
} from '../src/offline';
import type { CampusPackage } from '../src/types';
const saved = new Map<string, Response>();
const cache = {
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
    JSON.stringify({ version, schemaVersion: 1 }),
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
describe('offline package transactions', () => {
  async function enhanced(version: string) {
    const p = await pkg(version),
      bytes = new TextEncoder().encode('{"schemaVersion":1,"models":[]}');
    const asset = {
      url: `/packages/${version}/sector.json`,
      bytes: bytes.byteLength,
      sha256: await hashBytes(bytes.buffer),
    };
    p.manifest.assets.push(asset);
    p.manifest.bytes += asset.bytes;
    p.manifest.visuals = { bytes: asset.bytes, assetUrls: [asset.url] };
    return { ...p, visual: asset, visualBytes: bytes };
  }
  it('keeps the basic active map through interrupted model downloads and resumes verified files', async () => {
    const old = await pkg('basic'),
      next = await enhanced('enhanced');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(old.bytes)),
    );
    await installPackage(old.manifest, () => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === next.visual.url
          ? new Response('unavailable', { status: 503 })
          : new Response(next.bytes),
      ),
    );
    await expect(installPackage(next.manifest, () => {})).rejects.toThrow(
      'interrupted',
    );
    expect((await loadCampus()).data.version).toBe('basic');
    const resume = vi.fn(async () => new Response(next.visualBytes));
    vi.stubGlobal('fetch', resume);
    await installPackage(next.manifest, () => {});
    expect(resume).toHaveBeenCalledTimes(1);
    expect((await getActivePackage())?.visualsComplete).toBe(true);
    saved.set(next.visual.url, new Response('corrupt'));
    const active = await getActivePackage();
    expect(active?.visualsComplete).toBe(false);
    expect(active?.complete).toBe(false);
    expect(active?.data.version).toBe('enhanced');
  });
  it('refuses a staged activation after a visual file is corrupted', async () => {
    const p = await enhanced('pending-visual');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(url === p.visual.url ? p.visualBytes : p.bytes),
      ),
    );
    await installPackage(p.manifest, () => {}, undefined, false);
    saved.set(p.visual.url, new Response('broken'));
    expect(await activatePending()).toBe(false);
    expect(await getActivePackage()).toBeNull();
  });
  it('rejects manifest claims for visual files absent from the package', async () => {
    const p = await enhanced('missing-visual');
    p.manifest.assets.pop();
    await expect(installPackage(p.manifest, () => {})).rejects.toThrow(
      'Incomplete visual',
    );
  });
  it('bounds initial data loading and reports a retryable timeout', async () => {
    const p = await pkg('slow');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options: RequestInit) => {
        if (url === '/packages/latest.json') return Response.json(p.manifest);
        expect(options.signal).toBeInstanceOf(AbortSignal);
        throw new DOMException('Timeout', 'TimeoutError');
      }),
    );
    await expect(loadCampus()).rejects.toThrow('too long to load');
    expect(await getActivePackage()).toBeNull();
  });
  it('rejects a package before writing when device storage is full', async () => {
    const p = await pkg('too-large');
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ quota: 10, usage: 9 }) },
    });
    await expect(installPackage(p.manifest, () => {})).rejects.toThrow(
      'Not enough storage',
    );
    expect(await getActivePackage()).toBeNull();
  });
  it('keeps the old active map when an update is corrupt', async () => {
    const old = await pkg('old'),
      next = await pkg('next');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(old.bytes)),
    );
    await installPackage(old.manifest, () => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('corrupt')),
    );
    await expect(installPackage(next.manifest, () => {})).rejects.toThrow(
      /verification/,
    );
    expect((await getActivePackage())?.manifest.version).toBe('old');
  });
  it('stages a verified update until navigation releases it', async () => {
    const old = await pkg('old'),
      next = await pkg('next');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(old.bytes)),
    );
    await installPackage(old.manifest, () => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(next.bytes)),
    );
    await installPackage(next.manifest, () => {}, undefined, false);
    expect((await getActivePackage())?.manifest.version).toBe('old');
    expect(await activatePending()).toBe(true);
    expect((await getActivePackage())?.manifest.version).toBe('next');
  });
  it('loads an installed map without making a network request', async () => {
    const p = await pkg('offline');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(p.bytes)),
    );
    await installPackage(p.manifest, () => {});
    const offline = vi.fn(async () => {
      throw new TypeError('Offline');
    });
    vi.stubGlobal('fetch', offline);
    expect((await loadCampus()).downloaded).toBe(true);
    expect(offline).not.toHaveBeenCalled();
  });
  it('reuses verified files and detects storage eviction', async () => {
    const p = await pkg('cached');
    const fetcher = vi.fn(async () => new Response(p.bytes));
    vi.stubGlobal('fetch', fetcher);
    await installPackage(p.manifest, () => {});
    await installPackage(p.manifest, () => {});
    expect(fetcher).toHaveBeenCalledTimes(1);
    saved.clear();
    expect((await getActivePackage())?.complete).toBe(false);
  });
  it('cancellation cannot activate an incomplete package', async () => {
    const p = await pkg('cancelled');
    const controller = new AbortController();
    controller.abort();
    await expect(
      installPackage(p.manifest, () => {}, controller.signal),
    ).rejects.toThrow(/cancelled/);
    expect(await getActivePackage()).toBeNull();
  });
});
