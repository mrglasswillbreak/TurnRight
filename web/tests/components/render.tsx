import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cleanups: Array<() => void> = [];
afterEach(async () => {
  await act(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
  });
});

export async function render(element: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let mounted = true;
  const unmount = () => {
    if (!mounted) return;
    mounted = false;
    root.unmount();
    container.remove();
  };
  cleanups.push(unmount);
  await act(() => {
    root.render(element);
  });
  return {
    container,
    unmount: () => act(unmount),
    rerender: (next: ReactNode) =>
      act(() => {
        root.render(next);
      }),
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
