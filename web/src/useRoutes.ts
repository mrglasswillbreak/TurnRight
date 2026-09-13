import { useCallback, useEffect, useRef } from 'react';
import type { CampusData, RouteOrigin, RouteEndpoint, Route } from './types';
import { RevisionWorker } from './revision-worker';
export type RouteRequest = { origin: RouteOrigin; destination: RouteEndpoint };
export function useRoutes() {
  const worker = useRef<RevisionWorker<
    CampusData,
    RouteRequest,
    Route[]
  > | null>(null);
  useEffect(() => {
    const client = new RevisionWorker<CampusData, RouteRequest, Route[]>(
      new Worker(new URL('./routing.worker.ts', import.meta.url), {
        type: 'module',
      }),
    );
    worker.current = client;
    return () => {
      client.close();
      worker.current = null;
    };
  }, []);
  return useCallback(
    (data: CampusData, origin: RouteOrigin, destination: RouteEndpoint) => {
      if (!worker.current)
        return Promise.reject(
          new Error('Routing is starting. Please try again.'),
        );
      return worker.current.request(data, { origin, destination });
    },
    [],
  );
}
