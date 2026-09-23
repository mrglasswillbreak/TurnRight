import { api, supabase, uploadPhotoOriginal } from './supabase';
import { photoDetails } from './photo-details';
import type { CampusPhoto } from './types';
import { readPhotoRecovery, writePhotoRecovery } from './photo-recovery';
import { PhotoPreviews, type SignedPreview } from './photo-previews';
import { measureOperation } from './performance';
export interface PhotoJob extends SignedPreview {
  key: string;
  order?: number;
  target: string;
  filename: string;
  metadata: Partial<CampusPhoto>;
  mediaId?: string;
  revision: number;
  state:
    | 'queued'
    | 'uploading'
    | 'processing'
    | 'needs details'
    | 'ready'
    | 'failed';
  error?: string;
  original?: CampusPhoto;
  approved?: CampusPhoto;
  reviewed: boolean;
  rightsReviewed: boolean;
  authorshipConfirmed: boolean;
  savedDetails?: string;
}
export interface PrivatePhoto extends SignedPreview {
  id: string;
  filename?: string;
  status: string;
  metadata?: Partial<CampusPhoto>;
  draft?: Partial<CampusPhoto>;
  revision: number;
  authorshipConfirmed?: boolean;
  replacesPhotoId?: string;
}
const empty: PhotoJob[] = [];
export class PhotoQueueStore {
  jobs: PhotoJob[] = [];
  readonly previews = new PhotoPreviews();
  storageError = '';
  ready = false;
  leader = false;
  paused = false;
  private stopped = false;
  private started = false;
  private active = false;
  private release?: () => void;
  private controller = new AbortController();
  private listeners = new Set<() => void>();
  private targets = new Map<string, PhotoJob[]>();
  private files = new Map<string, File>();
  private urls = new Map<string, string>();
  private pending = new Map<string, PhotoJob | null>();
  private writing = false;
  private persistence: Promise<void> = Promise.resolve();
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private saving = new Set<string>();
  private thumbnail?: Worker;
  private thumbnails: string[] = [];
  private decoding?: string;
  private status = '';
  private localPending = false;
  private nextOrder = 0;
  constructor(readonly owner: string) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = (target: string) => this.targets.get(target) || empty;
  getStatus = () => this.status;
  getAvailability = () => `${this.ready && this.leader}:${this.storageError}`;
  get needsLeaveWarning() {
    return this.files.size > 0 || this.localPending || this.writing;
  }
  get signal() {
    return this.controller.signal;
  }
  async flushRecovery() {
    await this.persist();
    if (this.storageError || this.pending.size)
      throw Error('Photo recovery could not be saved. Keep this tab open.');
    if (this.files.size)
      throw Error(
        'Finish uploading the remaining photographs before installing an app update.',
      );
  }
  private notify() {
    this.status = `${this.jobs.filter((j) => ['queued', 'uploading', 'processing'].includes(j.state)).length} uploading or queued · ${this.jobs.length} private drafts${this.paused ? ' · Paused' : ''}${!this.leader && this.ready ? ' · Active in another tab' : ''} · ${this.localPending ? 'Saving recovery…' : 'Recovery saved'}${this.storageError ? ` · ${this.storageError}` : ''}`;
    this.listeners.forEach((fn) => fn());
  }
  async start() {
    if (this.started) return;
    this.started = true;
    try {
      await this.restore();
    } catch {
      this.storageError =
        'Local recovery unavailable. Keep this tab open until private saving succeeds.';
    }
    if (this.stopped) return;
    this.ready = true;
    this.notify();
    if (!navigator.locks) {
      this.storageError =
        'This browser cannot coordinate uploads safely. Use a browser with Web Locks support.';
      this.notify();
      return;
    }
    void navigator.locks
      .request(
        `turnright:photos:${this.owner}`,
        { signal: this.controller.signal },
        async () => {
          if (this.stopped) return;
          try {
            await this.restore();
          } catch {
            /* Retain the in-memory recovery copy. */
          }
          if (this.stopped) return;
          this.leader = true;
          this.notify();
          this.pump();
          for (const job of this.jobs) this.scheduleSave(job);
          await new Promise<void>((resolve) => {
            this.release = resolve;
          });
        },
      )
      .catch(() => {});
  }
  private async restore() {
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
    this.nextOrder = Math.max(0, ...this.jobs.map((j) => j.order || 0));
    this.targets.clear();
    for (const j of this.jobs)
      this.targets.set(j.target, [...(this.targets.get(j.target) || []), j]);
    this.notify();
  }
  update = (target: string, fn: (jobs: PhotoJob[]) => PhotoJob[]) => {
    if (this.stopped || !this.leader) return;
    const old = this.snapshot(target);
    const next = fn(old).map((j) =>
      j.order === undefined
        ? { ...j, target, order: ++this.nextOrder }
        : j.target === target
          ? j
          : { ...j, target },
    );
    const lookup = new Map(next.map((j) => [j.key, j]));
    for (const j of old)
      if (!lookup.has(j.key)) {
        this.pending.set(j.key, null);
        this.releaseFile(j.key);
        this.clearSave(j.key);
      }
    const previous = new Map(old.map((j) => [j.key, j]));
    for (const j of next)
      if (previous.get(j.key) !== j) {
        this.pending.set(j.key, j);
        this.scheduleSave(j);
      }
    this.targets.set(target, next);
    this.jobs = this.jobs.filter((j) => j.target !== target).concat(next);
    this.localPending = true;
    this.notify();
    void this.persist();
    this.pump();
  };
  patch = (key: string, value: Partial<PhotoJob>) => {
    const job = this.jobs.find((j) => j.key === key);
    if (job)
      this.update(job.target, (items) =>
        items.map((j) => (j.key === key ? { ...j, ...value } : j)),
      );
  };
  private persist(): Promise<void> {
    if (this.writing) return this.persistence;
    this.writing = true;
    this.persistence = this.writePending();
    return this.persistence;
  }
  private async writePending() {
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
  enqueue = (
    target: string,
    selected: File[],
    metadata: Partial<CampusPhoto>,
  ) => {
    if (!this.leader) return;
    const entries = selected.map((file) => {
      const key = crypto.randomUUID();
      const invalid =
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        !file.size ||
        file.size > 10 * 1024 * 1024;
      if (!invalid) {
        this.files.set(key, file);
        this.thumbnails.push(key);
      }
      return {
        key,
        target,
        filename: file.name,
        metadata: { ...metadata },
        revision: 0,
        state: invalid ? 'failed' : 'queued',
        error: invalid ? 'Choose a JPEG, PNG or WebP up to 10 MiB.' : undefined,
        reviewed: false,
        rightsReviewed: false,
        authorshipConfirmed: false,
      } as PhotoJob;
    });
    this.update(target, (items) => [...items, ...entries]);
    this.nextThumbnail();
  };
  private nextThumbnail() {
    if (this.stopped || this.decoding) return;
    const key = this.thumbnails.shift();
    if (!key) return;
    const file = this.files.get(key);
    if (!file) {
      this.nextThumbnail();
      return;
    }
    try {
      this.thumbnail ||= new Worker(
        new URL('./photo-thumbnail.worker.ts', import.meta.url),
        { type: 'module' },
      );
      this.thumbnail.onmessage = ({
        data,
      }: MessageEvent<{ key: string; blob?: Blob }>) => {
        const job = this.jobs.find((j) => j.key === data.key);
        if (data.blob && job && !job.metadata.sha256 && !this.stopped) {
          this.revoke(data.key);
          const url = URL.createObjectURL(data.blob);
          this.urls.set(data.key, url);
          this.patch(data.key, { previewUrl: url });
        }
        this.decoding = undefined;
        this.nextThumbnail();
      };
      this.thumbnail.onerror = () => {
        this.decoding = undefined;
        this.thumbnail?.terminate();
        this.thumbnail = undefined;
        this.thumbnails = [];
      };
      this.decoding = key;
      this.thumbnail.postMessage({ key, file });
    } catch {
      this.decoding = undefined;
      this.thumbnails = [];
    }
  }
  private revoke(key: string) {
    const url = this.urls.get(key);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(key);
  }
  private releaseFile(key: string) {
    this.files.delete(key);
    this.revoke(key);
  }
  retry = (key: string, file?: File) => {
    if (
      file &&
      (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        !file.size ||
        file.size > 10 * 1024 * 1024)
    ) {
      this.patch(key, {
        state: 'failed',
        error: 'Choose a JPEG, PNG or WebP up to 10 MiB.',
      });
      return;
    }
    if (file) this.files.set(key, file);
    this.patch(key, { state: 'queued', error: undefined });
  };
  remove = (key: string) => {
    const job = this.jobs.find((j) => j.key === key);
    if (job && !['uploading', 'processing'].includes(job.state))
      this.update(job.target, (items) => items.filter((j) => j.key !== key));
  };
  togglePause = () => {
    this.paused = !this.paused;
    this.notify();
    this.pump();
  };
  private pump() {
    if (this.active || this.paused || !this.leader || this.stopped) return;
    const job = this.jobs.find((j) => j.state === 'queued');
    if (!job) return;
    this.active = true;
    void this.process(job).finally(() => {
      this.active = false;
      this.pump();
    });
  }
  private async process(job: PhotoJob) {
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
        this.patch(job.key, { state: 'failed', error: (e as Error).message });
    }
  }
  private clearSave(key: string) {
    clearTimeout(this.saveTimers.get(key));
    this.saveTimers.delete(key);
  }
  private scheduleSave(job: PhotoJob) {
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
  stop() {
    this.stopped = true;
    this.controller.abort();
    void this.persist().finally(() => this.release?.());
    this.leader = false;
    this.thumbnail?.terminate();
    this.previews.close();
    for (const key of this.saveTimers.keys()) this.clearSave(key);
    for (const key of this.files.keys()) this.releaseFile(key);
    for (const key of this.urls.keys()) this.revoke(key);
    this.jobs = [];
    this.targets.clear();
    void this.persist();
  }
}
