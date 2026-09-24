import type { RoofDraft } from './visual-types';
import type { Geometry } from 'geojson';
import type { MapEdit } from './types';
import { validateEdit } from './editor-model';
import {
  canonical,
  mergeWorkspace,
  type ConflictChoices,
} from './editor-conflicts';

export const editKey = (edit: Pick<MapEdit, 'id' | 'kind'>) =>
  `${edit.kind}:${edit.id}`;
const contentCache = new WeakMap<MapEdit, string>();
export function editContent(edit: MapEdit | undefined) {
  if (!edit) return '';
  const cached = contentCache.get(edit);
  if (cached !== undefined) return cached;
  const { updated_at: _timestamp, ...content } = edit;
  const value = JSON.stringify(content);
  contentCache.set(edit, value);
  return value;
}
export interface UnfinishedDrawing {
  id: string;
  kind: MapEdit['kind'];
  geometry: Geometry;
  properties: MapEdit['properties'];
}
export interface WorkspaceSnapshot {
  edits: MapEdit[];
  unfinished: UnfinishedDrawing | null;
  roofDraft?: RoofDraft | null;
}
export interface SaveBatch {
  modelAuthoringVersion?: 1;
  operationId: string;
  edits: { edit: MapEdit; expectedUpdatedAt: string | null }[];
}
export interface WorkspaceRecovery extends WorkspaceSnapshot {
  modelInputs?: Record<string, Record<string, string>>;
  saved: MapEdit[];
  pending: SaveBatch | null;
  past: WorkspaceSnapshot[];
  future: WorkspaceSnapshot[];
  conflictBase?: MapEdit[];
  featureBases?: MapEdit[];
}
export type SaveStatus =
  | 'Saved'
  | 'Saving'
  | 'Saved locally'
  | 'Conflict'
  | 'Recovery unavailable';
const recoveryMessage =
  'Browser storage could not save a recovery copy. Keep this tab open until the draft is saved.';

