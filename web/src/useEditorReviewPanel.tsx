import { Suspense } from 'react';
import { editKey } from './editor-workspace';
import { EditorReview } from './editor-workspace-shared';

import type { EditorRepairBindings } from './useEditorRepair';
import type { EditorSelectionBindings } from './useEditorSelection';
import type { EditorSessionStateBindings } from './useEditorSessionState';
import type { EditorSynchronizationBindings } from './useEditorSynchronization';
type Inputs = Pick<
  EditorSessionStateBindings,
  | 'data'
  | 'state'
  | 'workspace'
  | 'setPublishedWorkspace'
  | 'drafts'
  | 'signIn'
  | 'tab'
  | 'setSelected'
  | 'tool'
  | 'preview'
  | 'setPreview'
  | 'setMessage'
  | 'setError'
  | 'busy'
  | 'setBusy'
  | 'review'
  | 'setReview'
  | 'mapRef'
  | 'selectedRef'
  | 'base'
  | 'currentBase'
  | 'validation'
> &
  Pick<EditorSelectionBindings, 'selectId'> &
  Pick<EditorRepairBindings, 'openIssue'> &
  Pick<EditorSynchronizationBindings, 'action'>;
export function useEditorReviewPanel({
  data,
  state,
  workspace,
  setPublishedWorkspace,
  drafts,
  signIn,
  tab,
  setSelected,
  tool,
  preview,
  setPreview,
  setMessage,
  setError,
  busy,
  setBusy,
  review,
  setReview,
  mapRef,
  selectedRef,
  base,
  currentBase,
  validation,
  selectId,
  openIssue,
  action,
}: Inputs) {
  const reviewPanel = (
    <Suspense fallback={<p>Opening source and release review…</p>}>
      <EditorReview
        tab={tab}
        state={state}
        onPublishedWorkspace={setPublishedWorkspace}
        draftCount={drafts.length}
        workspace={workspace}
        validation={validation}
        baselineVersion={base.version}
        publishedVersion={data.version}
        published={data}
        onIssue={openIssue}
        onSignIn={signIn}
        busy={busy}
        action={action}
        mapRef={mapRef}
        preview={preview}
        setPreview={setPreview}
        review={review}
        setReview={setReview}
        onLocateBuilding={(id) => selectId('building', id, true)}
        onApplyAppearances={async (batch) => {
          if (
            tool ||
            workspace.unfinished ||
            workspace.roofDraft ||
            workspace.status === 'Conflict'
          )
            return;
          const original = workspace.edits;
          const originalBase = currentBase.current;
          setBusy(true);
          try {
            const checked = await validation.check([
              ...original.filter(
                (e) => !batch.some((b) => editKey(b) === editKey(e)),
              ),
              ...batch,
            ]);
            if (
              workspace.edits !== original ||
              currentBase.current !== originalBase ||
              workspace.unfinished ||
              workspace.roofDraft
            )
              throw new Error(
                'The draft changed. Review the appearance batch again.',
              );
            const errors = checked.errors.filter(
              (e) => !validation.errors.includes(e),
            );
            if (!checked.usable || errors.length)
              throw new Error(
                errors.join(' ') ||
                  'The proposed appearances could not be validated.',
              );
            workspace.commit(batch);
            const current = batch.find(
              (e) =>
                e.kind === selectedRef.current?.kind &&
                e.id === selectedRef.current?.id,
            );
            if (current) {
              setSelected(current);
              selectedRef.current = current;
            }
            setMessage(
              `${batch.length} building appearances applied. Undo restores the batch. Review a release preview before publishing.`,
            );
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </Suspense>
  );
  return { reviewPanel };
}
export type EditorReviewPanelBindings = ReturnType<typeof useEditorReviewPanel>;
