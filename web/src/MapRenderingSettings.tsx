import { useEffect, useId, useState } from 'react';
import './map-rendering-settings.css';

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

export function MapRenderingSettings({
  simple,
  onSimple,
}: {
  simple: boolean;
  onSimple: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <fieldset className="rendering-settings" aria-describedby={`${id}-help`}>
      <legend>3D rendering</legend>
      {[
        [
          false,
          'Enhanced',
          'Architectural detail with automatic performance adjustments.',
        ],
        [true, 'Simple', 'Basic building blocks.'],
      ].map(([value, label, description]) => (
        <label key={String(value)}>
          <input
            type="radio"
            name={`${id}-rendering`}
            aria-label={String(label)}
            checked={simple === value}
            onChange={() => onSimple(value as boolean)}
          />
          <span>
            <strong>{label}</strong>
            <small>{description}</small>
          </span>
        </label>
      ))}
      <p id={`${id}-help`}>
        Enhanced is the default. Your choice applies to 3D in both the campus
        map and editor.
      </p>
    </fieldset>
  );
}
