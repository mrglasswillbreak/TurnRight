import type { FeatureCollection } from 'geojson';

const cache = new WeakMap<FeatureCollection, FeatureCollection>();
/** Build derived road geometry off the UI thread; source routes remain intact. */
export function requestRoadDisplay(
  map: FeatureCollection,
  receive: (value: FeatureCollection) => void,
) {
  const known = cache.get(map);
  if (known) {
    receive(known);
    return () => {};
  }
  let stopped = false;
  let worker: Worker | undefined;
  const deliver = (value: FeatureCollection) => {
    if (stopped) return;
    cache.set(map, value);
    receive(value);
    worker?.terminate();
  };
  const fallback = () =>
    void import('./road-surfaces')
      .then(({ exposedRoads }) => {
        if (!stopped) deliver(exposedRoads(map));
      })
      .catch(() => {
        // An unloading page can reject both the worker and its dynamic import.
        // Retain original display lines if the optional renderer is unavailable.
        if (!stopped)
          receive({
            type: 'FeatureCollection',
            features: map.features.filter((f) => f.properties?.kind === 'path'),
          });
      });
  const stop = () => {
    stopped = true;
    worker?.terminate();
  };
  try {
    worker = new Worker(new URL('./road-surfaces.worker.ts', import.meta.url), {
      type: 'module',
    });
  } catch {
    // WebKit can synchronously refuse a worker while its document unloads.
    fallback();
    return stop;
  }
  worker.onmessage = (event: MessageEvent<FeatureCollection>) =>
    deliver(event.data);
  worker.onerror = (event) => {
    event.preventDefault();
    worker?.terminate();
    // Retain correct geometry on browsers where a worker cannot start.
    fallback();
  };
  worker.postMessage({
    type: 'FeatureCollection',
    features: map.features.filter(
      (f) =>
        f.properties?.kind === 'path' ||
        (f.properties?.kind === 'land' &&
          ['road', 'sidewalk', 'parking'].includes(f.properties.landClass)),
    ),
  });
  return stop;
}
