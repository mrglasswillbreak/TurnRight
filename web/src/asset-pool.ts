let active = 0;
const pending: (() => void)[] = [];
/** Shared by downloads and audits: no more than three assets held in flight. */
export function assetTask<T>(work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    pending.push(() => {
      active++;
      void work()
        .then(resolve, reject)
        .finally(() => {
          active--;
          pump();
        });
    });
    pump();
  });
}
function pump() {
  while (active < 3 && pending.length) pending.shift()!();
}
export async function boundedMap<T, R>(
  items: readonly T[],
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  let cursor = 0,
    failed = false,
    failure: unknown;
  const result: R[] = [];
  await Promise.all(
    Array.from({ length: Math.min(3, items.length) }, async () => {
      while (!failed && cursor < items.length) {
        const index = cursor++;
        try {
          result[index] = await assetTask(() => work(items[index], index));
        } catch (error) {
          failed = true;
          failure = error;
        }
      }
    }),
  );
  if (failed) throw failure;
  return result;
}
