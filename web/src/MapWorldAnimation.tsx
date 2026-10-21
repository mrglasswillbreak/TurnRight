import { lazy } from 'react';
export // Decorative controls can be unavailable on an unprepared offline visit.
const WorldAnimation = lazy(() =>
  import('./WorldAnimation').catch(() => ({ default: () => <></> })),
);
