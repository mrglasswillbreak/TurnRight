import { campusFixture } from './fixture';
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
describe('offline package transactions', () => {
  it('verifies the optional texture group before activation and retains the working map through failure, repair and rollback', async () => {
    const old = await pkg('texture-baseline');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(old.bytes)),
    );
    await installPackage(old.manifest, () => {});
    const next = await pkg('textured');
    const pixels = new TextEncoder().encode('verified-image');
    const digest = await hashBytes(pixels.buffer);
    const texture = {
      id: 'recipe',
      photoId: 'photo',
      url: `/packages/texture-${digest.slice(0, 12)}/${digest}.webp`,
      sha256: digest,
      bytes: pixels.length,
      width: 512,
      height: 512,
      author: 'Photographer',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'Photographer · CC BY 4.0',
      modifications: 'Cropped and rectified',
    };
    const photograph = {
      ...texture,
      id: 'photo',
      buildingId: 'building',
      caption: 'Reviewed wall',
      alt: 'Window in the building wall',
      sourceUrl: 'https://example.org/original',
      checkedAt: '2026-09-24',
      url: `/packages/photos/${digest}.webp`,
    };
    const data = {
      ...campusFixture(),
      version: 'textured',
      schemaVersion: 1,
      photos: [photograph],
      visuals: { sectors: [], textures: [texture] },
    };
    data.map.features.push({
      ...data.boundary,
      properties: { id: 'building', kind: 'building' },
    });
    next.bytes = new TextEncoder().encode(JSON.stringify(data));
    next.manifest.assets[0] = {
      ...next.manifest.assets[0],
      bytes: next.bytes.length,
      sha256: await hashBytes(next.bytes.buffer),
    };
    next.manifest.assets.push(photograph, texture);
    next.manifest.bytes = next.bytes.length + pixels.length * 2;
    next.manifest.textures = { bytes: pixels.length, assetUrls: [texture.url] };
    next.manifest.photos = {
      bytes: pixels.length,
      assetUrls: [photograph.url],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            url === texture.url
              ? 'corrupt'
              : url === photograph.url
                ? pixels
                : next.bytes,
          ),
      ),
    );
    await expect(installPackage(next.manifest, () => {})).rejects.toThrow(
      'verification',
    );
    expect((await getActivePackage())?.data.version).toBe('texture-baseline');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(pixels)),
    );
    await installPackage(next.manifest, () => {}, undefined, false);
    saved.set(texture.url, new Response('corrupt'));
    expect(await activatePending()).toBe(false);
    await installPackage(next.manifest, () => {});
    expect((await getActivePackage())?.visualsComplete).toBe(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw Error('offline');
      }),
    );
    expect(await (await loadCampus()).verification).toBe(true);
    await installPackage(old.manifest, () => {});
    expect((await getActivePackage())?.data.version).toBe('texture-baseline');
  });
  it('shows verified campus data before slow asset auditing and shares concurrent audits', async () => {
    const { manifest, bytes } = await pkg('core-first');
    const extra = new TextEncoder().encode('additional asset');
    const asset = {
      url: '/packages/slow.dat',
      bytes: extra.length,
      sha256: await hashBytes(extra.buffer),
    };
    manifest.assets.push(asset);
    manifest.bytes += extra.length;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) => new Response(url === asset.url ? extra : bytes),
      ),
    );
    await installPackage(manifest, () => {});
    let finish!: () => void,
      reads = 0;
    const auditGate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const match = cache.match;
    const pause = vi.spyOn(cache, 'match').mockImplementation(async (url) => {
      if (url === asset.url) {
        reads++;
        await auditGate;
      }
      return match(url);
    });
    try {
      const loaded = await loadCampus();
      expect(loaded.data.version).toBe('core-first');
      expect(loaded.downloaded).toBe(false);
      // Await the second caller's core load so it has actually joined the audit.
      // Starting getActivePackage() alone only schedules its IndexedDB reads;
      // releasing the gate then could finish and discard the first audit before
      // that caller reaches it, starting another audit instead of sharing one.
      const concurrent = await loadCampus();
      expect(concurrent.data.version).toBe('core-first');
      expect(concurrent.downloaded).toBe(false);
      await vi.waitFor(() => expect(reads).toBe(1));
      finish();
      expect(await loaded.verification).toBe(true);
      expect(await concurrent.verification).toBe(true);
      expect(reads).toBe(1);
    } finally {
      // One shared gate also releases an unexpected extra read on failure.
      finish();
      pause.mockRestore();
    }
    expect((await getActivePackage())?.complete).toBe(true);
  });
  it('retains the active map until every photo is verified, repairs corrupt photos and supports rollback', async () => {
    const old = await pkg('before-photos'),
      next = await pkg('with-photos');
    const photoBytes = new TextEncoder().encode('verified photograph bytes');
    const digest = await hashBytes(photoBytes.buffer);
    const photo = {
      url: `/packages/photos/${digest}.webp`,
      bytes: photoBytes.length,
      sha256: digest,
    };
    const data = {
      ...campusFixture(),
      version: 'with-photos',
      schemaVersion: 3,
      photos: [
        {
          ...photo,
          id: 'photo',
          buildingId: 'building',
          width: 40,
          height: 30,
          caption: 'Building exterior',
          alt: 'Building with a pitched roof',
          author: 'Photographer',
          sourceKind: 'author-upload' as const,
          license: 'CC BY-SA 4.0' as const,
          licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
          attribution: 'Photographer',
          modifications: 'Converted to WebP',
          checkedAt: '2026-09-23',
        },
      ],
    };
    data.map.features.push({
      ...data.boundary,
      properties: { id: 'building', kind: 'building' },
    });
    next.bytes = new TextEncoder().encode(JSON.stringify(data));
    next.manifest.assets[0] = {
      ...next.manifest.assets[0],
      bytes: next.bytes.length,
      sha256: await hashBytes(next.bytes.buffer),
    };
    next.manifest.schemaVersion = 3;
    next.manifest.assets.push(photo);
    next.manifest.photos = { bytes: photo.bytes, assetUrls: [photo.url] };
    next.manifest.bytes = next.bytes.length + photo.bytes;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(old.bytes)),
    );
    await installPackage(old.manifest, () => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === photo.url
          ? new Response('interrupted', { status: 503 })
          : new Response(next.bytes),
      ),
    );
    await expect(installPackage(next.manifest, () => {})).rejects.toThrow(
      'interrupted',
    );
    expect((await getActivePackage())?.manifest.version).toBe('before-photos');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(photoBytes)),
    );
    await installPackage(next.manifest, () => {}, undefined, false);
    saved.set(photo.url, new Response('corrupt'));
    expect(await activatePending()).toBe(false);
    expect((await getActivePackage())?.manifest.version).toBe('before-photos');
    await installPackage(next.manifest, () => {});
    expect((await getActivePackage())?.complete).toBe(true);
    saved.set(photo.url, new Response('corrupt'));
    expect((await getActivePackage())?.complete).toBe(false);
    await installPackage(next.manifest, () => {});
    expect((await getActivePackage())?.complete).toBe(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw Error('offline');
      }),
    );
    await installPackage(old.manifest, () => {});
    expect((await getActivePackage())?.manifest.version).toBe('before-photos');
    expect(await cache.match(photo.url)).toBeDefined();
  });
  it('installs driving packages offline and rejects schema mismatches without replacing them', async () => {
    const p = await pkg('driving');
    const data = {
      ...campusFixture(),
      version: 'driving',
      schemaVersion: 2,
      driving: { version: 1, parking: [], restrictions: [] },
    };
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    p.manifest.schemaVersion = 2;
    p.manifest.bytes = bytes.byteLength;
    p.manifest.assets[0] = {
      ...p.manifest.assets[0],
      bytes: bytes.byteLength,
      sha256: await hashBytes(bytes.buffer),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes)),
    );
    await installPackage(p.manifest, () => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect((await loadCampus()).data.driving?.version).toBe(1);
    await expect(
      installPackage({ ...p.manifest, schemaVersion: 1 }, () => {}),
    ).rejects.toThrow('Incomplete campus package');
    expect((await getActivePackage())?.manifest.schemaVersion).toBe(2);
  });
  async function enhanced(version: string) {
    const p = await pkg(version),
      bytes = new TextEncoder().encode('{"schemaVersion":1,"models":[]}');
    const asset = {
      url: `/packages/${version}/sector.json`,
      bytes: bytes.byteLength,
      sha256: await hashBytes(bytes.buffer),
    };
    p.bytes = new TextEncoder().encode(
      JSON.stringify({
        ...campusFixture(),
        version,
        schemaVersion: 1,
        visuals: { sectors: [asset] },
      }),
    );
    p.manifest.assets[0] = {
      ...p.manifest.assets[0],
      bytes: p.bytes.byteLength,
      sha256: await hashBytes(p.bytes.buffer),
    };
    p.manifest.assets.push(asset);
    p.manifest.bytes = p.bytes.byteLength + asset.bytes;
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
  it('rejects a catalogue whose model hashes disagree with verified assets', async () => {
    const p = await enhanced('catalogue-mismatch');
    const data = JSON.parse(new TextDecoder().decode(p.bytes));
    data.visuals.sectors[0].sha256 = '0'.repeat(64);
    p.bytes = new TextEncoder().encode(JSON.stringify(data));
    p.manifest.assets[0] = {
      ...p.manifest.assets[0],
      bytes: p.bytes.byteLength,
      sha256: await hashBytes(p.bytes.buffer),
    };
    p.manifest.bytes = p.bytes.byteLength + p.visual.bytes;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(url === p.visual.url ? p.visualBytes : p.bytes),
      ),
    );
    await expect(installPackage(p.manifest, () => {})).rejects.toThrow(
      'catalogue does not match',
    );
    expect(await getActivePackage()).toBeNull();
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
    const loaded = await loadCampus();
    expect(loaded.downloaded).toBe(false);
    expect(await loaded.verification).toBe(true);
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
