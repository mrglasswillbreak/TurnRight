import { useCallback, useEffect, useRef, useState } from 'react';
import type { GpsFix } from './types';
export function useGps() {
 const [fix, setFix] = useState<GpsFix | null>(null), [error, setError] = useState(''), [tracking, setTracking] = useState(false);
 const watch = useRef<number | null>(null), desired = useRef(false);
 const clear = useCallback(() => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); watch.current = null; }, []);
 const start = useCallback(() => {
  desired.current = true; setError(''); setTracking(true);
  if (!navigator.geolocation) { setError('Location is not supported by this browser. Choose a starting place to preview directions.'); setTracking(false); return; }
  if (watch.current !== null || document.hidden) return;
  watch.current = navigator.geolocation.watchPosition(position => {
   setError(''); setFix({ coordinates: [position.coords.longitude, position.coords.latitude], accuracy: position.coords.accuracy, timestamp: position.timestamp, heading: position.coords.heading, speed: position.coords.speed });
  }, failure => { setError(failure.code === 1 ? 'Location access is off. Enable it in your browser settings, or choose a starting place.' : 'Waiting for a location signal. Try moving to an open area.'); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
 }, []);
 const stop = useCallback(() => { desired.current = false; clear(); setTracking(false); }, [clear]);
 useEffect(() => {
  const visibility = () => { if (document.hidden) clear(); else if (desired.current) start(); };
  document.addEventListener('visibilitychange', visibility);
  return () => { clear(); document.removeEventListener('visibilitychange', visibility); };
 }, [clear, start]);
 return { fix, error, tracking, start, stop };
}
