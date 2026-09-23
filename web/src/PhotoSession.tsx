import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { PhotoQueueStore } from './photo-queue-store';
import { PhotoQueueContext } from './use-photo-queue';
import './photo-manager.css';
import { registerPhotoRecovery } from './update-safety';
function UploadStatus({ store }: { store: PhotoQueueStore }) {
  const status = useSyncExternalStore(store.subscribe, store.getStatus);
  if (!store.jobs.length && !store.storageError) return null;
  return (
    <aside className="owner-upload-status" aria-label="Private photo uploads">
      <output aria-live="off">{status}</output>
      <span className="sr-only" aria-live="polite">
        {
          store.jobs.filter((j) =>
            ['queued', 'uploading', 'processing'].includes(j.state),
          ).length
        }{' '}
        photographs left to upload{store.paused ? ', paused' : ''}
      </span>
      <button disabled={!store.leader} onClick={store.togglePause}>
        {store.paused ? 'Resume uploads' : 'Pause uploads'}
      </button>
    </aside>
  );
}
export function PhotoSession({
  owner,
  children,
}: {
  owner: string;
  children: ReactNode;
}) {
  const [store, setStore] = useState(() => new PhotoQueueStore(owner));
  useEffect(() => {
    const current = new PhotoQueueStore(owner);
    setStore(current);
    void current.start();
    const unregister = registerPhotoRecovery(current, () =>
      current.flushRecovery(),
    );
    const leave = (event: BeforeUnloadEvent) => {
      if (current.needsLeaveWarning) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => {
      unregister();
      window.removeEventListener('beforeunload', leave);
      current.stop();
    };
  }, [owner]);
  return (
    <PhotoQueueContext value={store}>
      {children}
      <UploadStatus store={store} />
    </PhotoQueueContext>
  );
}
