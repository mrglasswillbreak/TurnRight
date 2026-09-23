import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { campusFixture } from './fixture';
import { campusPhotoIndex } from '../src/campus-photo-index';
import {
  EditorValidationCache,
  LatestPreview,
  ValidationTransport,
  metadataChanges,
} from '../src/editor-validation-cache';
import { validateWorkspace } from '../src/editor-validation';
import { featureEdit } from '../src/editor-features';
import { readPhotoRecovery, writePhotoRecovery } from '../src/photo-recovery';
import { PhotoQueueStore, type PhotoJob } from '../src/photo-queue-store';
import { PhotoPreviews } from '../src/photo-previews';
import { boundedMap } from '../src/asset-pool';
import { api } from '../src/supabase';
import { thumbnailSize } from '../src/photo-thumbnail';
import type { CampusPhoto } from '../src/types';
vi.mock('../src/supabase', () => ({
  api: vi.fn(),
  uploadPhotoOriginal: vi.fn(async () => ({ error: null })),
  supabase: {
    storage: {
      from: () => ({ uploadToSignedUrl: vi.fn(async () => ({ error: null })) }),
    },
  },
}));
const stores: PhotoQueueStore[] = [];
afterEach(() => {
  stores.forEach((s) => s.stop());
  stores.length = 0;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
it('hands queue ownership to the next tab only after persisting the latest metadata', async () => {
  localStorageFake();
  let lock = Promise.resolve();
  vi.stubGlobal('navigator', {
    locks: {
      request: (
        _name: string,
        _options: unknown,
        callback: () => Promise<void>,
      ) => {
        const next = lock.then(callback);
        lock = next;
        return next;
      },
    },
  });
  const owner = crypto.randomUUID(),
    first = new PhotoQueueStore(owner),
    second = new PhotoQueueStore(owner);
  stores.push(first, second);
  await first.start();
  await vi.waitFor(() => expect(first.leader).toBe(true));
  first.update('building:one', () => [job('shared')]);
  await second.start();
  expect(second.leader).toBe(false);
  second.patch('shared', { filename: 'Must not write from another tab' });
  first.patch('shared', { filename: 'Saved by first tab' });
  first.stop();
  await vi.waitFor(() => expect(second.leader).toBe(true));
  expect(second.jobs[0].filename).toBe('Saved by first tab');
});
it('never replaces newer local details with an older private save response', async () => {
  localStorageFake();
  const store = new PhotoQueueStore(crypto.randomUUID());
  stores.push(store);
  store.leader = store.ready = true;
  let finish!: (value: unknown) => void;
  const saves: unknown[] = [];
  vi.mocked(api).mockImplementation(async (action, payload) => {
    expect(action).toBe('media-draft');
    saves.push(payload);
    return (await new Promise((r) => {
      finish = r;
    })) as never;
  });
  store.update('building:one', () => [
    { ...job('draft'), mediaId: 'private-id' },
  ]);
  await vi.waitFor(() => expect(saves).toHaveLength(1), { timeout: 2000 });
  store.patch('draft', {
    metadata: {
      ...store.jobs[0].metadata,
      caption: 'New caption while saving',
    },
  });
  finish({ revision: 1 });
  await vi.waitFor(() => expect(saves).toHaveLength(2), { timeout: 2000 });
  expect(saves[1]).toMatchObject({
    revision: 1,
    metadata: { caption: 'New caption while saving' },
  });
  expect(store.jobs[0].metadata.caption).toBe('New caption while saving');
  finish({ revision: 2 });
});
it('retains unsaved recovery after a storage failure and reports it to app updates', async () => {
  localStorageFake();
  const store = new PhotoQueueStore(crypto.randomUUID());
  stores.push(store);
  store.leader = store.ready = true;
  const unavailable = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
    throw Error('Quota exceeded');
  });
  store.update('building:one', () => [job('durable')]);
  await expect(store.flushRecovery()).rejects.toThrow(
    'recovery could not be saved',
  );
  expect(store.jobs[0].metadata.caption).toBe('Draft');
  unavailable.mockRestore();
  await store.flushRecovery();
  expect((await readPhotoRecovery(store.owner))[0].key).toBe('durable');
});
it('bounds decoded previews, rejects malformed headers and respects rotated JPEG dimensions', async () => {
  const png = new Uint8Array(24),
    view = new DataView(png.buffer);
  png.set([137, 80, 78, 71]);
  png.set([73, 72, 68, 82], 12);
  view.setUint32(16, 4000);
  view.setUint32(20, 2000);
  expect(await thumbnailSize(new Blob([png]))).toEqual({
    width: 640,
    height: 320,
  });
  view.setUint32(16, 40000);
  expect(await thumbnailSize(new Blob([png]))).toBeNull();
  expect(await thumbnailSize(new Blob(['not an image']))).toBeNull();
  const jpeg = new Uint8Array(52),
    j = new DataView(jpeg.buffer);
  jpeg.set([
    255, 216, 255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0,
    0, 1, 0,
  ]);
  j.setUint16(22, 274, true);
  j.setUint16(30, 6, true);
  jpeg.set([255, 192, 0, 11, 8], 38);
  j.setUint16(43, 2000);
  j.setUint16(45, 4000);
  expect(await thumbnailSize(new Blob([jpeg]))).toEqual({
    width: 320,
    height: 640,
  });
});
it('expires signed previews and discards private caches at sign-out', async () => {
  vi.mocked(api).mockResolvedValue({
    previewUrl: '/private',
    previewExpiresAt: Date.now() + 10,
  } as never);
  const previews = new PhotoPreviews();
  await previews.get('old');
  await new Promise((r) => setTimeout(r, 0));
  await previews.get('old');
  expect(api).toHaveBeenCalledTimes(2);
  previews.close();
  await expect(previews.get('old')).rejects.toThrow('Owner session ended');
});
function localStorageFake() {
  const items: Record<string, string> = {};
  vi.stubGlobal(
    'localStorage',
    new Proxy(
      {
        getItem: (key: string) => items[key] || null,
        setItem: (key: string, value: string) => {
          items[key] = value;
        },
        removeItem: (key: string) => {
          delete items[key];
        },
      },
      {
        ownKeys: () => Object.keys(items),
        getOwnPropertyDescriptor: () => ({
          configurable: true,
          enumerable: true,
        }),
      },
    ),
  );
  return items;
}
const job = (key: string, target = 'building:one'): PhotoJob => ({
  key,
  target,
  filename: 'view.webp',
  metadata: { buildingId: 'one', caption: 'Draft', sha256: 'a'.repeat(64) },
  revision: 0,
  reviewed: false,
  rightsReviewed: false,
  authorshipConfirmed: false,
  state: 'needs details',
});
it('metadata validation matches authoritative publication for changed captions across galleries', () => {
  const data = campusFixture();
  data.map.features.push(
    ...['one', 'two'].map((id) => ({
      ...data.boundary,
      properties: { kind: 'building', id },
    })),
  );
  const photo = (buildingId: string): CampusPhoto => ({
    id: `photo-${buildingId}`,
    buildingId,
    caption: 'Original view',
    alt: 'Exterior view',
    author: 'Photographer',
    sourceUrl: 'https://example.org/original',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Photographer, CC BY 4.0',
    modifications: 'Converted to WebP',
    checkedAt: '2026-09-23',
    width: 800,
    height: 600,
    bytes: 100,
    sha256: 'a'.repeat(64),
    url: `/packages/photos/${'a'.repeat(64)}.webp`,
  });
  const edits = ['one', 'two'].map((id) => ({
    ...featureEdit(data, 'building', id, [])!,
    properties: { name: id, photos: [photo(id)] },
  }));
  const cache = new EditorValidationCache(data, 1);
  const first = cache.validate(edits);
  expect(first.usable).toBe(true);
  expect(first.errors).toEqual([]);
  const changed = edits.map((edit, i) =>
    i
      ? edit
      : {
          ...edit,
          properties: {
            ...edit.properties,
            photos: [{ ...photo('one'), caption: 'Revised view' }],
          },
        },
  );
  const preview = cache.validate(changed);
  expect(preview.data.graph).toBe(first.data.graph);
  expect(preview.data.map).toBe(first.data.map);
  expect(preview.data).toEqual(validateWorkspace(data, changed, 1).data);
});
it('cancels obsolete preview readers without cancelling another reader of the same photograph', async () => {
  let finish!: (value: unknown) => void;
  let signal!: AbortSignal;
  vi.mocked(api).mockImplementation(async (_action, _payload, options) => {
    signal = options!.signal!;
    return (await new Promise((resolve) => {
      finish = resolve;
    })) as never;
  });
  const previews = new PhotoPreviews(),
    a = new AbortController(),
    b = new AbortController();
  const first = previews.get('shared', false, a.signal),
    second = previews.get('shared', false, b.signal);
  const cancelled = expect(first).rejects.toThrow();
  a.abort();
  expect(signal.aborted).toBe(false);
  finish({ previewUrl: '/verified' });
  await cancelled;
  expect((await second).previewUrl).toBe('/verified');
  expect(api).toHaveBeenCalledTimes(1);
  previews.close();
});
it('reuses the building/occupant index and invalidates it with campus snapshots', () => {
  const data = campusFixture();
  data.map.features.push({
    ...data.boundary,
    properties: { id: 'one', kind: 'building', placeId: data.places[0].id },
  });
  const index = campusPhotoIndex(data);
  expect(index.name('one')).toBe(data.places[0].name);
  expect(index.placeBuildings.get(data.places[0].id)).toBe('one');
  expect(campusPhotoIndex(data)).toBe(index);
  const next = {
    ...data,
    places: data.places.map((p, i) =>
      i ? p : { ...p, name: 'Updated tenant' },
    ),
  };
  expect(campusPhotoIndex(next).name('one')).toBe('Updated tenant');
});
it('reuses topology for photo changes, but fully checks permissions and unknown fields', () => {
  const data = campusFixture();
  data.map.features.push({
    ...data.boundary,
    properties: { id: 'one', kind: 'building', name: 'Library' },
  });
  const edit = featureEdit(data, 'building', 'one', [])!;
  edit.properties.photos = [];
  const cache = new EditorValidationCache(data, 1);
  const first = cache.validate([edit]);
  const next = { ...edit, updated_at: 'new revision' };
  const second = cache.validate([next]);
  expect(second.data.graph).toBe(first.data.graph);
  expect(second.data.map).toBe(first.data.map);
  expect(cache.validate([next], true).data).toEqual(
    validateWorkspace(data, [next], 1).data,
  );
  expect(
    metadataChanges(
      [edit],
      [{ ...edit, properties: { ...edit.properties, access: 'yes' } }],
    ),
  ).toBeNull();
  expect(
    metadataChanges(
      [edit],
      [{ ...edit, properties: { ...edit.properties, futurePermission: true } }],
    ),
  ).toBeNull();
  expect(metadataChanges([edit], [])).toBeNull();
});
it('returns only changed validation slices and keeps the latest waiting preview', async () => {
  const data = campusFixture(),
    transport = new ValidationTransport();
  const full = validateWorkspace(data, []);
  expect(transport.encode(full).data.graph).toBeDefined();
  expect(
    transport.encode({ ...full, data: { ...full.data, photos: [] } }).data,
  ).toEqual({ photos: [] });
  const queue = new LatestPreview();
  let release!: () => void;
  const calls: number[] = [];
  const a = queue.request(async () => {
    calls.push(1);
    await new Promise<void>((r) => {
      release = r;
    });
    return full;
  });
  const b = queue.request(async () => {
    calls.push(2);
    return full;
  });
  const rejected = expect(b).rejects.toThrow('superseded');
  const c = queue.request(async () => {
    calls.push(3);
    return full;
  });
  release();
  await Promise.all([a, c, rejected]);
  expect(calls).toEqual([1, 3]);
});
it('migrates recovery once, excludes signed URLs and preserves newer per-photo saves', async () => {
  const items = localStorageFake(),
    owner = crypto.randomUUID(),
    key = `turnright:photo-drafts:${owner}:building:one`;
  items[key] = JSON.stringify([
    { ...job('first'), previewUrl: 'https://private/token' },
  ]);
  expect(await readPhotoRecovery(owner)).toHaveLength(1);
  expect(items[key]).toBeUndefined();
  await writePhotoRecovery(
    owner,
    new Map([['first', { ...job('first'), filename: 'Newer filename' }]]),
  );
  items[key] = JSON.stringify([job('first')]);
  const recovered = await readPhotoRecovery(owner);
  expect(recovered[0].filename).toBe('Newer filename');
  expect(recovered[0]).not.toHaveProperty('previewUrl');
  expect(await readPhotoRecovery('another-owner')).toEqual([]);
});
it('preserves queue order across IndexedDB reloads even when UUID order differs', async () => {
  localStorageFake();
  const owner = crypto.randomUUID(),
    original = new PhotoQueueStore(owner);
  stores.push(original);
  original.leader = original.ready = true;
  original.update('building:one', () => [job('z-first'), job('a-second')]);
  await original.flushRecovery();
  original.stop();
  const restored = new PhotoQueueStore(owner);
  stores.push(restored);
  await restored.start();
  expect(restored.jobs.map((j) => j.key)).toEqual(['z-first', 'a-second']);
});
it('releases local preview URLs and original file references when a queued photo is removed', async () => {
  localStorageFake();
  const worker = {
    onmessage: undefined as
      | ((event: { data: { key: string; blob: Blob } }) => void)
      | undefined,
    postMessage() {},
    terminate() {},
  };
  vi.stubGlobal(
    'Worker',
    class {
      constructor() {
        return worker;
      }
    },
  );
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  const store = new PhotoQueueStore(crypto.randomUUID());
  stores.push(store);
  store.leader = store.ready = store.paused = true;
  store.enqueue(
    'building:one',
    [new File(['original'], 'view.webp', { type: 'image/webp' })],
    { buildingId: 'one' },
  );
  const key = store.jobs[0].key;
  worker.onmessage!({ data: { key, blob: new Blob(['thumbnail']) } });
  const url = store.jobs[0].previewUrl;
  expect(url).toMatch(/^blob:/);
  store.remove(key);
  await store.flushRecovery();
  expect(revoke).toHaveBeenCalledWith(url);
  expect(store.needsLeaveWarning).toBe(false);
});
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
  const others = ['two', 'three', 'four', 'five'].map((id) => previews.get(id));
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
  localStorageFake();
  const store = new PhotoQueueStore(crypto.randomUUID());
  stores.push(store);
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
