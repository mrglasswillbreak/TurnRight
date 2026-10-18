import { Check as ActionCheck } from 'lucide-react';
import { facadeMatches, facadeReviewIssues } from './building-facades';
import { wallLength } from './model-authoring';
import { reviewModelWalls } from './model-review';
import { ModelButton } from './ModelButton';

import type { ModelCommitBindings } from './useModelCommit';
import type { ModelEditingControlsBindings } from './useModelEditingControls';
import type { ModelWorkspaceSelectionBindings } from './useModelWorkspaceSelection';
import type { ModelWorkspaceStateBindings } from './useModelWorkspaceState';

type Props = Pick<
  ModelWorkspaceStateBindings,
  | 'data'
  | 'setReviewOpen'
  | 'setDetent'
  | 'openPanel'
  | 'initial'
  | 'mode'
  | 'setMode'
  | 'setTab'
  | 'before'
  | 'setError'
  | 'reviewResult'
  | 'setReviewResult'
> &
  Pick<
    ModelWorkspaceSelectionBindings,
    | 'draft'
    | 'feature'
    | 'walls'
    | 'activeWall'
    | 'metrics'
    | 'recorded'
    | 'unsaved'
    | 'reviewReady'
    | 'publishErrors'
    | 'label'
    | 'choose'
  > &
  Pick<ModelCommitBindings, 'commit'> &
  Pick<ModelEditingControlsBindings, 'switchMode'>;
