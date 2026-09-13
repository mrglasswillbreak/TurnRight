import { useEffect, useState } from 'react';
const key = 'turnright:map-view';
export function readMapView() {
  try {
    return localStorage.getItem(key) !== '2d';
  } catch {
    return true;
  }
}
export function useMapViewPreference() {
  const [threeD, setThreeD] = useState(readMapView);
  useEffect(() => {
    const storage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setThreeD(readMapView());
    };
    window.addEventListener('storage', storage);
    return () => window.removeEventListener('storage', storage);
  }, []);
  return [
    threeD,
    (value: boolean) => {
      setThreeD(value);
      try {
        localStorage.setItem(key, value ? '3d' : '2d');
        return true;
      } catch {
        return false;
      }
    },
  ] as const;
}
