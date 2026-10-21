import { useRoofPlan, type RoofPlanProps } from './useRoofPlan';
import { RoofPlanTools } from './RoofPlanTools';
import { RoofPlanDrawing } from './RoofPlanDrawing';
import { RoofControlPoints } from './RoofControlPoints';

export function RoofPlanEditor(props: RoofPlanProps) {
  const viewState = useRoofPlan(props);
  const {
    height,
    illustrative,
    textTools,
    roof,
    error,
    surface,
    setSurface,
    onSurface,
    shown,
  } = viewState;

  return (
    <section className="roof-plan" aria-label="Wing roof plan">
      <p className="small-note">
        Elevations are metres above ground; total wing height is {height} m
        {illustrative ? ' (illustrative; actual height unknown)' : ''}. Boundary
        points follow outline vertices. Courtyards remain open.
      </p>
      {textTools.properties}
      <RoofPlanTools state={viewState} />
      {roof.provenance && <p className="small-note">{roof.provenance}</p>}
      <RoofPlanDrawing state={viewState} />
      {error && (
        <p role="alert" className="notice">
          {error} Last valid roof preview is retained. Correct the plan before
          applying.
        </p>
      )}
      <label className="field-label">
        Roof surface
        <select
          aria-label="Roof surface"
          value={surface ?? ''}
          onChange={(e) => {
            const index =
              e.target.value === '' ? undefined : Number(e.target.value);
            setSurface(index ?? null);
            onSurface(index);
          }}
        >
          <option value="">Select a roof surface</option>
          {shown?.slopes.map((s, i) => (
            <option key={i} value={i}>
              Surface {i + 1} · {s.toFixed(1)}° slope
            </option>
          ))}
        </select>
      </label>
      {surface !== null && shown?.slopes[surface] !== undefined && (
        <output>
          Surface {surface + 1}: {shown.slopes[surface].toFixed(1)}° calculated
          slope
        </output>
      )}
      <RoofControlPoints state={viewState} />
    </section>
  );
}
