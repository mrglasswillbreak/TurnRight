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
// @ts-expect-error Node-only deployment module.
import { preservePublished } from '../scripts/published-assets.mjs';

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
