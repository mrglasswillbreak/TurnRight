import type { FeatureCollection } from 'geojson';
self.onmessage = (event: MessageEvent<FeatureCollection>) => {
  // A reload can cancel an optional module while this worker is starting.
  // Report module/geometry failures through the existing fallback, rather than
  // leaving the caller waiting or emitting an unhandled worker rejection.
  void import('./road-surfaces')
    .then(({ exposedRoads }) => self.postMessage(exposedRoads(event.data)))
    .catch(() => self.postMessage({ error: true }));
};
