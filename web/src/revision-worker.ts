export interface WorkerPort {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}
/** A dataset is cloned once per revision; subsequent requests carry only edits/endpoints. */
export class RevisionWorker<Data, Payload, Result> {
  private data?: Data;
  private revision = 0;
  private sequence = 0;
  private stopped = false;
  private pending = new Map<
    number,
    {
      revision: number;
      resolve: (value: Result) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private worker: WorkerPort,
    private timeoutMs = 30_000,
  ) {
    worker.onmessage = (event) => {
      const { id, revision, result, error } = event.data;
      const request = this.pending.get(id);
      if (!request || request.revision !== revision) return;
      clearTimeout(request.timer);
      this.pending.delete(id);
      if (error) request.reject(new Error(error));
      else request.resolve(result);
    };
    worker.onerror = () =>
      this.close('Map processing stopped unexpectedly. Retry this action.');
  }
  get closed() {
    return this.stopped;
  }
  request(data: Data, payload: Payload): Promise<Result> {
    if (this.stopped)
      return Promise.reject(
        new Error('Map processing is unavailable. Reload to retry.'),
      );
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      try {
        if (data !== this.data) {
          this.revision++;
          for (const request of this.pending.values()) {
            clearTimeout(request.timer);
            request.reject(
              new Error('The map changed. Try again with the latest map.'),
            );
          }
          this.pending.clear();
          this.worker.postMessage({
            type: 'init',
            revision: this.revision,
            data,
          });
          this.data = data;
        }
        const timer = setTimeout(
          () =>
            this.close('Map processing timed out. Retry with the current map.'),
          this.timeoutMs,
        );
        this.pending.set(id, {
          revision: this.revision,
          resolve,
          reject,
          timer,
        });
        this.worker.postMessage({
          type: 'request',
          id,
          revision: this.revision,
          payload,
        });
      } catch (error) {
        clearTimeout(this.pending.get(id)?.timer);
        this.pending.delete(id);
        reject(
          error instanceof Error
            ? error
            : new Error('Could not send map request.'),
        );
      }
    });
  }
  close(message = 'Map request cancelled') {
    this.stopped = true;
    this.worker.terminate();
    this.pending.forEach((request) => {
      clearTimeout(request.timer);
      request.reject(new Error(message));
    });
    this.pending.clear();
  }
}
export type RevisionRequest<Data, Payload> =
  | { type: 'init'; revision: number; data: Data }
  | { type: 'request'; id: number; revision: number; payload: Payload };
