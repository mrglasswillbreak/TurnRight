import { useCallback, useEffect, useRef } from "react";
import type { CampusData, Position, Route } from "./types";
export function useRoutes() {
  const worker = useRef<Worker | null>(null),
    counter = useRef(0);
  const pending = useRef(
    new Map<number, { resolve: (routes: Route[]) => void; reject: (error: Error) => void }>(),
  );
  useEffect(() => {
    const requests = pending.current;
    worker.current = new Worker(new URL("./routing.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current.onmessage = (event) => {
      const request = pending.current.get(event.data.id);
      if (!request) return;
      pending.current.delete(event.data.id);
      if (event.data.error) request.reject(new Error(event.data.error));
      else request.resolve(event.data.routes);
    };
    worker.current.onerror = () => {
      pending.current.forEach((p) =>
        p.reject(new Error("Routing stopped unexpectedly. Reload the app to retry.")),
      );
      pending.current.clear();
    };
    const instance = worker.current;
    return () => {
      instance.terminate();
      requests.forEach((p) => p.reject(new Error("Routing cancelled")));
      requests.clear();
    };
  }, []);
  return useCallback(
    (data: CampusData, origin: Position | string, destination: string) =>
      new Promise<Route[]>((resolve, reject) => {
        if (!worker.current) {
          reject(new Error("Routing is starting. Please try again."));
          return;
        }
        const id = ++counter.current;
        pending.current.set(id, { resolve, reject });
        worker.current.postMessage({ id, data, origin, destination });
      }),
    [],
  );
}
