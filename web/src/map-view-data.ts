import type { Route } from './types';
import type { FeatureCollection } from 'geojson';
export const empty: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export const noRoutes: Route[] = [];
