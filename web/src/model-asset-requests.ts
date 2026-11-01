import { DETAIL_MODEL_LIMITS } from './model-lod-types';

let running = 0;
const waiting: Array<() => void> = [];

/** Geometry and photographic textures share one bounded request queue. */
export function modelAssetRequest<T>(work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    waiting.push(() => {
      running++;
      void work()
        .then(resolve, reject)
        .finally(() => {
          running--;
          pump();
        });
    });
    pump();
  });
}
function pump() {
  while (running < DETAIL_MODEL_LIMITS.concurrency && waiting.length)
    waiting.shift()!();
}
