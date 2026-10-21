import { Plus as ActionPlus, Trash2 as ActionTrash2 } from 'lucide-react';
import { ModelButton } from './ModelButton';
import { ModelField } from './ModelField';
import type { Position } from './types';
import type { RoofPlanState } from './useRoofPlan';

export function RoofControlPoints({
  state: viewState,
}: {
  state: RoofPlanState;
}) {
  const {
    draft,
    selected,
    pick,
    roof,
    west,
    east,
    south,
    north,
    add,
    active,
    autoSave,
    edit,
    workspace,
    partId,
    height,
    patch,
    update,
    setSelected,
    setFrom,
    error,
    apply,
    onDraft,
  } = viewState;

  return (
    <>
      {draft && (
        <>
          <label className="field-label">
            Control point
            <select value={selected} onChange={(e) => pick(e.target.value)}>
              <option value="">Select a control point</option>
              {roof.points.map((p, i) => (
                <option key={p.id} value={p.id}>
                  Point {i + 1} · {p.elevation} m
                  {p.vertexId ? ' · attached to outline' : ''}
                </option>
              ))}
            </select>
          </label>
          <ModelButton
            variant="default"
            icon={<ActionPlus />}
            onClick={() => {
              const c: Position = [(west + east) / 2, (south + north) / 2];
              add(c);
            }}
          >
            Add point with coordinates
          </ModelButton>
          {active && (
            <>
              {autoSave ? (
                <>
                  <ModelField
                    label="Point elevation (m)"
                    value={active.elevation}
                    disabled={!!active.vertexId}
                    buildingId={edit.id}
                    workspace={workspace}
                    field={`roof:${partId}:${active.id}:elevation`}
                    min={0.1}
                    max={height}
                    onCommit={(v) => {
                      patch({ elevation: Number(v) });
                      return true;
                    }}
                  />
                  {(['Longitude', 'Latitude'] as const).map((label, i) => (
                    <ModelField
                      key={`${active.id}:${i}`}
                      label={label}
                      value={active.coordinates[i]}
                      disabled={!!active.vertexId}
                      buildingId={edit.id}
                      workspace={workspace}
                      field={`roof:${partId}:${active.id}:${i}`}
                      step={0.000001}
                      onCommit={(v) => {
                        const coordinates = [...active.coordinates] as Position;
                        coordinates[i] = Number(v);
                        patch({ coordinates });
                        return true;
                      }}
                    />
                  ))}
                </>
              ) : (
                <>
                  {' '}
                  <label className="field-label">
                    Point elevation (m)
                    <input
                      type="number"
                      disabled={!!active.vertexId}
                      min={0.1}
                      max={height}
                      step={0.1}
                      value={active.elevation}
                      onChange={(e) =>
                        patch({ elevation: Number(e.target.value) })
                      }
                    />
                  </label>
                  {(['Longitude', 'Latitude'] as const).map((name, i) => (
                    <label className="field-label" key={name}>
                      {name}
                      <input
                        type="number"
                        step="0.000001"
                        disabled={!!active.vertexId}
                        value={active.coordinates[i]}
                        onChange={(e) => {
                          const coordinates = [
                            ...active.coordinates,
                          ] as Position;
                          coordinates[i] = Number(e.target.value);
                          patch({ coordinates });
                        }}
                      />
                    </label>
                  ))}
                </>
              )}
              {active.vertexId && (
                <ModelButton
                  variant="outline"
                  onClick={() => patch({ vertexId: undefined })}
                >
                  Detach from outline vertex
                </ModelButton>
              )}
              <ModelButton
                variant="destructive"
                icon={<ActionTrash2 />}
                onClick={() => {
                  update({
                    ...roof,
                    points: roof.points.filter((p) => p.id !== selected),
                    lines: roof.lines.filter(
                      (l) => l.from !== selected && l.to !== selected,
                    ),
                  });
                  setSelected('');
                  setFrom('');
                }}
              >
                Remove selected point and its lines
              </ModelButton>
            </>
          )}
          <ul className="roof-line-list">
            {roof.lines.map((l, i) => (
              <li key={l.id}>
                {l.kind} {i + 1}
                <ModelButton
                  variant="destructive"
                  icon={<ActionTrash2 />}
                  aria-label={`Remove ${l.kind} ${i + 1}`}
                  onClick={() =>
                    update({
                      ...roof,
                      lines: roof.lines.filter((line) => line.id !== l.id),
                    })
                  }
                >
                  Remove
                </ModelButton>
              </li>
            ))}
          </ul>
          <div className="roof-apply">
            <ModelButton
              variant="outline"
              className="editor-primary"
              disabled={!!error}
              onClick={() => apply()}
            >
              {autoSave ? 'Save valid roof' : 'Apply roof'}
            </ModelButton>
            <ModelButton
              variant="outline"
              onClick={() => {
                onDraft(null);
                setFrom('');
                setSelected('');
              }}
            >
              {autoSave ? 'Done editing roof' : 'Cancel roof'}
            </ModelButton>
          </div>
          <p className="small-note">
            {autoSave
              ? 'Completed valid actions save to the draft. Incomplete plans remain in local recovery.'
              : 'This unfinished plan is saved in local recovery. Apply commits it as one undo step.'}
          </p>
        </>
      )}
    </>
  );
}
