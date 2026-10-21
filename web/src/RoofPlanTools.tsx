import { Check as ActionCheck } from 'lucide-react';
import { ModelButton } from './ModelButton';
import { ModelField } from './ModelField';
import { proposeHipRoof } from './roof-proposal';
import type { RoofPlanState } from './useRoofPlan';

export function RoofPlanTools({ state: viewState }: { state: RoofPlanState }) {
  const {
    draft,
    editButton,
    start,
    existing,
    update,
    polygon,
    height,
    setProposalError,
    proposalError,
    edit,
    partId,
    onApply,
    selectTool,
    tool,
    setTool,
    setFrom,
    mobile,
    from,
    autoSave,
    roof,
    workspace,
  } = viewState;

  return (
    <>
      {!draft ? (
        <>
          <ModelButton
            variant="outline"
            ref={editButton}
            className="editor-primary"
            onClick={start}
          >
            {existing ? 'Edit custom roof' : 'Create custom roof'}
          </ModelButton>
          {!existing && (
            <ModelButton
              variant="outline"
              className="editor-secondary"
              onClick={() => {
                try {
                  update(proposeHipRoof(polygon, height));
                  setProposalError('');
                } catch (e) {
                  setProposalError((e as Error).message);
                }
              }}
            >
              Preview approximate hip roof
            </ModelButton>
          )}
          {proposalError && (
            <p className="form-error" role="alert">
              {proposalError}
            </p>
          )}
          {existing && (
            <ModelButton
              variant="outline"
              icon={<ActionCheck />}
              onClick={() => {
                const appearance = structuredClone(edit.properties.appearance!);
                delete appearance.roofs?.[partId];
                onApply({
                  ...edit,
                  properties: { ...edit.properties, appearance },
                });
              }}
            >
              Use standard roof
            </ModelButton>
          )}
        </>
      ) : (
        <>
          <fieldset className="roof-tools" aria-label="Roof drawing tools">
            {(['select', 'point', 'ridge', 'valley'] as const).map((t) => (
              <ModelButton
                variant="outline"
                key={t}
                ref={t === 'select' ? selectTool : undefined}
                aria-pressed={tool === t}
                onClick={() => {
                  setTool(t);
                  setFrom('');
                  if (mobile.compact) {
                    mobile.openPanel('none');
                    mobile.setTool('select');
                  }
                }}
              >
                {t === 'select'
                  ? mobile.compact
                    ? 'Select point'
                    : 'Select / move'
                  : t === 'point'
                    ? 'Add point'
                    : `Draw ${t}`}
              </ModelButton>
            ))}
          </fieldset>
          <output className="small-note">
            {from
              ? 'Choose the second endpoint.'
              : tool === 'select'
                ? 'Select a point to move it, or a surface to read its slope.'
                : tool === 'point'
                  ? 'Tap the plan to add a control point.'
                  : 'Tap two points to draw a roof line.'}
          </output>
          {autoSave ? (
            <ModelField
              label="Eaves elevation (m)"
              value={roof.eaves}
              buildingId={edit.id}
              workspace={workspace}
              field={`roof:${partId}:eaves`}
              min={0.1}
              max={height}
              step={0.1}
              onCommit={(value) => {
                const eaves = Number(value);
                update({
                  ...roof,
                  eaves,
                  points: roof.points.map((p) =>
                    p.vertexId ? { ...p, elevation: eaves } : p,
                  ),
                });
                return true;
              }}
            />
          ) : (
            <label className="field-label">
              Eaves elevation (m)
              <input
                type="number"
                min={0.1}
                max={height}
                step={0.1}
                value={roof.eaves}
                onChange={(e) => {
                  const eaves = Number(e.target.value);
                  update({
                    ...roof,
                    eaves,
                    points: roof.points.map((p) =>
                      p.vertexId ? { ...p, elevation: eaves } : p,
                    ),
                  });
                }}
              />
            </label>
          )}
        </>
      )}
    </>
  );
}
