import {
  Check as ActionCheck,
  RotateCcw as ActionRotateCcw,
} from 'lucide-react';
import { ModelButton } from './ModelButton';
import { polygonsOf, resetBuildingAssignments } from './building-surfaces';
import { RoofPlanEditor } from './RoofPlanEditor';
import type { BuildingAppearanceState } from './useBuildingAppearance';
import { BuildingSurfaceSettings } from './BuildingSurfaceSettings';
export function BuildingAppearanceControls({
  state,
}: {
  state: BuildingAppearanceState;
}) {
  const {
    embedded,
    locked,
    partId,
    choose,
    topology,
    part,
    mode,
    wallId,
    brokenTopology,
    orphans,
    onEdit,
    edit,
    appearance,
    workspace,
    index,
    wingHeight,
    own,
    visual,
    roofDraft,
    onRoofDraft,
    selection,
    onSelection,
    onApplyRoof,
  } = state;

  return (
    <>
      {embedded && (
        <>
          <label className="field-label">
            Building / wing
            <select
              aria-label="Building or wing"
              disabled={locked}
              value={partId || ''}
              onChange={(e) => choose(e.target.value || undefined)}
            >
              <option value="">Whole building · defaults</option>
              {topology.parts.map((p, i) => (
                <option key={p.id} value={p.id}>
                  Wing {i + 1}
                </option>
              ))}
            </select>
          </label>
          {part && mode !== 'roof' && (
            <label className="field-label">
              Wall
              <select
                aria-label="Wall"
                disabled={locked}
                value={wallId || ''}
                onChange={(e) => choose(part.id, e.target.value || undefined)}
              >
                <option value="">All walls · wing defaults</option>
                {part.rings.flatMap((r, ri) =>
                  r.wallIds.map((id, wi) => (
                    <option key={id} value={id}>
                      {ri ? `Courtyard ${ri}` : 'Outside'} wall {wi + 1}
                    </option>
                  )),
                )}
              </select>
            </label>
          )}
          {(brokenTopology || orphans) && (
            <div className="notice" role="alert">
              <p>
                {brokenTopology
                  ? 'Surface identities no longer match the outline. Review a reset before continuing.'
                  : 'Some appearance settings refer to removed surfaces.'}
              </p>
              <ModelButton
                variant="outline"
                onClick={() =>
                  onEdit(resetBuildingAssignments(edit, !brokenTopology))
                }
              >
                {brokenTopology
                  ? 'Reset surface identities and assignments'
                  : 'Reset unassigned surfaces'}
              </ModelButton>
            </div>
          )}
          {(topology.issues || []).map((issue) => (
            <div className="notice" role="alert" key={issue.id}>
              <p>{issue.message}</p>
              {issue.candidates.map((candidate, i) => (
                <ModelButton
                  variant="outline"
                  icon={<ActionCheck />}
                  key={i}
                  onClick={() => {
                    const next = structuredClone(appearance);
                    if (issue.wallId)
                      (next.walls ||= {})[issue.wallId] = candidate;
                    else {
                      (next.parts ||= {})[issue.partId] = candidate;
                      delete next.roofs?.[issue.partId];
                    }
                    onEdit({
                      ...edit,
                      properties: {
                        ...edit.properties,
                        appearance: next,
                        buildingTopology: {
                          ...topology,
                          issues: topology.issues?.filter(
                            (item) => item.id !== issue.id,
                          ),
                        },
                      },
                    });
                  }}
                >
                  Use former style {i + 1} (
                  {candidate.wallColour || 'inherited'})
                </ModelButton>
              ))}
              <ModelButton
                variant="outline"
                icon={<ActionRotateCcw />}
                onClick={() => {
                  const next = structuredClone(appearance);
                  if (issue.wallId) delete next.walls?.[issue.wallId];
                  else {
                    delete next.parts?.[issue.partId];
                    delete next.roofs?.[issue.partId];
                  }
                  onEdit({
                    ...edit,
                    properties: {
                      ...edit.properties,
                      appearance: next,
                      buildingTopology: {
                        ...topology,
                        issues: topology.issues?.filter(
                          (item) => item.id !== issue.id,
                        ),
                      },
                    },
                  });
                }}
              >
                Reset surface assignments
              </ModelButton>
            </div>
          ))}
          {mode === 'outline' ? (
            <p className="small-note">
              Move outline vertices on the map. Surface styles follow their
              walls; joining differently styled walls requires review.
            </p>
          ) : mode === 'roof' ? (
            part ? (
              <RoofPlanEditor
                autoSave={embedded}
                workspace={workspace}
                key={part.id}
                edit={edit}
                partId={part.id}
                polygon={polygonsOf(edit.geometry)[index]}
                topology={part}
                height={wingHeight}
                illustrative={
                  own.heightMode === 'unknown' ||
                  (!own.height &&
                    !own.floors &&
                    (visual.partHeights?.[index]?.kind || visual.heightKind) ===
                      'illustrative')
                }
                draft={
                  roofDraft?.buildingId === edit.id &&
                  roofDraft.partId === part.id
                    ? roofDraft
                    : null
                }
                onDraft={onRoofDraft}
                focusedSurface={selection?.roofTriangle}
                focusedText={selection?.elementId}
                onTextSelect={(elementId) =>
                  onSelection({
                    buildingId: edit.id,
                    partId: part.id,
                    role: 'roof',
                    elementId,
                  })
                }
                onSurface={(index) =>
                  onSelection({
                    buildingId: edit.id,
                    partId: part.id,
                    role: 'roof',
                    roofTriangle: index,
                  })
                }
                onApply={onApplyRoof}
              />
            ) : (
              <p className="notice">
                Choose a wing above to edit its roof plan.
              </p>
            )
          ) : (
            <BuildingSurfaceSettings state={state} />
          )}
        </>
      )}
    </>
  );
}
