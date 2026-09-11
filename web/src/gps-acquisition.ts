import type { GpsFix } from './types';

/** Acquisition only: callers own visibility, permission and resume policy. */
export function watchGps(onFix: (fix: GpsFix) => void, onError: (error: GeolocationPositionError) => void) {
  if (!navigator.geolocation) throw new Error('Location is unavailable in this browser.');
  const id = navigator.geolocation.watchPosition(p => onFix({
    coordinates: [p.coords.longitude, p.coords.latitude], accuracy: p.coords.accuracy,
    timestamp: p.timestamp, heading: p.coords.heading, speed: p.coords.speed,
  }), onError, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  return () => navigator.geolocation.clearWatch(id);
}
