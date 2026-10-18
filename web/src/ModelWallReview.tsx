import {
  Check as ActionCheck,
  RotateCcw as ActionRotateCcw,
  Trash2 as ActionTrash2,
} from 'lucide-react';
import { facadeMatches } from './building-facades';
import { wallLength } from './model-authoring';
import { ModelButton } from './ModelButton';
import { ModelField } from './ModelField';
import type { FacadeDescription } from './visual-types';

import type { ModelCommitBindings } from './useModelCommit';
import type { ModelWorkspaceSelectionBindings } from './useModelWorkspaceSelection';
import type { ModelWorkspaceStateBindings } from './useModelWorkspaceState';

type Props = Pick<
  ModelWorkspaceStateBindings,
  'edit' | 'workspace' | 'reviewOpen' | 'setReviewOpen'
> &
  Pick<
    ModelWorkspaceSelectionBindings,
    | 'draft'
    | 'feature'
    | 'activeWall'
    | 'authoring'
    | 'facade'
    | 'photos'
    | 'photo'
  > &
  Pick<ModelCommitBindings, 'commit' | 'applyWall'> & {
    metrics: NonNullable<ModelWorkspaceSelectionBindings['metrics']>;
  };
export function ModelWallReview(props: Props) {
  const {
    edit,
    workspace,
    reviewOpen,
    setReviewOpen,
    draft,
    feature,
    activeWall,
    metrics,
    authoring,
    facade,
    photos,
    photo,
    commit,
    applyWall,
  } = props;
  return (
    facade && (
      <details
        className="model-wall-review"
        open={reviewOpen || !!facade.needsReview}
        onToggle={(e) => setReviewOpen(e.currentTarget.open)}
      >
        <summary>Evidence &amp; wall review</summary>
        <p>
          {facade.reviewedAt &&
          !facade.needsReview &&
          facadeMatches(facade, feature)
            ? 'This wall is reviewed. Another detail edit will require a fresh review.'
            : 'Review required before preview. Check this wall’s placement and evidence, then mark only this wall reviewed.'}
        </p>
        <label>
          Evidence confidence
          <select
            value={facade.confidence}
            onChange={(e) =>
              applyWall({
                ...facade,
                confidence: e.target.value as FacadeDescription['confidence'],
              })
            }
          >
            <option value="inferred">Illustrative estimate</option>
            <option value="observed">Observed in photograph</option>
            <option value="documented">Documented measurements</option>
          </select>
        </label>
        <ModelField
          type="text"
          label="Evidence and measurement provenance"
          value={facade.notes}
          buildingId={edit.id}
          field={`${activeWall}:notes`}
          workspace={workspace}
          onCommit={(v) => applyWall({ ...facade, notes: v })}
        />
        {photo && (
          <ModelButton
            variant="outline"
            icon={<ActionCheck />}
            onClick={() =>
              applyWall({
                ...facade,
                photoIds: [...new Set([...facade.photoIds, photo.id])],
              })
            }
          >
            Use selected photo as evidence
          </ModelButton>
        )}
        {facade.photoIds.map((id) => (
          <p key={id}>
            {photos.find((p) => p.id === id)?.caption || 'Unavailable photo'}{' '}
            <ModelButton
              variant="destructive"
              icon={<ActionTrash2 />}
              onClick={() =>
                applyWall({
                  ...facade,
                  photoIds: facade.photoIds.filter((p) => p !== id),
                  texture:
                    facade.texture?.photoId === id ? undefined : facade.texture,
                })
              }
            >
              Remove reference
            </ModelButton>
          </p>
        ))}
        {!facadeMatches(facade, feature) && (
          <ModelButton
            variant="outline"
            onClick={() => {
              const length = wallLength(facade.wallCoordinates);
              applyWall({
                ...facade,
                wallCoordinates: metrics.coordinates,
                partId: metrics.partId,
                needsReview: false,
                elements: facade.elements.map((e) => ({
                  ...e,
                  x: (e.x * length) / metrics.length,
                  spacing: (e.spacing * length) / metrics.length,
                })),
              });
            }}
          >
            Confirm wall match · preserve metre positions
          </ModelButton>
        )}
        <ModelButton
          variant="outline"
          icon={<ActionCheck />}
          disabled={!facadeMatches(facade, feature)}
          onClick={() =>
            applyWall({ ...facade, needsReview: false }, authoring, true)
          }
        >
          Mark this wall reviewed
        </ModelButton>
        <ModelButton
          variant="outline"
          icon={<ActionRotateCcw />}
          onClick={() => {
            const facades = {
              ...draft.properties.appearance?.facades,
            };
            delete facades[activeWall];
            commit({
              ...draft,
              properties: {
                ...draft.properties,
                modelAuthoring: {
                  ...authoring,
                  groups: authoring.groups.filter(
                    (g) => g.wallId !== activeWall,
                  ),
                  patterns: authoring.patterns.filter(
                    (p) => p.wallId !== activeWall,
                  ),
                },
                appearance: {
                  ...draft.properties.appearance,
                  facades,
                },
              },
            });
          }}
        >
          Restore generated wall
        </ModelButton>
      </details>
    )
  );
}
