import {
  useEffect,
  useContext,
  lazy,
  Suspense,
  useState,
  type ReactNode,
} from 'react';
import { PhotoQueueStore } from './photo-queue-store';
import { PhotoQueueContext } from './use-photo-queue';
import './photo-manager.css';
import { registerPhotoRecovery } from './update-safety';
const ProcessMonitor = lazy(() => import('./ProcessMonitor'));
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
  return <PhotoQueueContext value={store}>{children}</PhotoQueueContext>;
}

export function PhotoActivity() {
  const store = useContext(PhotoQueueContext);
  return (
    <Suspense fallback={null}>
      <ProcessMonitor photoStore={store || undefined} />
    </Suspense>
  );
}
