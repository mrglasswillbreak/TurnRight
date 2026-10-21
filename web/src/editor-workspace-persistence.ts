import { validateEdit } from './editor-model';
import {
  editKey,
  editContent,
  type WorkspaceRecovery,
  recoveryMessage,
} from './editor-workspace-contract';
import type { EditorWorkspace } from './editor-workspace-controller';
export function persistNowEditorWorkspace(
  this: EditorWorkspace,
): Promise<void> {
  const snapshot: WorkspaceRecovery = {
    modelInputs: this.modelInputs,
    edits: this.edits,
    unfinished: this.unfinished,
    roofDraft: this.roofDraft,
    saved: this.saved,
    pending: this.pending,
    past: [...this.past],
    future: [...this.future],
    conflictBase: this.conflictBase,
    featureBases: [...this.featureBases],
  };
  const previous = this.recoverySnapshot;
  const sameList = (a: unknown[], b: unknown[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);
  if (
    previous &&
    !this.recoveryFailed &&
    Object.keys(snapshot).every((key) => {
      const a = snapshot[key as keyof WorkspaceRecovery],
        b = previous[key as keyof WorkspaceRecovery];
      return Array.isArray(a) && Array.isArray(b) ? sameList(a, b) : a === b;
    })
  )
    return this.persistence;
  this.recoverySnapshot = snapshot;
  this.queuedRecovery = snapshot;
  if (this.writingRecovery) return this.persistence;
  this.writingRecovery = true;
  this.persistence = Promise.resolve()
    .then(async () => {
      while (this.queuedRecovery) {
        const next = this.queuedRecovery;
        this.queuedRecovery = undefined;
        try {
          await this.persist(next);
          this.recoveryFailed = false;
        } catch {
          this.recoverySnapshot = undefined;
          this.recoveryFailed = true;
          if (this.status !== 'Conflict') this.status = 'Recovery unavailable';
          if (!this.error) this.error = recoveryMessage;
          this.notify();
        }
      }
    })
    .finally(() => {
      this.writingRecovery = false;
    });
  return this.persistence;
}

export async function saveLoopEditorWorkspace(
  this: EditorWorkspace,
): Promise<boolean> {
  try {
    while (this.pending || this.changes().length) {
      if (!this.pending) {
        const changes = this.changes();
        const errors = changes.flatMap((edit) =>
          validateEdit(edit, this.mappingArea).map(
            (message) =>
              `${edit.properties.name || edit.id} (${edit.kind}): ${message}`,
          ),
        );
        if (errors.length) {
          this.status = 'Saved locally';
          this.error = errors[0];
          this.notify();
          return false;
        }
        const saved = new Map(this.saved.map((e) => [editKey(e), e]));
        this.pending = {
          layerManagementVersion: 1,
          modelAuthoringVersion: 1,
          modelDocumentVersion: 1,
          operationId: crypto.randomUUID(),
          edits: changes.map((edit) => ({
            edit: structuredClone(edit),
            expectedUpdatedAt: saved.get(editKey(edit))?.updated_at || null,
          })),
        };
        await this.persistNow();
      }
      this.status = 'Saving';
      this.error = '';
      this.errorStatus = 0;
      this.notify();
      const batch = this.pending;
      const result = await this.send(batch);
      const saved = new Map(this.saved.map((e) => [editKey(e), e]));
      result.forEach((e) => saved.set(editKey(e), e));
      this.saved = [...saved.values()];
      this.edits = this.edits.map((e) => {
        const sent = batch.edits.find((p) => editKey(p.edit) === editKey(e));
        return sent && editContent(sent.edit) === editContent(e)
          ? saved.get(editKey(e)) || e
          : e;
      });
      this.pending = null;
      await this.persistNow();
    }
    this.status = this.recoveryFailed
      ? 'Recovery unavailable'
      : this.unfinished || this.roofDraft
        ? 'Saved locally'
        : 'Saved';
    this.error = this.recoveryFailed ? recoveryMessage : '';
    this.notify();
    return true;
  } catch (error) {
    this.errorStatus = (error as { status?: number }).status || 0;
    this.status =
      (error as { status?: number }).status === 409
        ? 'Conflict'
        : 'Saved locally';
    this.error =
      error instanceof Error
        ? error.message
        : 'Draft could not be saved. Retry when connected.';
    await this.persistNow();
    this.notify();
    return false;
  }
}

export function recoveryCopyEditorWorkspace(
  this: EditorWorkspace,
): WorkspaceRecovery {
  return structuredClone({
    modelInputs: this.modelInputs,
    edits: this.edits,
    unfinished: this.unfinished,
    roofDraft: this.roofDraft,
    saved: this.saved,
    pending: this.pending,
    past: this.past,
    future: this.future,
    conflictBase: this.conflictBase,
    featureBases: this.featureBases,
  });
}

export function localBackupEditorWorkspace(
  this: EditorWorkspace,
  baselineVersion: string,
): {
  format: string;
  schemaVersion: number;
  exportedAt: string;
  baselineVersion: string;
  workspace: WorkspaceRecovery;
} {
  return {
    format: 'turnright-editor-recovery',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    baselineVersion,
    workspace: this.recoveryCopy(),
  };
}
