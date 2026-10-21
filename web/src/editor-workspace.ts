import { EditorWorkspace as Controller } from './editor-workspace-controller';
export {
  editKey,
  editContent,
  type UnfinishedDrawing,
  type WorkspaceSnapshot,
  type SaveBatch,
  type WorkspaceRecovery,
  type SaveStatus,
} from './editor-workspace-contract';
export type EditorWorkspace = Pick<
  Controller,
  | 'modelInputs'
  | 'edits'
  | 'unfinished'
  | 'roofDraft'
  | 'saved'
  | 'pending'
  | 'past'
  | 'future'
  | 'status'
  | 'error'
  | 'errorStatus'
  | 'revision'
  | 'setSourceBaseline'
  | 'releaseDatasetFeatures'
  | 'includeServerFeature'
  | 'subscribe'
  | 'getRevision'
  | 'recoveryCopy'
  | 'localBackup'
  | 'endHistoryGroup'
  | 'preserveRecovery'
  | 'prepareUpdate'
  | 'canReloadForUpdate'
  | 'dirty'
  | 'needsLeaveWarning'
  | 'canAutosave'
  | 'commit'
  | 'draft'
  | 'recoverModelInput'
  | 'draftRoof'
  | 'applyRoof'
  | 'undo'
  | 'redo'
  | 'reviewConflicts'
  | 'reconcile'
  | 'flush'
> & {};
export const EditorWorkspace: new (
  ...args: ConstructorParameters<typeof Controller>
) => EditorWorkspace = Controller;
