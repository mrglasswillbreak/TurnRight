import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { PhotoQueueStore } from '../src/photo-queue-store';
import { PhotoPreviews } from '../src/photo-previews';
import { assetTask, boundedMap } from '../src/asset-pool';
import { api } from '../src/supabase';
import type { PerformanceFixture } from './performance.test';
export function registerPhotosAndMap(fixture: () => PerformanceFixture): void {
  it('deduplicates signing, bounds concurrency and reuses unexpired previews', async () => {
    let active = 0,
      maximum = 0;
    const releases: (() => void)[] = [];
    vi.mocked(api).mockImplementation(async () => {
      active++;
      maximum = Math.max(active, maximum);
      await new Promise<void>((r) => releases.push(r));
      active--;
      return {
        previewUrl: '/signed',
        previewExpiresAt: Date.now() + 3_600_000,
      } as never;
    });
    const previews = new PhotoPreviews();
    const first = previews.get('one');
    expect(previews.get('one')).toBe(first);
    const others = ['two', 'three', 'four', 'five'].map((id) =>
      previews.get(id),
    );
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    releases.splice(0).forEach((r) => r());
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.splice(0).forEach((r) => r());
    await Promise.all([first, ...others]);
    await previews.get('one');
    expect(api).toHaveBeenCalledTimes(5);
    expect(maximum).toBe(3);
    previews.close();
  });
  it('processes a foreground queue sequentially while retaining original targets and pause', async () => {
    fixture().localStorageFake();
    const store = new PhotoQueueStore(crypto.randomUUID());
    fixture().stores.push(store);
    store.leader = store.ready = true;
    store.paused = true;
    let finish!: () => void,
      active = 0,
      max = 0;
    const targets: string[] = [];
    vi.mocked(api).mockImplementation(async (action, payload) => {
      if (action === 'media-begin') {
        targets.push(
          (payload as { metadata: { buildingId: string } }).metadata.buildingId,
        );
        return {
          id: crypto.randomUUID(),
          bucket: 'private',
          path: 'original',
          token: 'test',
        } as never;
      }
      if (action === 'media-process') {
        active++;
        max = Math.max(max, active);
        await new Promise<void>((r) => {
          finish = r;
        });
        active--;
        return { metadata: { sha256: 'b'.repeat(64) } } as never;
      }
      return { revision: 1 } as never;
    });
    const file = new File(['bytes'], 'photo.webp', { type: 'image/webp' });
    store.enqueue('building:one', [file], { buildingId: 'one' });
    store.enqueue('building:two', [file], { buildingId: 'two' });
    expect(api).not.toHaveBeenCalled();
    store.togglePause();
    await vi.waitFor(() => expect(active).toBe(1));
    store.togglePause();
    finish();
    await vi.waitFor(() =>
      expect(store.snapshot('building:one')[0].state).toBe('needs details'),
    );
    expect(targets).toEqual(['one']);
    store.togglePause();
    await vi.waitFor(() => expect(active).toBe(1));
    finish();
    await vi.waitFor(() =>
      expect(store.snapshot('building:two')[0].state).toBe('needs details'),
    );
    expect(targets).toEqual(['one', 'two']);
    expect(max).toBe(1);
  });
  it('bounds combined download/audit work and drains failures before returning', async () => {
    let active = 0,
      max = 0;
    const work = async (i: number) => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      if (i === 3) throw Error('corrupt');
      return i;
    };
    await Promise.allSettled([
      boundedMap([0, 1, 2, 3, 4], work),
      boundedMap([0, 1, 2], work),
    ]);
    expect(max).toBe(3);
    expect(active).toBe(0);
  });
  it('releases asset slots when work throws before returning a promise', async () => {
    const failed = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        assetTask(() => {
          throw Error('Invalid asset before fetching');
        }),
      ),
    );
    expect(failed.every((r) => r.status === 'rejected')).toBe(true);
    expect(await boundedMap([1, 2, 3, 4], async (n) => n * 2)).toEqual([
      2, 4, 6, 8,
    ]);
  });
}
