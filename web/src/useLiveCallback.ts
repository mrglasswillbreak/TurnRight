import { useCallback, useRef } from 'react';
export // Stable event handlers read the current render without invalidating unrelated cards.
function useLiveCallback<T extends (...args: never[]) => unknown>(
  callback: T,
): T {
  const latest = useRef(callback);
  latest.current = callback;
  return useCallback(((...args) => latest.current(...args)) as T, []);
}
