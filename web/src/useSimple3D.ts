import { useEffect, useState } from 'react';

export function useSimple3D() {
  const read = () => {
    try {
      return localStorage.getItem('turnright:simple-3d') === 'true';
    } catch {
      return false;
    }
  };
  const [simple, setSimple] = useState(read);
  useEffect(() => {
    const update = () => setSimple(read());
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);
  return [
    simple,
    (value: boolean) => {
      setSimple(value);
      try {
        localStorage.setItem('turnright:simple-3d', String(value));
      } catch {
        /* Session preference remains usable. */
      }
    },
  ] as const;
}
