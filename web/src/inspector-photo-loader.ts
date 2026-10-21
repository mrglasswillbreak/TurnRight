import { lazy } from 'react';
export const PhotoManager = lazy(() =>
  import('./PhotoManager').then((m) => ({ default: m.PhotoManager })),
);
