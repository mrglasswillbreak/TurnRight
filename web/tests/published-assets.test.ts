import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  readdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  preservePublished,
  requestPublishedAsset,
  validatePublishedManifest,
} from '../scripts/published-assets.mjs';
import type { CampusPackage, PackageAsset } from '../src/types';
import type { DetailedBuildingModel } from '../src/model-lod-types';

const origin = 'https://turnright.vercel.app';
const bytes = Buffer.from('verified published campus');
const manifest = {
  schemaVersion: 1,
  version: 'lasu-abc123',
  bytes: bytes.length,
  assets: [
    {
      url: '/packages/lasu-abc123/campus.json',
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
  ],
};
let publicDir: string;
beforeEach(async () => {
  publicDir = await mkdtemp(path.join(tmpdir(), 'turnright-published-test-'));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  if (
    path.dirname(publicDir) !== path.resolve(tmpdir()) ||
    !path.basename(publicDir).startsWith('turnright-published-test-')
  )
    throw new Error('Unexpected test cleanup directory');
  await rm(publicDir, { recursive: true });
});

it('preserves verified public assets without replacing the candidate manifest', async () => {
  await mkdir(path.join(publicDir, 'packages'));
  const candidate = JSON.stringify({ version: 'lasu-def456' });
  await writeFile(path.join(publicDir, 'packages/latest.json'), candidate);
  const fetch = vi.fn(async (url: URL) => {
    expect(url.origin).toBe(origin);
    if (url.pathname === '/packages/latest.json')
      return Response.json(manifest);
    expect(url.pathname).toBe(manifest.assets[0].url);
    return new Response(bytes);
  });
  vi.stubGlobal('fetch', fetch);
  await expect(
    preservePublished(publicDir, origin, false, manifest.version),
  ).resolves.toEqual(manifest);
  expect(
    await readFile(path.join(publicDir, 'packages/latest.json'), 'utf8'),
  ).toBe(candidate);
  expect(
    await readFile(path.join(publicDir, 'packages/lasu-abc123/campus.json')),
  ).toEqual(bytes);
  expect(
    JSON.parse(
      await readFile(
        path.join(publicDir, 'packages/lasu-abc123/manifest.json'),
        'utf8',
      ),
    ),
  ).toEqual(manifest);
  expect(fetch).toHaveBeenCalledTimes(2);
  fetch.mockClear();
  await preservePublished(publicDir, origin, false, manifest.version);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('explains an HTML deployment response without exposing its contents', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('<!DOCTYPE html>Sign in secret</html>')),
  );
  await expect(preservePublished(publicDir, origin)).rejects.toThrow(
    'Check PUBLISHED_MAP_URL',
  );
  expect(await readdir(publicDir)).toEqual([]);
});

it('scopes historical-deployment credentials to verified asset paths and refuses external redirects', async () => {
  const headers = { 'x-vercel-protection-bypass': 'test-only-bypass' };
  const request = vi.fn(async (url: URL, init: RequestInit) => {
    expect(url.origin).toBe(origin);
    expect(init.headers).toEqual(headers);
    expect(init.redirect).toBe('manual');
    return url.pathname.endsWith('manifest.json')
      ? Response.json(manifest)
      : new Response(bytes);
  });
  vi.stubGlobal('fetch', request);
  await preservePublished(
    publicDir,
    origin,
    false,
    manifest.version,
    '/packages/lasu-abc123/manifest.json',
    { headers },
  );
  expect(request).toHaveBeenCalledTimes(2);
  request.mockClear();
  await expect(
    preservePublished(
      publicDir,
      origin,
      false,
      manifest.version,
      'https://example.net/manifest.json',
      { headers },
    ),
  ).rejects.toThrow('Invalid published asset path');
  expect(request).not.toHaveBeenCalled();
  request.mockImplementationOnce(
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://example.net/manifest.json' },
      }),
  );
  await expect(
    preservePublished(
      publicDir,
      origin,
      false,
      manifest.version,
      '/packages/lasu-abc123/manifest.json',
      { headers },
    ),
  ).rejects.toThrow('redirected outside its origin');
  expect(request).toHaveBeenCalledTimes(1);
});

