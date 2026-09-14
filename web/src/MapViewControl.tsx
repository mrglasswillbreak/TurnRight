import { type ReactNode } from 'react';
export { useSimple3D } from './MapRenderingSettings';
import './map-view-control.css';

export function MapViewControl({
  threeD,
  simple,
  onView,
  onSimple,
  children,
}: {
  threeD: boolean;
  simple: boolean;
  onView: (value: boolean) => void;
  onSimple: (value: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <fieldset
      className="map-view-control editor-view-toggle"
      aria-label="Map view"
    >
      <button
        type="button"
        aria-pressed={!threeD}
        onClick={() => onView(false)}
      >
        2D
      </button>
      <button type="button" aria-pressed={threeD} onClick={() => onView(true)}>
        3D
      </button>
      <details className="map-rendering-options">
        <summary aria-label="3D rendering options" title="3D rendering options">
          ⌄
        </summary>
        <fieldset>
          <legend>3D rendering</legend>
          <label>
            <input
              type="radio"
              name="rendering-detail"
              checked={!simple}
              onChange={() => onSimple(false)}
            />
            Enhanced · automatic detail
          </label>
          <label>
            <input
              type="radio"
              name="rendering-detail"
              checked={simple}
              onChange={() => onSimple(true)}
            />
            Simple · building blocks
          </label>
          {children}
        </fieldset>
      </details>
    </fieldset>
  );
}
