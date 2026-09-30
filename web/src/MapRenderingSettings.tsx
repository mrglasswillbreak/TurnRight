import { useId } from 'react';
import './map-rendering-settings.css';

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
      {(
        [
          [
            false,
            'Enhanced',
            'Architectural detail with automatic performance adjustments.',
          ],
          [true, 'Simple', 'Basic building blocks.'],
        ] as const
      ).map(([value, label, description]) => (
        <label key={String(value)}>
          <input
            type="radio"
            name={`${id}-rendering`}
            aria-label={label}
            checked={simple === value}
            onChange={() => onSimple(value)}
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
