import {
  VISITOR_GROUPS,
  ALL_VISITOR_LAYERS,
  type VisitorLayers,
} from './visitor-layers';
import './visitor-layers.css';
export default function VisitorLayerControls({
  value,
  onChange,
  illustrative,
}: {
  value: VisitorLayers;
  onChange: (value: VisitorLayers) => void;
  illustrative: boolean;
}) {
  return (
    <details className="visitor-layers">
      <summary>Map layers</summary>
      <fieldset>
        <legend>Campus detail</legend>
        {VISITOR_GROUPS.map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
            />
            {key[0].toUpperCase() + key.slice(1)}
          </label>
        ))}
        <button onClick={() => onChange({ ...ALL_VISITOR_LAYERS })}>
          Show all
        </button>
        {illustrative && (
          <small>
            Trees and generic architectural details are illustrative. Open
            building details for recorded evidence.
          </small>
        )}
      </fieldset>
    </details>
  );
}