it('stops before copying assets when the verified public baseline changes', async () => {
  const fetch = vi.fn(async () => Response.json(manifest));
  vi.stubGlobal('fetch', fetch);
  await expect(
    preservePublished(publicDir, origin, false, 'lasu-987fed'),
  ).rejects.toThrow('public campus changed');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await readdir(publicDir)).toEqual([]);
});

it('rejects corrupt assets and does not create a retained manifest', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL) =>
      url.pathname === '/packages/latest.json'
        ? Response.json(manifest)
        : new Response('corrupt'),
    ),
  );
  await expect(
    preservePublished(publicDir, origin, false, manifest.version),
  ).rejects.toThrow('checksum mismatch');
  expect(await readdir(publicDir)).toEqual([]);
});

it('still supports activating the public package for ordinary application builds', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL) =>
      url.pathname === '/packages/latest.json'
        ? Response.json(manifest)
        : new Response(bytes),
    ),
  );
  await preservePublished(publicDir, origin, true);
  expect(
    JSON.parse(
      await readFile(path.join(publicDir, 'packages/latest.json'), 'utf8'),
    ),
  ).toEqual(manifest);
});
it('retries protected edge propagation without sending credentials to the login origin', async () => {
  vi.useFakeTimers();
  try {
    const headers = { 'x-vercel-protection-bypass': 'test-only' };
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 307,
          headers: { location: 'https://vercel.com/sso-api' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 308,
          headers: { location: '/packages/canonical.json' },
        }),
      )
      .mockResolvedValueOnce(new Response(bytes));
    vi.stubGlobal('fetch', request);
    const result = requestPublishedAsset(
      origin,
      '/packages/source.json',
      45000,
      { headers },
    );
    await vi.runAllTimersAsync();
    expect(Buffer.from(await (await result).arrayBuffer())).toEqual(bytes);
    expect(request.mock.calls.map(([url]) => url.origin)).toEqual([
      origin,
      origin,
      origin,
    ]);
    expect(request.mock.calls.map(([url]) => url.pathname)).toEqual([
      '/packages/source.json',
      '/packages/source.json',
      '/packages/canonical.json',
    ]);
    expect(
      request.mock.calls.every(
        ([, init]) => init.headers === headers && init.redirect === 'manual',
      ),
    ).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
it('rejects absolute foreign targets and credential-bearing redirects before forwarding headers', async () => {
  const request = vi.fn(
    async () =>
      new Response(null, {
        status: 302,
        headers: {
          location:
            'https://user:password@turnright.vercel.app/packages/secret.json',
        },
      }),
  );
  vi.stubGlobal('fetch', request);
  await expect(
    requestPublishedAsset(
      origin,
      'https://example.net/packages/asset.json',
      1000,
    ),
  ).rejects.toThrow('origin changed');
  expect(request).not.toHaveBeenCalled();
  await expect(
    requestPublishedAsset(origin, '/packages/asset.json', 1000),
  ).rejects.toThrow('origin changed');
  expect(request).toHaveBeenCalledTimes(1);
});

function detailedFixture() {
  const files = new Map<string, Buffer<ArrayBuffer>>();
  const asset = (content: string, kind: string, extension: string) => {
    const bytes = Buffer.from(content),
      sha256 = createHash('sha256').update(bytes).digest('hex'),
      url = `/packages/${kind}-${sha256}.${extension}`;
    files.set(url, bytes);
    return { url, bytes: bytes.length, sha256 };
  };
  const texture = {
    ...asset('shared image', 'model-texture', 'png'),
    width: 8,
    height: 8,
    contentType: 'image/png',
  };
  const model: DetailedBuildingModel = {
    version: 1,
    id: 'library',
    geometryRevision: 'geometry-1',
    origin: [3.2, 6.46],
    bounds: [
      [3.2, 6.46],
      [3.201, 6.461],
    ],
    textures: [texture],
    levels: ([0, 1, 2] as const).map((level) => {
      const geometry = asset(`model level ${level}`, 'detail', 'json');
      return {
        level,
        geometricError: level,
        triangles: 12,
        geometryBytes: geometry.bytes,
        assets: [geometry],
      };
    }),
  };
  const data = {
    schemaVersion: 1,
    version: manifest.version,
    visuals: {
      buildings: [{ id: model.id, geometryRevision: model.geometryRevision }],
      detailedModels: [model],
    },
  };
  const details = [...model.levels.flatMap((l) => l.assets), texture];
  const next: CampusPackage = {
    ...manifest,
    schemaVersion: 1,
    createdAt: '2026-11-01',
    summary: 'Detailed release',
    dataUrl: '/packages/lasu-abc123/campus.json',
    assets: [],
    bytes: 0,
    detailedModels: {
      assetUrls: details.map((a) => a.url),
      bytes: details.reduce((n, a) => n + a.bytes, 0),
    },
  };
  const updateCore = () => {
    const bytes = Buffer.from(JSON.stringify(data));
    files.set(next.dataUrl, bytes);
    next.assets = [
      {
        url: next.dataUrl,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
      ...details,
    ];
    next.bytes = next.assets.reduce((n, a) => n + a.bytes, 0);
  };
  updateCore();
  const fetch = vi.fn(async (url: URL) =>
    url.pathname === '/packages/latest.json'
      ? Response.json(next)
      : new Response(files.get(url.pathname)!),
  );
  vi.stubGlobal('fetch', fetch);
  return { next, data, model, texture, files, fetch, updateCore };
}

it('accepts a 46 MB, 215-file detailed release without enlarging compatible-package limits', () => {
  const assets: PackageAsset[] = [{ ...manifest.assets[0], bytes: 1000 }];
  for (let i = 1; i < 215; i++) {
    const sha256 = i.toString(16).padStart(64, '0');
    assets.push({
      url:
        i <= 43
          ? `/packages/photos/${sha256}.webp`
          : `/packages/detail-${sha256}.json.gz`,
      bytes: i <= 43 ? 1000 : 269812,
      sha256,
    });
  }
  assets.at(-1)!.bytes += 46181851 - assets.reduce((n, a) => n + a.bytes, 0);
  const group = (entries: PackageAsset[]) => ({
    assetUrls: entries.map((a) => a.url),
    bytes: entries.reduce((n, a) => n + a.bytes, 0),
  });
  const next = {
    ...manifest,
    dataUrl: assets[0].url,
    bytes: 46181851,
    assets,
    photos: group(assets.slice(1, 44)),
    detailedModels: group(assets.slice(44)),
  };
  expect(validatePublishedManifest(next).size).toBe(171);
  const largeBase = structuredClone(manifest);
  largeBase.assets[0].bytes = largeBase.bytes = 25 * 1024 * 1024 + 1;
  expect(() => validatePublishedManifest(largeBase)).toThrow('asset manifest');
  largeBase.assets[0].bytes = largeBase.bytes = 12 * 1024 * 1024 + 1;
  expect(() =>
    validatePublishedManifest({
      ...largeBase,
      visuals: {
        bytes: largeBase.bytes,
        assetUrls: [largeBase.assets[0].url],
      },
    }),
  ).toThrow('asset manifest');
  const manyBase = Array.from({ length: 201 }, (_, i) => ({
    ...manifest.assets[0],
    url: `/packages/base-${i}.json`,
  }));
  expect(() =>
    validatePublishedManifest({
      ...manifest,
      assets: manyBase,
      bytes: manyBase.reduce((n, a) => n + a.bytes, 0),
    }),
  ).toThrow('asset manifest');
});

it('preserves and reuses verified details with a shared base/detail texture counted once in total bytes', async () => {
  const { next, texture, files, fetch } = detailedFixture();
  next.textures = { bytes: texture.bytes, assetUrls: [texture.url] };
  await preservePublished(publicDir, origin, true);
  expect(fetch).toHaveBeenCalledTimes(next.assets.length + 1);
  for (const asset of next.assets)
    expect(await readFile(path.join(publicDir, asset.url))).toEqual(
      files.get(asset.url),
    );
  expect(
    JSON.parse(
      await readFile(path.join(publicDir, 'packages/latest.json'), 'utf8'),
    ),
  ).toEqual(next);
  fetch.mockClear();
  await preservePublished(publicDir, origin, false);
  expect(fetch).toHaveBeenCalledOnce();
  const remaining = 25 * 1024 * 1024 - texture.bytes + 1;
  next.assets[0].bytes = remaining;
  next.bytes = next.assets.reduce((n, a) => n + a.bytes, 0);
  expect(() => validatePublishedManifest(next)).toThrow('asset manifest');
});

it.each([
  'duplicate',
  'unknown',
  'wrong total',
  'core',
  'photo',
  'base geometry',
  'oversized',
  'wrong hash',
  'missing group',
])(
  'rejects an invalid detailed group (%s) before copying assets',
  async (failure) => {
    const { next, fetch } = detailedFixture(),
      group = next.detailedModels!;
    if (failure === 'duplicate') group.assetUrls.push(group.assetUrls[0]);
    if (failure === 'unknown') group.assetUrls[0] = '/packages/missing.json';
    if (failure === 'wrong total') group.bytes++;
    if (failure === 'core') group.assetUrls.push(next.dataUrl);
    if (failure === 'photo') next.photos = { ...group };
    if (failure === 'base geometry') next.visuals = { ...group };
    if (failure === 'oversized') {
      const extra = 16 * 1024 * 1024 + 1 - next.assets[1].bytes;
      next.assets[1].bytes += extra;
      group.bytes += extra;
      next.bytes += extra;
    }
    if (failure === 'wrong hash') next.assets[1].sha256 = 'f'.repeat(64);
    if (failure === 'missing group') delete next.detailedModels;
    await expect(preservePublished(publicDir, origin, true)).rejects.toThrow(
      'published asset',
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(await readdir(publicDir)).toEqual([]);
  },
);

it.each([
  'references',
  'revision',
  'dimensions',
  'corrupt core',
  'corrupt detail',
])(
  'refuses a detailed catalogue or asset mismatch (%s) without activating it',
  async (failure) => {
    const { next, model, texture, files, fetch, updateCore } =
      detailedFixture();
    if (failure === 'references')
      model.levels[0].assets = [model.levels[1].assets[0]];
    if (failure === 'revision') model.geometryRevision = 'stale';
    if (failure === 'dimensions') texture.width = 0;
    updateCore();
    if (failure === 'corrupt core')
      files.set(next.dataUrl, Buffer.from('corrupt'));
    if (failure === 'corrupt detail')
      files.set(model.levels[0].assets[0].url, Buffer.from('corrupt'));
    await mkdir(path.join(publicDir, 'packages'));
    const candidate = JSON.stringify({ version: 'lasu-def456' });
    await writeFile(path.join(publicDir, 'packages/latest.json'), candidate);
    await expect(preservePublished(publicDir, origin, true)).rejects.toThrow(
      /catalogue|checksum/,
    );
    expect(
      await readFile(path.join(publicDir, 'packages/latest.json'), 'utf8'),
    ).toBe(candidate);
    await expect(
      readFile(path.join(publicDir, 'packages/lasu-abc123/manifest.json')),
    ).rejects.toThrow();
    if (failure !== 'corrupt detail') expect(fetch).toHaveBeenCalledTimes(2);
  },
);
