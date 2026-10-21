import { requestedCampus } from './campus-context';
import { EnrichmentReview } from './EnrichmentReview';
import { BuildingReferenceReview } from './BuildingReferenceReview';
import { BuildingPhotoReview } from './BuildingPhotoReview';
import { BuildingRoofReview } from './BuildingRoofReview';
import type { EditorReviewState } from './useEditorReview';

export function EditorEvidenceReview({
  state: viewState,
}: {
  state: EditorReviewState;
}) {
  const {
    tab,
    mapRef,
    validation,
    workspace,
    busy,
    onApplyAppearances,
    onLocateBuilding,
  } = viewState;

  return (
    <>
      {tab === 'changes' && (
        <>
          <h2>Campus evidence</h2>
          {requestedCampus() === 'lasu' && (
            <>
              <EnrichmentReview
                onLocate={(center) =>
                  mapRef.current?.flyTo({ center, zoom: 19 })
                }
              />
              <BuildingRoofReview
                data={validation.data}
                duplicates={validation.duplicates}
                edits={workspace.edits}
                disabled={
                  busy ||
                  !!validation.pending ||
                  !!workspace.unfinished ||
                  !!workspace.roofDraft ||
                  workspace.status === 'Conflict'
                }
                onApply={onApplyAppearances}
                onLocate={onLocateBuilding}
              />
              <BuildingReferenceReview
                data={validation.data}
                duplicates={validation.duplicates}
                edits={workspace.edits}
                disabled={
                  busy ||
                  !!validation.pending ||
                  !!workspace.unfinished ||
                  !!workspace.roofDraft ||
                  workspace.status === 'Conflict'
                }
                onApply={onApplyAppearances}
                onLocate={onLocateBuilding}
              />
              <BuildingPhotoReview
                data={validation.data}
                edits={workspace.edits}
                disabled={
                  busy ||
                  !!validation.pending ||
                  !!workspace.unfinished ||
                  !!workspace.roofDraft ||
                  workspace.status === 'Conflict'
                }
                onApply={onApplyAppearances}
                onLocate={onLocateBuilding}
              />
            </>
          )}
        </>
      )}
    </>
  );
}
