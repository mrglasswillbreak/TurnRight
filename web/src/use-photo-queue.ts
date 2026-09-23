import {
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  createContext,
} from 'react';
import { PhotoQueueStore, type PhotoJob } from './photo-queue-store';
import type { CampusPhoto } from './types';
export type { PhotoJob, PrivatePhoto } from './photo-queue-store';
export const PhotoQueueContext = createContext<PhotoQueueStore | null>(null);
export function usePhotoStore() {
  const store = useContext(PhotoQueueContext);
  if (!store) throw Error('Photo workspace requires an owner session.');
  return store;
}
export function usePhotoQueue(_owner: string, target: string) {
  const store = usePhotoStore();
  const snapshot = useCallback(() => store.snapshot(target), [store, target]);
  const jobs = useSyncExternalStore(store.subscribe, snapshot);
  const status = useSyncExternalStore(store.subscribe, store.getAvailability);
  const actions = useMemo(
    () => ({
      update: (fn: (jobs: PhotoJob[]) => PhotoJob[]) =>
        store.update(target, fn),
      patch: store.patch,
      enqueue: (files: File[], metadata: Partial<CampusPhoto>) =>
        store.enqueue(target, files, metadata),
      retry: store.retry,
      remove: store.remove,
    }),
    [store, target],
  );
  const separator = status.indexOf(':');
  return {
    ...actions,
    jobs,
    editable: status.slice(0, separator) === 'true',
    storageError: status.slice(separator + 1),
  };
}
