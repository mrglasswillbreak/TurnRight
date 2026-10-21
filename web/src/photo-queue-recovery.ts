import { readPhotoRecovery, writePhotoRecovery } from './photo-recovery';
import { localPhoto } from './photo-local';
import type { PhotoQueueStore } from './photo-queue-store-controller';
export async function restorePhotoQueueStore(
  this: PhotoQueueStore,
): Promise<void> {
  const jobs = await readPhotoRecovery(this.owner);
  if (this.stopped) return;
  this.jobs = jobs
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((j) => ({
      ...j,
      reviewed: false,
      previewUrl: j.original?.url,
      state: j.approved
        ? 'ready'
        : j.metadata.sha256
          ? 'needs details'
          : j.mediaId
            ? 'queued'
            : 'failed',
      error:
        j.metadata.sha256 || j.mediaId
          ? undefined
          : 'Reselect the original file; it did not finish uploading.',
    }));
  for (const job of this.jobs)
    if (job.localImageId && !job.metadata.sha256) {
      const prepared =
        job.preparedFile ||
        (await localPhoto(this.owner, job.localImageId))?.output;
      if (prepared) {
        this.files.set(
          job.key,
          new File([prepared], job.filename.replace(/\.[^.]+$/, '') + '.webp', {
            type: prepared.type,
          }),
        );
        job.state = 'queued';
        job.error = undefined;
      }
    }
  this.nextOrder = Math.max(0, ...this.jobs.map((j) => j.order || 0));
  this.targets.clear();
  for (const j of this.jobs)
    this.targets.set(j.target, [...(this.targets.get(j.target) || []), j]);
  this.notify();
}

export async function writePendingPhotoQueueStore(
  this: PhotoQueueStore,
): Promise<void> {
  try {
    while (this.pending.size) {
      const batch = this.pending;
      this.pending = new Map();
      try {
        await writePhotoRecovery(this.owner, batch);
        this.storageError = '';
      } catch {
        for (const [key, value] of batch)
          if (!this.pending.has(key)) this.pending.set(key, value);
        throw Error(
          'Local recovery unavailable. Keep this tab open until private saving succeeds.',
        );
      }
    }
    this.localPending = false;
  } catch (e) {
    this.storageError = (e as Error).message;
  } finally {
    this.writing = false;
    this.notify();
  }
}
