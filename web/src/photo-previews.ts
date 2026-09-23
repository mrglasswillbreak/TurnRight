import { api } from './supabase';
export interface SignedPreview {
  previewUrl?: string;
  previewExpiresAt?: number;
}
interface PreviewRequest {
  controller: AbortController;
  promise: Promise<SignedPreview>;
  consumers: number;
}
/** Owner-session LRU: three signing requests, one shared request per upload. */
export class PhotoPreviews {
  private cache = new Map<string, SignedPreview>();
  private flights = new Map<string, PreviewRequest>();
  private pending: (() => void)[] = [];
  private active = 0;
  private controller = new AbortController();
  get(id: string, renew = false, signal?: AbortSignal): Promise<SignedPreview> {
    if (this.controller.signal.aborted || signal?.aborted)
      return Promise.reject(
        new DOMException(
          'Owner session ended or preview cancelled',
          'AbortError',
        ),
      );
    const cached = this.cache.get(id);
    if (
      !renew &&
      cached?.previewUrl &&
      (cached.previewExpiresAt || 0) > Date.now() + 60_000
    ) {
      this.cache.delete(id);
      this.cache.set(id, cached);
      return Promise.resolve(cached);
    }
    let entry = this.flights.get(id);
    if (entry?.controller.signal.aborted) entry = undefined;
    if (!entry) {
      const controller = new AbortController();
      let begin!: () => void;
      const promise = new Promise<SignedPreview>((resolve, reject) => {
        begin = () => {
          if (controller.signal.aborted || this.controller.signal.aborted) {
            reject(new DOMException('Preview cancelled', 'AbortError'));
            return;
          }
          this.active++;
          void api<SignedPreview>(
            'media-preview',
            { id },
            {
              signal: AbortSignal.any([
                this.controller.signal,
                controller.signal,
              ]),
            },
          )
            .then((value) => {
              controller.signal.throwIfAborted();
              this.controller.signal.throwIfAborted();
              this.cache.delete(id);
              this.cache.set(id, {
                ...value,
                previewExpiresAt:
                  value.previewExpiresAt || Date.now() + 300_000,
              });
              while (this.cache.size > 100)
                this.cache.delete(this.cache.keys().next().value!);
              resolve(value);
            })
            .catch(reject)
            .finally(() => {
              this.active--;
              this.pump();
            });
        };
      });
      entry = { controller, promise, consumers: 0 };
      this.flights.set(id, entry);
      const current = entry;
      const cleanup = () => {
        if (this.flights.get(id) === current) this.flights.delete(id);
      };
      void promise.then(cleanup, cleanup);
      this.pending.push(begin);
      this.pump();
    }
    entry.consumers++;
    if (!signal) return entry.promise;
    const current = entry;
    return new Promise((resolve, reject) => {
      let done = false;
      const release = () => {
        if (done) return;
        done = true;
        signal.removeEventListener('abort', abort);
        if (--current.consumers === 0) current.controller.abort();
      };
      const abort = () => {
        release();
        reject(signal.reason);
      };
      signal.addEventListener('abort', abort, { once: true });
      void current.promise.then(
        (value) => {
          release();
          resolve(value);
        },
        (error) => {
          release();
          reject(error);
        },
      );
    });
  }
  private pump() {
    while (this.active < 3 && this.pending.length) this.pending.shift()!();
  }
  close() {
    this.controller.abort();
    this.cache.clear();
    this.pump();
  }
}
