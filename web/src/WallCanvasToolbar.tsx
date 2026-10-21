import { RotateCcw as ActionRotateCcw } from 'lucide-react';
import { ModelButton } from './ModelButton';
import type { WallCanvasState } from './useWallCanvas';

export function WallCanvasToolbar({ state }: { state: WallCanvasState }) {
  const {
    curve,
    section,
    cancel,
    setSection,
    mobile,
    pan,
    setPan,
    zoom,
    fit,
    setView,
    m,
  } = state;

  return (
    <div className="model-toolbar">
      {curve && (
        <label>
          Curve section
          <select
            aria-label="Curve section"
            value={section}
            onChange={(e) => {
              cancel();
              setSection(Number(e.target.value));
            }}
          >
            {curve.distances.slice(0, -1).map((d, i) => (
              <option key={i} value={i}>
                {d.toFixed(1)}–{curve.distances[i + 1].toFixed(1)} m
              </option>
            ))}
          </select>
        </label>
      )}
      {!mobile.compact && (
        <ModelButton
          variant="outline"
          aria-pressed={pan}
          onClick={() => setPan((v) => !v)}
        >
          Pan
        </ModelButton>
      )}
      <ModelButton variant="outline" onClick={() => zoom(0.8)}>
        Zoom in
      </ModelButton>
      <ModelButton variant="outline" onClick={() => zoom(1.25)}>
        Zoom out
      </ModelButton>
      <ModelButton variant="outline" onClick={fit}>
        Fit selection
      </ModelButton>
      <ModelButton
        variant="outline"
        icon={<ActionRotateCcw />}
        onClick={() =>
          setView({
            x: -1,
            y: -m.eaves - 1,
            width: m.length + 2,
            height: m.eaves + 2,
          })
        }
      >
        Reset view
      </ModelButton>
    </div>
  );
}
