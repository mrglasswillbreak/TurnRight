import { EditorConflictReview } from './EditorConflictReview';
import { consumeEditorBuilding, editorHandoffStorage } from './editor-link';
import { editKey } from './editor-workspace';

import type { EditorRepairBindings } from './useEditorRepair';
import type { EditorSelectionBindings } from './useEditorSelection';
import type { EditorSessionStateBindings } from './useEditorSessionState';
import type { EditorSynchronizationBindings } from './useEditorSynchronization';
import type { EditorTasksBindings } from './useEditorTasks';

type Props = Pick<
  EditorSessionStateBindings,
  | 'workspace'
  | 'taskError'
  | 'setTaskError'
  | 'signIn'
  | 'conflictServer'
  | 'setConflictServer'
  | 'setReviewOverlay'
  | 'reviewConflicts'
  | 'selected'
  | 'setSelected'
  | 'tool'
  | 'buildingMode'
  | 'setBuildingMode'
  | 'setBuildingSelection'
  | 'requestedBuilding'
  | 'handoffNotice'
  | 'setHandoffNotice'
  | 'error'
  | 'setError'
  | 'busy'
  | 'controller'
  | 'selectedRef'
  | 'repairPreview'
  | 'repairErrors'
  | 'validation'
> &
  Pick<EditorSelectionBindings, 'select' | 'selectId'> &
  Pick<EditorRepairBindings, 'dismissRepair' | 'applyRepair'> &
  Pick<EditorSynchronizationBindings, 'localRecovery'> &
  Pick<EditorTasksBindings, 'resume'>;
export function EditorRecoveryPanels(props: Props) {
  const {
    workspace,
    taskError,
    setTaskError,
    signIn,
    conflictServer,
    setConflictServer,
    setReviewOverlay,
    reviewConflicts,
    selected,
    setSelected,
    tool,
    buildingMode,
    setBuildingMode,
    setBuildingSelection,
    requestedBuilding,
    handoffNotice,
    setHandoffNotice,
    error,
    setError,
    busy,
    controller,
    selectedRef,
    repairPreview,
    repairErrors,
    validation,
    select,
    selectId,
    dismissRepair,
    applyRepair,
    localRecovery,
    resume,
  } = props;
  return (
    <>
      {workspace.roofDraft &&
        (selected?.id !== workspace.roofDraft.buildingId ||
          buildingMode !== 'roof') && (
          <div className="editor-recovery editor-card">
            <strong>Unfinished roof recovered</strong>
            <button
              className="editor-primary"
              onClick={() => {
                const draft = workspace.roofDraft!;
                selectId('building', draft.buildingId, true);
                setBuildingMode('roof');
                setBuildingSelection({
                  buildingId: draft.buildingId,
                  partId: draft.partId,
                });
              }}
            >
              Resume roof
            </button>
            <button onClick={() => workspace.draftRoof(null)}>
              Discard roof
            </button>
          </div>
        )}
      {handoffNotice && (
        <div className="editor-recovery editor-card">
          <output>{handoffNotice}</output>
          <button
            onClick={() => {
              requestedBuilding.current = undefined;
              history.replaceState(
                history.state,
                '',
                consumeEditorBuilding(location.href, editorHandoffStorage()),
              );
              setHandoffNotice('');
            }}
          >
            Dismiss building request
          </button>
        </div>
      )}
      {workspace.unfinished && !tool && (
        <div className="editor-recovery editor-card">
          <strong>Unfinished drawing recovered</strong>
          <button className="editor-primary" onClick={resume}>
            Resume drawing
          </button>
          <button className="editor-text" onClick={() => workspace.draft(null)}>
            Discard drawing
          </button>
        </div>
      )}
      {repairPreview && (
        <aside
          className="editor-repair-preview editor-card"
          aria-label="Review proposed repair"
        >
          <h2>{repairPreview.title}</h2>
          <p>Red: current geometry · Green: proposed geometry</p>
          {repairPreview.batch.map((e) => (
            <p key={editKey(e)}>
              {e.kind} · {String(e.properties.name || e.id)}
              {e.kind === 'entrance' && e.properties.placeId
                ? ` · Serves ${validation.data.places.find((p) => p.id === e.properties.placeId)?.name || e.properties.placeId}`
                : ''}
            </p>
          ))}
          {repairErrors.map((message) => (
            <p className="form-error" role="alert" key={message}>
              {message}
            </p>
          ))}
          <div className="button-row">
            <button
              className="editor-primary"
              disabled={
                busy || validation.pending || !!tool || !!workspace.unfinished
              }
              onClick={applyRepair}
            >
              Apply reviewed repair
            </button>
            <button className="editor-secondary" onClick={dismissRepair}>
              Cancel repair
            </button>
          </div>
        </aside>
      )}
      {conflictServer && (
        <EditorConflictReview
          workspace={workspace}
          server={conflictServer}
          onSignIn={signIn}
          close={() => {
            setConflictServer(null);
            setReviewOverlay([]);
          }}
          resolved={() => {
            setConflictServer(null);
            setReviewOverlay([]);
            setSelected(null);
            selectedRef.current = null;
            controller.current?.select(null);
          }}
          compare={(local, remote) => {
            setReviewOverlay([
              ...[local].filter(Boolean).map((e) => ({
                type: 'Feature' as const,
                geometry: e!.geometry,
                properties: { color: '#c26ce3' },
              })),
              ...[remote].filter(Boolean).map((e) => ({
                type: 'Feature' as const,
                geometry: e!.geometry,
                properties: { color: '#26a07c' },
              })),
            ]);
            if (local || remote) select(local || remote!, true);
          }}
        />
      )}
      {(error || taskError || workspace.error) && (
        <div className="editor-error-stack">
          {error && (
            <div className="editor-card editor-error-row" role="alert">
              <span>{error}</span>
              <button className="editor-text" onClick={() => setError('')}>
                Dismiss message
              </button>
            </div>
          )}
          {taskError && (
            <div className="editor-card editor-error-row" role="alert">
              <span>{taskError.message}</span>
              <button
                className="editor-secondary"
                onClick={() => {
                  if (taskError.auth) signIn();
                  else taskError.retry();
                }}
              >
                {taskError.auth ? 'Sign in again' : taskError.label}
              </button>
              <button
                className="editor-text"
                onClick={() => setTaskError(null)}
              >
                Dismiss action error
              </button>
            </div>
          )}
          {workspace.error && (
            <div className="editor-card editor-error-row" role="alert">
              <span>{workspace.error}</span>
              {workspace.status === 'Conflict' ? (
                <button className="editor-secondary" onClick={reviewConflicts}>
                  Review conflicts
                </button>
              ) : (
                <button
                  className="editor-secondary"
                  onClick={async () => {
                    if ([401, 403].includes(workspace.errorStatus))
                      await signIn();
                    else {
                      if (
                        workspace.status === 'Recovery unavailable' &&
                        !(await workspace.preserveRecovery())
                      )
                        return;
                      await workspace.flush();
                    }
                  }}
                >
                  {[401, 403].includes(workspace.errorStatus)
                    ? 'Sign in again'
                    : workspace.status === 'Recovery unavailable'
                      ? 'Retry local recovery'
                      : 'Retry save'}
                </button>
              )}
              <button className="editor-text" onClick={localRecovery}>
                Download local recovery
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
