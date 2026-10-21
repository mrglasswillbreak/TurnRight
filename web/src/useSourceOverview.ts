import { useEffect } from 'react';
import { api } from './supabase';
import { AdminRequestError } from './admin-client';
import {
  operationActive,
  type SourceHistory,
  type SourceOverview,
  type SourcePage,
} from './source-updates';
import type { SourceUpdatesState } from './useSourceUpdates';
export function useSourceOverview({
  setLoading,
  filters,
  cursor,
  setPage,
  setOverview,
  setOperations,
  setError,
  reconciled,
  observed,
  refreshRef,
  setAttempt,
  setNotice,
  queryKey,
  attempt,
}: Pick<
  SourceUpdatesState,
  | 'setLoading'
  | 'filters'
  | 'cursor'
  | 'setPage'
  | 'setOverview'
  | 'setOperations'
  | 'setError'
  | 'reconciled'
  | 'observed'
  | 'refreshRef'
  | 'setAttempt'
  | 'setNotice'
  | 'queryKey'
  | 'attempt'
>): void {
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    setLoading(true);
    const load = async () => {
      if (document.hidden || !navigator.onLine) {
        timer = setTimeout(load, 5000);
        return;
      }
      try {
        const [next, status, history] = await Promise.all([
          api<SourcePage>(
            'source-updates-list',
            { filters, cursor },
            { signal: controller.signal },
          ),
          api<SourceOverview>(
            'source-updates-overview',
            {},
            { signal: controller.signal },
          ),
          api<SourceHistory>(
            'source-updates-history',
            {},
            { signal: controller.signal },
          ),
        ]);
        if (stopped) return;
        setPage(next);
        setOverview(status);
        setOperations(history.operations);
        setError(null);
        setLoading(false);
        const finished = history.operations.filter(
          (op) =>
            !operationActive(op) &&
            !reconciled.current.has(`${op.id}:${op.updated_at}`) &&
            (observed.current.has(op.id) || op.applied > 0),
        );
        for (const op of history.operations)
          if (operationActive(op)) observed.current.add(op.id);
        if (finished.length) {
          await refreshRef.current();
          for (const op of finished) {
            observed.current.delete(op.id);
            reconciled.current.add(`${op.id}:${op.updated_at}`);
          }
          setAttempt((n) => n + 1);
          setNotice(
            'Background review finished. The editor is refreshed; publishing is still a separate step.',
          );
        }
        timer = setTimeout(
          load,
          history.operations.some(operationActive) ||
            status.sources.some((s) => s.active)
            ? 5000
            : 30000,
        );
      } catch (e) {
        if (stopped) return;
        setError(e as Error);
        setLoading(false);
        if (!(e instanceof AdminRequestError && e.reason === 'auth'))
          timer = setTimeout(load, 15000);
      }
    };
    timer = setTimeout(load, 150);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
    // A serialized query keeps timer refreshes stable while the parent renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, attempt]);
}
