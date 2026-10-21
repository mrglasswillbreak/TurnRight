import { api, supabase, uploadPhotoOriginal } from './supabase';
import { photoDetails } from './photo-details';
import { measureOperation } from './performance';
import { type PhotoJob, type PrivatePhoto } from './photo-queue-store-contract';
import type { PhotoQueueStore } from './photo-queue-store-controller';
export async function processPhotoQueueStore(
  this: PhotoQueueStore,
  job: PhotoJob,
): Promise<void> {
  let id = job.mediaId;
  const request = <T>(action: string, payload: unknown) =>
    api<T>(action, payload, { signal: this.controller.signal });
  try {
    const file = this.files.get(job.key);
    let processed: PrivatePhoto | undefined;
    if (id) {
      const status = await request<PrivatePhoto>('media-status', { id });
      if (status.status === 'processed' || status.status === 'approved')
        processed = status;
    }
    if ((!id || file) && !processed) {
      if (!file || !supabase)
        throw Error(
          'Reselect the original file and connect to the internet to upload.',
        );
      this.patch(job.key, { state: 'uploading', error: undefined });
      const signed = await request<{
        id: string;
        bucket: string;
        path: string;
        token: string;
        status?: string;
      }>('media-begin', {
        uploadId: id || job.key,
        filename: file.name,
        bytes: file.size,
        mime: file.type,
        metadata: photoDetails(job.metadata),
      });
      id = signed.id;
      this.patch(job.key, { mediaId: id });
      if (!signed.status) {
        this.controller.signal.throwIfAborted();
        const started = performance.now();
        try {
          await uploadPhotoOriginal(signed, file, this.controller.signal);
        } finally {
          measureOperation('upload', started);
        }
        // Processing reconciles an already-stored original after a lost response.
      }
    }
    this.controller.signal.throwIfAborted();
    this.patch(job.key, { state: 'processing' });
    const result =
      processed || (await request<PrivatePhoto>('media-process', { id }));
    const current = this.jobs.find((j) => j.key === job.key);
    if (!current || this.stopped) return;
    this.files.delete(job.key);
    this.revoke(job.key);
    this.patch(job.key, {
      metadata: {
        ...current.metadata,
        ...result.metadata,
        ...photoDetails(current.metadata),
      },
      previewUrl: result.previewUrl,
      previewExpiresAt: result.previewExpiresAt,
      state: 'needs details',
      error: undefined,
    });
  } catch (e) {
    if (!this.stopped)
      this.patch(job.key, {
        state: navigator.onLine ? 'failed' : 'queued',
        error: navigator.onLine ? (e as Error).message : undefined,
      });
  }
}

export function scheduleSavePhotoQueueStore(
  this: PhotoQueueStore,
  job: PhotoJob,
): void {
  this.clearSave(job.key);
  if (
    !this.leader ||
    this.stopped ||
    this.saving.has(job.key) ||
    !job.mediaId ||
    job.approved ||
    !job.metadata.sha256 ||
    job.error ||
    ['uploading', 'processing'].includes(job.state)
  )
    return;
  const details = JSON.stringify(photoDetails(job.metadata));
  if (details === job.savedDetails) return;
  this.saveTimers.set(
    job.key,
    setTimeout(() => {
      this.saveTimers.delete(job.key);
      if (this.saving.size >= 2) {
        const current = this.jobs.find((j) => j.key === job.key);
        if (current) this.scheduleSave(current);
        return;
      }
      this.saving.add(job.key);
      void api<{ revision: number }>(
        'media-draft',
        {
          id: job.mediaId,
          revision: job.revision,
          metadata: photoDetails(job.metadata),
        },
        { signal: this.controller.signal },
      )
        .then((result) =>
          this.patch(job.key, {
            revision: result.revision,
            savedDetails: details,
          }),
        )
        .catch((e) => {
          if (
            !this.stopped &&
            !this.jobs.find((j) => j.key === job.key)?.approved
          )
            this.patch(job.key, {
              error: `Private saving paused: ${(e as Error).message}`,
            });
        })
        .finally(() => {
          this.saving.delete(job.key);
          const current = this.jobs.find((j) => j.key === job.key);
          if (current) this.scheduleSave(current);
        });
    }, 600),
  );
}
