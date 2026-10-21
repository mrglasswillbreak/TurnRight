import 'fake-indexeddb/auto';
import { afterEach, beforeEach, vi } from 'vitest';
import { PhotoQueueStore, type PhotoJob } from '../src/photo-queue-store';
import { registerStorageAndScheduling } from './performance-storage-and-scheduling';
import { registerPhotosAndMap } from './performance-photos-and-map';
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
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => {
  stores.forEach((s) => s.stop());
  stores.length = 0;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
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
const fixture = () => ({ stores, localStorageFake, job });
export type PerformanceFixture = ReturnType<typeof fixture>;
registerStorageAndScheduling(fixture);
registerPhotosAndMap(fixture);
