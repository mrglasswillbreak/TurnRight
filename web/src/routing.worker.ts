/// <reference lib="webworker" />
import { findRoutes } from "./routing";
import type { CampusData, RouteOrigin, RouteEndpoint } from "./types";
self.onmessage = (
  event: MessageEvent<{
    id: number;
    data: CampusData;
    origin: RouteOrigin;
    destination: RouteEndpoint;
  }>,
) => {
  const { id, data, origin, destination } = event.data;
  try {
    self.postMessage({ id, routes: findRoutes(data, origin, destination) });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : "Could not calculate route",
    });
  }
};
