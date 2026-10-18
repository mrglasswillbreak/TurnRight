import { useRef } from 'react';
import { campusFacadeReviewIssues } from './building-facades';
import { downloadJson } from './download-json';
import { api } from './supabase';

import type { EditorSessionStateBindings } from './useEditorSessionState';
type Inputs = Pick<
  EditorSessionStateBindings,
  | 'refresh'
  | 'workspace'
  | 'setTaskError'
  | 'failTask'
  | 'setMessage'
  | 'setBusy'
  | 'base'
  | 'validation'
>;
export function useEditorSynchronization({
  refresh,
  workspace,
  setTaskError,
  failTask,
  setMessage,
  setBusy,
  base,
  validation,
}: Inputs) {
  const uncertainAction = useRef(false);
  const action = async (name: string, payload: unknown, success: string) => {
    setBusy(true);
    setTaskError(null);
    workspace.endHistoryGroup();
    let submitted = false;
    try {
      if (
        workspace.roofDraft &&
        ['prepare-release', 'publish-release'].includes(name)
      )
        throw new Error(
          'Apply or cancel the unfinished roof before preparing or publishing a release.',
        );
      if (uncertainAction.current) {
        workspace.reconcile(await refresh(), true);
        uncertainAction.current = false;
        setMessage(
          'Status checked. Review the result before requesting the action again.',
        );
        return false;
      }
      if (!(await workspace.flush()))
        throw new Error(workspace.error || 'Save or repair the draft first.');
      if (name === 'prepare-release') {
        const check = await validation.check(workspace.saved);
        if (workspace.unfinished || workspace.roofDraft || check.errors.length)
          throw new Error(
            check.errors[0] ||
              'Apply or cancel unfinished drawing and roof work before preparing a release.',
          );
        const modelReviews = campusFacadeReviewIssues(check.data);
        if (modelReviews.length)
          throw new Error(modelReviews.map((i) => i.message).join('\n'));
      }
      submitted = true;
      await api(name, payload);
      workspace.reconcile(await refresh(), true);
      setMessage(success);
      return true;
    } catch (e) {
      if (submitted) uncertainAction.current = true;
      failTask(e, 'Check action status', async () => {
        try {
          workspace.reconcile(await refresh(), true);
          uncertainAction.current = false;
          setTaskError(null);
          setMessage(
            'Status refreshed. Review the result before requesting the action again.',
          );
        } catch (next) {
          failTask(next, 'Check action status', () => {
            void refreshWorkspace();
          });
        }
      });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const exportBackup = async () => {
    try {
      const server = await api('export');
      downloadJson(
        `turnright-backup-${new Date().toISOString().slice(0, 10)}.json`,
        {
          ...workspace.localBackup(base.version),
          server,
          local: workspace.edits,
          unfinished: workspace.unfinished,
        },
      );
      setTaskError(null);
    } catch (e) {
      failTask(e, 'Retry export', exportBackup);
    }
  };
  const localRecovery = () => {
    try {
      downloadJson(
        'turnright-local-recovery.json',
        workspace.localBackup(base.version),
      );
    } catch (e) {
      failTask(e, 'Retry local recovery download', localRecovery);
    }
  };
  const refreshWorkspace = async () => {
    try {
      if (!(await workspace.flush())) return;
      workspace.reconcile(await refresh(), true);
      setTaskError(null);
    } catch (e) {
      failTask(e, 'Retry refresh', refreshWorkspace);
    }
  };
  return { action, exportBackup, localRecovery, refreshWorkspace };
}
export type EditorSynchronizationBindings = ReturnType<
  typeof useEditorSynchronization
>;