/** One history entry per user command; the network never replaces newer local commands. */
export class EditorWorkspace {
  modelInputs: Record<string, Record<string, string>> = {};
  edits: MapEdit[];
  unfinished: UnfinishedDrawing | null = null;
  roofDraft: RoofDraft | null = null;
  saved: MapEdit[];
  pending: SaveBatch | null = null;
  past: WorkspaceSnapshot[] = [];
  future: WorkspaceSnapshot[] = [];
  status: SaveStatus = 'Saved';
  error = '';
  errorStatus = 0;
  revision = 0;
  private listeners = new Set<() => void>();
  private flight: Promise<boolean> | null = null;
  private persistence: Promise<void> = Promise.resolve();
  private recoveryFailed = false;
  private recoverySnapshot?: WorkspaceRecovery;
  private queuedRecovery?: WorkspaceRecovery;
  private writingRecovery = false;
  private historyGroup: string | undefined;
  private conflictBase?: MapEdit[];
  private featureBases: MapEdit[] = [];
  private sourceBaseline?: (edit: MapEdit) => MapEdit | undefined;
  setSourceBaseline(lookup?: (edit: MapEdit) => MapEdit | undefined) {
    this.sourceBaseline = lookup;
  }
  constructor(
    server: MapEdit[],
    private send: (batch: SaveBatch) => Promise<MapEdit[]>,
    private persist: (state: WorkspaceRecovery) => Promise<void>,
    recovery?: WorkspaceRecovery | null,
  ) {
    this.saved = structuredClone(server);
    this.edits = structuredClone(server);
    if (recovery) {
      this.modelInputs = recovery.modelInputs || {};
      this.conflictBase = recovery.conflictBase;
      this.featureBases = structuredClone(recovery.featureBases || []);
      this.past = recovery.past || [];
      this.future = recovery.future || [];
      this.unfinished = recovery.unfinished;
      this.roofDraft = recovery.roofDraft || null;
      this.pending = recovery.pending;
      const previous = new Map(recovery.saved.map((e) => [editKey(e), e]));
      const remote = new Map(server.map((e) => [editKey(e), e]));
      for (const local of recovery.edits) {
        const key = editKey(local),
          before = previous.get(key),
          next = remote.get(key);
        if (editContent(local) !== editContent(before)) {
          // A saved-but-unacknowledged request is retried with its original operation ID.
          if (
            editContent(next) !== editContent(before) &&
            editContent(next) !== editContent(local)
          ) {
            this.conflictBase ||= structuredClone(recovery.saved);
            if (!this.pending) this.status = 'Conflict';
          }
          remote.set(key, local);
        }
      }
      this.edits = [...remote.values()];
      if (this.status === 'Conflict' && !this.conflictBase)
        this.conflictBase = structuredClone(recovery.saved);
      if (
        this.status !== 'Conflict' &&
        (this.dirty || this.unfinished || this.roofDraft)
      )
        this.status = 'Saved locally';
      if (this.status === 'Conflict')
        this.error =
          'This draft changed in another session. Your local work is preserved.';
    }
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getRevision = () => this.revision;
  private notify() {
    this.revision++;
    this.listeners.forEach((fn) => fn());
  }
  private snapshot(): WorkspaceSnapshot {
    return {
      edits: this.edits,
      unfinished: structuredClone(this.unfinished),
      roofDraft: structuredClone(this.roofDraft),
    };
  }
  recoveryCopy(): WorkspaceRecovery {
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
  localBackup(baselineVersion: string) {
    return {
      format: 'turnright-editor-recovery',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      baselineVersion,
      workspace: this.recoveryCopy(),
    };
  }
  endHistoryGroup = () => {
    this.historyGroup = undefined;
  };
  async preserveRecovery() {
    await this.persistNow();
    return !this.recoveryFailed;
  }
  async prepareUpdate() {
    // A draft may need the new editor to repair it. Server validation must not
    // block the update, but unfinished work still requires durable recovery.
    await this.flush();
    return this.preserveRecovery();
  }
  private persistNow() {
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
            if (this.status !== 'Conflict')
              this.status = 'Recovery unavailable';
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
  get dirty() {
    return this.changes().length > 0 || !!this.pending;
  }
  get canAutosave() {
    return (
      this.dirty &&
      !['Conflict', 'Saving'].includes(this.status) &&
      (!this.error || this.error === recoveryMessage)
    );
  }
  private changes() {
    const saved = new Map(this.saved.map((e) => [editKey(e), e]));
    return this.edits.filter(
      (e) => editContent(e) !== editContent(saved.get(editKey(e))),
    );
  }
  commit(
    edits: MapEdit[],
    unfinished: UnfinishedDrawing | null = this.unfinished,
    historyGroup?: string,
  ) {
    const sameGroup = !!historyGroup && historyGroup === this.historyGroup;
    const next = new Map(this.edits.map((e) => [editKey(e), e]));
    const unchanged = edits.every(
      (e) => editContent(e) === editContent(next.get(editKey(e))),
    );
    edits.forEach((e) => next.set(editKey(e), structuredClone(e)));
    if (
      unchanged &&
      JSON.stringify(unfinished) === JSON.stringify(this.unfinished)
    )
      return;
    this.historyGroup = historyGroup;
    for (const edit of edits) {
      const key = editKey(edit);
      if (
        this.saved.some((e) => editKey(e) === key) ||
        this.edits.some((e) => editKey(e) === key)
      )
        continue;
      const original = this.sourceBaseline?.(edit);
      if (original) {
        this.featureBases = this.featureBases.filter((e) => editKey(e) !== key);
        this.featureBases.push(structuredClone(original));
      }
    }
    if (!sameGroup) this.past.push(this.snapshot());
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    this.edits = [...next.values()];
    this.unfinished = unfinished;
    this.changed();
  }
  draft(drawing: UnfinishedDrawing | null) {
    this.endHistoryGroup();
    if (JSON.stringify(drawing) === JSON.stringify(this.unfinished)) return;
    this.unfinished = drawing;
    this.changed();
  }
  recoverModelInput(buildingId: string, key: string, value?: string) {
    const inputs = { ...this.modelInputs[buildingId] };
    if (value === undefined) delete inputs[key];
    else inputs[key] = value;
    this.modelInputs = { ...this.modelInputs, [buildingId]: inputs };
    void this.persistNow();
    this.notify();
  }
  draftRoof(roof: RoofDraft | null) {
    this.endHistoryGroup();
    this.roofDraft = structuredClone(roof);
    this.changed();
  }
  applyRoof(edit: MapEdit) {
    this.roofDraft = null;
    this.commit([edit]);
    this.changed();
  }
  private changed() {
    if (this.status !== 'Conflict' && this.status !== 'Recovery unavailable') {
      this.status =
        this.dirty || this.unfinished || this.roofDraft
          ? 'Saved locally'
          : 'Saved';
      this.error = '';
    }
    void this.persistNow();
    this.notify();
  }
  private restore(snapshot: WorkspaceSnapshot) {
    const next = new Map(snapshot.edits.map((e) => [editKey(e), e]));
    // Retain a receipt for undo without confusing removal of a correction with
    // deletion of its approved source feature.
    for (const e of [
      ...this.saved,
      ...(this.pending?.edits.map((p) => p.edit) || []),
    ])
      if (!next.has(editKey(e)))
        next.set(editKey(e), {
          ...e,
          deleted: true,
          properties: { ...e.properties, revertToSource: true },
        });
    this.edits = [...next.values()];
    this.unfinished = snapshot.unfinished;
    this.roofDraft = snapshot.roofDraft || null;
    this.changed();
  }
  undo() {
    this.endHistoryGroup();
    const previous = this.past.pop();
    if (previous) {
      this.future.push(this.snapshot());
      this.restore(previous);
    }
  }
  redo() {
    this.endHistoryGroup();
    const next = this.future.pop();
    if (next) {
      this.past.push(this.snapshot());
      this.restore(next);
    }
  }
  reviewConflicts(server: MapEdit[], choices: ConflictChoices = {}) {
    const baseline = this.conflictBase || this.saved;
    const known = new Set(baseline.map(editKey));
    const local = new Set(this.edits.map(editKey));
    const remote = new Set(server.map(editKey));
    return mergeWorkspace(
      [
        ...baseline,
        ...this.featureBases.filter(
          (e) =>
            !known.has(editKey(e)) &&
            local.has(editKey(e)) &&
            remote.has(editKey(e)),
        ),
      ],
      this.edits,
      server,
      choices,
    );
  }
  reconcile(
    server: MapEdit[],
    keepLocal: boolean,
    choices: ConflictChoices = {},
  ) {
    if (this.flight)
      throw new Error(
        'A save is still running. Refresh again when it finishes.',
      );
    this.endHistoryGroup();
    const review = this.reviewConflicts(server, choices);
    const remoteChanged =
      canonical(server) !== canonical(this.saved) || !!this.conflictBase;
    if (keepLocal && review.unresolved.length) {
      this.conflictBase ||= structuredClone(this.saved);
      this.status = 'Conflict';
      this.error =
        'Review conflicting fields before saving. Your local work is preserved.';
      void this.persistNow();
      this.notify();
      return false;
    }
    this.saved = structuredClone(server);
    this.edits = structuredClone(keepLocal ? review.edits : server);
    this.conflictBase = undefined;
    this.pending = null;
    this.status = 'Saved locally';
    this.error = '';
    this.errorStatus = 0;
    // Pre-merge snapshots can contain stale remote fields. Start a new history
    // after resolution instead of letting Undo overwrite the reviewed result.
    if (remoteChanged) {
      this.past = [];
      this.future = [];
    }
    if (!keepLocal) {
      this.past = [];
      this.future = [];
      this.unfinished = null;
    }
    this.changed();
    return true;
  }
  flush(): Promise<boolean> {
    if (this.flight) return this.flight;
    if (this.status === 'Conflict') return Promise.resolve(false);
    this.flight = this.saveLoop().finally(() => {
      this.flight = null;
    });
    return this.flight;
  }
  private async saveLoop() {
    try {
      while (this.pending || this.changes().length) {
        if (!this.pending) {
          const changes = this.changes();
          const errors = changes.flatMap((edit) =>
            validateEdit(edit).map(
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
            modelAuthoringVersion: 1,
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
}