export function ModelRecoveryReview(props: Props) {
  const {
    data,
    setReviewOpen,
    setDetent,
    openPanel,
    initial,
    mode,
    setMode,
    setTab,
    before,
    setError,
    reviewResult,
    setReviewResult,
    draft,
    feature,
    walls,
    activeWall,
    metrics,
    recorded,
    unsaved,
    reviewReady,
    publishErrors,
    label,
    choose,
    commit,
    switchMode,
  } = props;
  return (
    mode === 'review' && (
      <section className="model-review" data-mobile-panel="mode">
        <h3>Model review</h3>
        <ModelButton
          variant="default"
          icon={<ActionCheck />}
          disabled={before || unsaved || !reviewReady?.reviewed.length}
          title={
            before
              ? 'Return to your changes before reviewing'
              : unsaved
                ? 'Finish or discard pending inputs before reviewing all walls'
                : !reviewReady?.reviewed.length
                  ? 'No eligible wall details need review'
                  : 'Review all eligible recorded walls in this building in one undoable action'
          }
          onClick={() => {
            const result = reviewModelWalls(draft, data);
            if (result.reviewed.length && commit(result.edit, true))
              setReviewResult(
                `Reviewed ${result.reviewed.length} wall${result.reviewed.length === 1 ? '' : 's'}.${result.blocked.length ? ` ${result.blocked.length} still need repairs or evidence.` : ''}`,
              );
          }}
        >
          Mark all as reviewed
        </ModelButton>
        {reviewResult && <output>{reviewResult}</output>}
        {!!reviewReady?.blocked.length && (
          <ul aria-label="Walls still needing attention">
            {reviewReady.blocked.map((issue) => (
              <li key={issue.wallId}>{issue.message}</li>
            ))}
          </ul>
        )}
        <p>
          Saving preserves your draft. Only walls explicitly reviewed receive
          approval.
        </p>
        <p>
          Editing details clears that wall’s previous review. “Needs review”
          does not by itself mean the model is broken. Inspect its placement and
          evidence, then mark that wall reviewed to enable a release preview.
        </p>
        {publishErrors.map((e, i) => (
          <ModelButton
            variant="outline"
            key={i}
            onClick={() => {
              const issue = facadeReviewIssues(feature).find(
                (issue) => issue.message === e,
              );
              if (issue && !walls.some((w) => w.wallId === issue.field)) {
                setError(
                  'This wall was removed or reassigned. Use its rematching controls below to choose an empty wall.',
                );
                return;
              }
              if (issue?.field && walls.some((w) => w.wallId === issue.field))
                choose(issue.field);
              switchMode(/height|floor/i.test(e) ? 'appearance' : 'details');
              if (!/height|floor/i.test(e)) {
                setReviewOpen(true);
                openPanel('more');
                setDetent('full');
              }
            }}
          >
            {e}
          </ModelButton>
        ))}
        {Object.values(draft.properties.appearance?.facades || {}).map((f) => {
          const w = walls.find((w) => w.wallId === f.wallId),
            changed =
              JSON.stringify(
                initial.current.properties.appearance?.facades?.[f.wallId],
              ) !== JSON.stringify(f);
          return (
            <article key={f.wallId}>
              <strong>
                {w?.label || 'Removed wall'}
                {changed ? ' · changed this session' : ''}
              </strong>
              <p>
                {f.confidence === 'inferred'
                  ? 'Illustrative estimate'
                  : f.confidence === 'observed'
                    ? 'Photo observed · estimated dimensions'
                    : 'Documented dimensions'}{' '}
                · {f.elements.length} records ·{' '}
                {f.reviewedAt && !f.needsReview && facadeMatches(f, feature)
                  ? 'Reviewed'
                  : 'Needs review'}
              </p>
              {changed && (
                <ul>
                  {f.elements
                    .filter(
                      (e) =>
                        JSON.stringify(
                          initial.current.properties.appearance?.facades?.[
                            f.wallId
                          ]?.elements.find((old) => old.id === e.id),
                        ) !== JSON.stringify(e),
                    )
                    .map((e) => (
                      <li key={e.id}>
                        {label(e)} ·{' '}
                        {initial.current.properties.appearance?.facades?.[
                          f.wallId
                        ]?.elements.some((old) => old.id === e.id)
                          ? 'modified'
                          : 'added'}
                      </li>
                    ))}
                  {(
                    initial.current.properties.appearance?.facades?.[f.wallId]
                      ?.elements || []
                  )
                    .filter((e) => !f.elements.some((next) => next.id === e.id))
                    .map((e) => (
                      <li key={e.id}>{label(e)} · removed</li>
                    ))}
                </ul>
              )}
              <ModelButton
                variant="outline"
                onClick={() => {
                  choose(w?.wallId || activeWall);
                  setMode('details');
                  setReviewOpen(true);
                  openPanel('more');
                  setDetent('full');
                  setTab((view) => (view === 'surface' ? view : 'surface'));
                }}
              >
                Inspect details and evidence
              </ModelButton>
              {!w && metrics && (
                <ModelButton
                  variant="outline"
                  onClick={() => {
                    if (recorded) {
                      setError(
                        'The selected wall already has details. Choose an empty wall before rematching.',
                      );
                      return;
                    }
                    const oldLength = wallLength(f.wallCoordinates),
                      next = {
                        ...f,
                        wallId: activeWall,
                        partId: metrics.partId,
                        wallCoordinates: metrics.coordinates,
                        elements: f.elements.map((e) => ({
                          ...e,
                          x: (e.x * oldLength) / metrics.length,
                          spacing: (e.spacing * oldLength) / metrics.length,
                        })),
                        needsReview: true,
                        reviewedAt: undefined,
                      };
                    const facades = {
                      ...draft.properties.appearance?.facades,
                    };
                    delete facades[f.wallId];
                    facades[activeWall] = next;
                    commit({
                      ...draft,
                      properties: {
                        ...draft.properties,
                        appearance: {
                          ...draft.properties.appearance,
                          facades,
                        },
                      },
                    });
                  }}
                >
                  Rematch to selected empty wall
                </ModelButton>
              )}
            </article>
          );
        })}
        {!Object.keys(draft.properties.appearance?.facades || {}).length && (
          <p>No custom wall details yet.</p>
        )}
      </section>
    )
  );
}
