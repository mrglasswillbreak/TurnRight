/// <reference lib="webworker" />
import { findRoutes } from './routing';
import type { CampusData } from './types';
import type { RouteRequest } from './useRoutes';
import type { RevisionRequest } from './revision-worker';
let data: CampusData | undefined;
let revision = 0;
self.onmessage = (
  event: MessageEvent<RevisionRequest<CampusData, RouteRequest>>,
) => {
  const message = event.data;
  if (message.type === 'init') {
    data = message.data;
    revision = message.revision;
    return;
  }
  const { id, payload } = message;
  try {
    if (!data || message.revision !== revision)
      throw new Error('Routing needs the current campus map.');
    self.postMessage({
      id,
      revision,
      result: findRoutes(data, payload.origin, payload.destination),
    });
  } catch (error) {
    self.postMessage({
      id,
      revision: message.revision,
      error:
        error instanceof Error ? error.message : 'Could not calculate route',
    });
  }
};
