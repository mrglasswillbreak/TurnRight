import { useEffect } from 'react';
import { sourceGeometry } from './source-comparison';
import { api } from './supabase';
import { type SourceDetail } from './source-updates';
import type { SourceUpdatesState } from './useSourceUpdates';
export function useSourceDetail({
  focusId,
  setDetail,
  setDetailLoading,
  onFocus,
  mapRef,
  setError,
  attempt,
}: Pick<
  SourceUpdatesState,
  | 'focusId'
  | 'setDetail'
  | 'setDetailLoading'
  | 'onFocus'
  | 'mapRef'
  | 'setError'
  | 'attempt'
>): void {
  useEffect(() => {
    if (!focusId) {
      setDetail(undefined);
      return;
    }
    let stopped = false;
    setDetailLoading(true);
    setDetail(undefined);
    void api<SourceDetail>('source-updates-detail', { id: focusId })
      .then((next) => {
        if (stopped) return;
        setDetail(next);
        onFocus(next.change);
        setDetailLoading(false);
        const points: number[][] = [];
        const collect = (value: unknown) => {
          if (!Array.isArray(value)) return;
          if (
            typeof value[0] === 'number' &&
            typeof value[1] === 'number' &&
            value.every(Number.isFinite)
          )
            points.push(value);
          else value.forEach(collect);
        };
        for (const value of [next.change.before, next.change.after]) {
          const geometry = sourceGeometry(value);
          if (geometry && 'coordinates' in geometry)
            collect(geometry.coordinates);
        }
        if (points.length) {
          const bounds = points.reduce(
            (b, p) => [
              Math.min(b[0], p[0]),
              Math.min(b[1], p[1]),
              Math.max(b[2], p[0]),
              Math.max(b[3], p[1]),
            ],
            [Infinity, Infinity, -Infinity, -Infinity],
          );
          mapRef.current?.fitBounds(
            [
              [bounds[0], bounds[1]],
              [bounds[2], bounds[3]],
            ],
            { padding: 55, maxZoom: 19 },
          );
        }
      })
      .catch((e) => {
        if (!stopped) {
          setError(e);
          setDetailLoading(false);
        }
      });
    return () => {
      stopped = true;
    };
    // The focused proposal is fetched on demand, never during inbox polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, attempt]);
}
