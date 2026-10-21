import { PhotoQueueStore as Controller } from './photo-queue-store-controller';
export { type PhotoJob, type PrivatePhoto } from './photo-queue-store-contract';
export type PhotoQueueStore = Pick<
  Controller,
  | 'jobs'
  | 'storageError'
  | 'ready'
  | 'leader'
  | 'paused'
  | 'subscribe'
  | 'snapshot'
  | 'getStatus'
  | 'getAvailability'
  | 'needsLeaveWarning'
  | 'signal'
  | 'flushRecovery'
  | 'start'
  | 'update'
  | 'patch'
  | 'enqueue'
  | 'enqueuePrepared'
  | 'retry'
  | 'remove'
  | 'togglePause'
  | 'stop'
> & {
  readonly previews: Controller['previews'];
  readonly owner: Controller['owner'];
};
export const PhotoQueueStore: new (
  ...args: ConstructorParameters<typeof Controller>
) => PhotoQueueStore = Controller;
