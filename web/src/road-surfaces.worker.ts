import { exposedRoads } from './road-surfaces';
import type { FeatureCollection } from 'geojson';
self.onmessage = (event: MessageEvent<FeatureCollection>) => {
  self.postMessage(exposedRoads(event.data));
};
