import { lazy } from 'react';
export const PhotoModelWorkspace = lazy(() => import('./PhotoModelWorkspace'));

export type BuildingMode = 'appearance' | 'outline' | 'roof';
