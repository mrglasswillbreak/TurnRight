import { photoDetails, samePhotoRights } from './photo-details';
import type { CampusPhoto } from './types';
import { PhotoPreviews } from './photo-previews';
import { type LocalPhoto } from './photo-local';
import { processes } from './process-monitor';
import { type PhotoJob, empty } from './photo-queue-store-contract';
import {
  processPhotoQueueStore,
  scheduleSavePhotoQueueStore,
} from './photo-queue-processing';
import {
  restorePhotoQueueStore,
  writePendingPhotoQueueStore,
} from './photo-queue-recovery';
/** Internal implementation. The public module exposes only the supported controller API. */
export class PhotoQueueStore {
  jobs: PhotoJob[] = [];
  readonly previews = new PhotoPreviews();
  storageError = '';
  ready = false;
  leader = false;
  paused = false;
  stopped = false;
  started = false;
  active = false;
  release?: () => void;
  controller = new AbortController();
  listeners = new Set<() => void>();
  targets = new Map<string, PhotoJob[]>();
  files = new Map<string, File>();
  urls = new Map<string, string>();
  pending = new Map<string, PhotoJob | null>();
  writing = false;
  persistence: Promise<void> = Promise.resolve();
  saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  saving = new Set<string>();
  thumbnail?: Worker;
  thumbnails: string[] = [];
  decoding?: string;
  status = '';
  localPending = false;
  nextOrder = 0;
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
    return (
      [...this.files.keys()].some(
        (key) => !this.jobs.find((j) => j.key === key)?.localImageId,
      ) ||
      this.localPending ||
      this.writing
    );
  }
  get signal() {
    return this.controller.signal;
  }
  async flushRecovery() {
    await this.persist();
    if (this.storageError || this.pending.size)
      throw Error('Photo recovery could not be saved. Keep this tab open.');
    if (
      [...this.files.keys()].some(
        (key) => !this.jobs.find((j) => j.key === key)?.localImageId,
      )
    )
      throw Error(
        'Finish uploading the remaining photographs before installing an app update.',
      );
  }
  notify() {
    const previous = new Map(processes.snapshot().map((p) => [p.id, p]));
    processes.batch(() => {
      for (const job of this.jobs)
        processes.set({
          id: `photo:${job.key}`,
          title: `Photo: ${job.filename}`,
          stage:
            job.error ||
            (job.state === 'queued' && !navigator.onLine
              ? 'Waiting for connection'
              : job.state),
          state:
            job.state === 'failed'
              ? 'failed'
              : ['ready', 'needs details'].includes(job.state)
                ? 'complete'
                : job.state === 'queued'
                  ? 'waiting'
                  : 'running',
          retry:
            job.state === 'failed'
              ? previous.get(`photo:${job.key}`)?.retry ||
                (() => this.retry(job.key))
              : undefined,
        });
    });
    this.status = `${this.jobs.filter((j) => ['queued', 'uploading', 'processing'].includes(j.state)).length} uploading or queued · ${this.jobs.length} private drafts${this.paused ? ' · Paused' : ''}${!this.leader && this.ready ? ' · Active in another tab' : ''} · ${this.localPending ? 'Saving recovery…' : 'Recovery saved'}${this.storageError ? ` · ${this.storageError}` : ''}`;
    this.listeners.forEach((fn) => fn());
  }
  async start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('online', this.reconnect);
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
  restore(): ReturnType<typeof restorePhotoQueueStore> {
    return restorePhotoQueueStore.call(this);
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
  persist(): Promise<void> {
    if (this.writing) return this.persistence;
    this.writing = true;
    this.persistence = this.writePending();
    return this.persistence;
  }
  writePending(): ReturnType<typeof writePendingPhotoQueueStore> {
    return writePendingPhotoQueueStore.call(this);
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
  enqueuePrepared = (target: string, photos: LocalPhoto[]) => {
    if (!this.leader) return;
    for (const photo of photos) {
      if (
        !photo.output ||
        photo.output.type !== 'image/webp' ||
        photo.output.size > 250 * 1024 ||
        !photo.width ||
        !photo.height ||
        Math.max(photo.width, photo.height) > 1600
      )
        throw Error(
          'Prepare a WebP up to 1600px and 250 KiB before uploading.',
        );
    }
    const entries: PhotoJob[] = photos.map((photo) => {
      const key = crypto.randomUUID();
      this.files.set(
        key,
        new File(
          [photo.output!],
          photo.filename.replace(/\.[^.]+$/, '') + '.webp',
          { type: 'image/webp' },
        ),
      );
      return {
        key,
        target,
        filename: photo.filename,
        localImageId: photo.id,
        preparedFile: photo.output,
        original: photo.original,
        metadata: {
          ...photoDetails(photo.metadata),
          modifications: photo.metadata.modifications,
        },
        revision: 0,
        state: 'queued',
        reviewed: false,
        rightsReviewed:
          !!photo.original && samePhotoRights(photo.metadata, photo.original),
        authorshipConfirmed: photo.metadata.sourceKind === 'author-upload',
      };
    });
    this.update(target, (items) => [...items, ...entries]);
    return entries.map((entry) => entry.key);
  };
  nextThumbnail() {
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
  revoke(key: string) {
    const url = this.urls.get(key);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(key);
  }
  releaseFile(key: string) {
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
  pump() {
    if (
      this.active ||
      this.paused ||
      !this.leader ||
      this.stopped ||
      !navigator.onLine
    )
      return;
    const job = this.jobs.find((j) => j.state === 'queued');
    if (!job) return;
    this.active = true;
    void this.process(job).finally(() => {
      this.active = false;
      this.pump();
    });
  }
  reconnect = () => this.pump();
  process(job: PhotoJob): ReturnType<typeof processPhotoQueueStore> {
    return processPhotoQueueStore.call(this, job);
  }
  clearSave(key: string) {
    clearTimeout(this.saveTimers.get(key));
    this.saveTimers.delete(key);
  }
  scheduleSave(job: PhotoJob): ReturnType<typeof scheduleSavePhotoQueueStore> {
    return scheduleSavePhotoQueueStore.call(this, job);
  }
  stop() {
    this.stopped = true;
    this.controller.abort();
    window.removeEventListener('online', this.reconnect);
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
