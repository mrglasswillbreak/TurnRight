import { afterEach, expect, it, vi } from 'vitest';
import {
  createFacadeTextures,
  TEXTURE_MEMORY_LIMIT,
} from '../src/facade-textures';
import { hashBytes } from '../src/offline';
import type { CampusData } from '../src/types';
const corners: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
afterEach(() => vi.unstubAllGlobals());
it('deduplicates bounded work, ignores released replies and frees every retained resource', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const sha256 = await hashBytes(bytes.buffer);
  const data = {
    photos: Array.from({ length: 80 }, (_, i) => ({
      id: `p${i}`,
      url: `/packages/photos/${i}.webp`,
      bytes: 3,
      sha256,
    })),
  } as CampusData;
  const responses: (() => void)[] = [];
  let requests = 0;
  vi.stubGlobal('caches', {
    open: async () => ({ match: async () => undefined }),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      requests++;
      return new Promise<Response>((resolve) =>
        responses.push(() => resolve(new Response(bytes))),
      );
    }),
  );
  const pool = createFacadeTextures(() => {}),
    callback = vi.fn();
  const release = Array.from({ length: 80 }, (_, i) =>
    pool.acquire({ photoId: `p${i}`, corners }, data, callback),
  );
  const duplicate = pool.acquire({ photoId: 'p0', corners }, data, callback);
  await vi.waitFor(() => expect(requests).toBe(3));
  expect(pool.stats().bytes).toBeLessThanOrEqual(TEXTURE_MEMORY_LIMIT);
  expect(pool.stats().entries).toBeLessThan(80);
  const second = createFacadeTextures(() => {});
  for (let i = 0; i < 80; i++)
    second.acquire({ photoId: `p${i}`, corners }, data, callback);
  expect(pool.stats().bytes + second.stats().bytes).toBeLessThanOrEqual(
    TEXTURE_MEMORY_LIMIT,
  );
  second.dispose();
  release[0]();
  expect(pool.stats().entries).toBeGreaterThan(0);
  duplicate();
  for (const stop of release.slice(1)) stop();
  pool.dispose();
  for (const response of responses) response();
  await vi.waitFor(() => expect(pool.stats().running).toBe(0));
  expect(pool.stats().bytes).toBe(0);
  expect(callback).not.toHaveBeenCalled();
});
it('does not decode corrupt texture bytes', async () => {
  vi.stubGlobal('caches', {
    open: async () => ({ match: async () => new Response('bad') }),
  });
  const Worker = vi.fn();
  vi.stubGlobal('Worker', Worker);
  const pool = createFacadeTextures(() => {});
  const data = {
    photos: [
      {
        id: 'p',
        url: '/packages/photos/p.webp',
        bytes: 3,
        sha256: '0'.repeat(64),
      },
    ],
  } as CampusData;
  pool.acquire({ photoId: 'p', corners }, data, vi.fn());
  await vi.waitFor(() => expect(pool.stats().running).toBe(0));
  expect(Worker).not.toHaveBeenCalled();
  pool.dispose();
});
