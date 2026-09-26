export const globeRotationSpeed = (zoom: number) =>
  1.5 * Math.max(0, Math.min(1, (5 - zoom) / 2));
export const cloudOpacity = (zoom: number) =>
  0.42 * Math.max(0, Math.min(1, (6 - zoom) / 2));
export function mayRotateGlobe(state: {
  enabled: boolean;
  blocked: boolean;
  hidden: boolean;
  moving: boolean;
  lastInteraction: number;
  now: number;
  zoom: number;
}) {
  return (
    state.enabled &&
    !state.blocked &&
    !state.hidden &&
    !state.moving &&
    state.now - state.lastInteraction >= 8000 &&
    globeRotationSpeed(state.zoom) > 0
  );
}
