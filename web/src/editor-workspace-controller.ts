import { lasuCampus, type MappingArea } from './campus-context';
import type { RoofDraft } from './visual-types';
import type { MapEdit } from './types';
import {
  canonical,
  mergeWorkspace,
  type ConflictChoices,
} from './editor-conflicts';
import {
  editKey,
  editContent,
  type UnfinishedDrawing,
  type WorkspaceSnapshot,
  type SaveBatch,
  type WorkspaceRecovery,
  type SaveStatus,
  recoveryMessage,
} from './editor-workspace-contract';
import {
  persistNowEditorWorkspace,
  saveLoopEditorWorkspace,
  recoveryCopyEditorWorkspace,
  localBackupEditorWorkspace,
} from './editor-workspace-persistence';
/** Internal implementation. The public module exposes only the supported controller API. */
export class EditorWorkspace {
  modelInputs: Record<string, Record<string, string>> = {};
  edits!: MapEdit[];
  unfinished: UnfinishedDrawing | null = null;
  roofDraft: RoofDraft | null = null;
  saved!: MapEdit[];
  pending: SaveBatch | null = null;
  past: WorkspaceSnapshot[] = [];
  future: WorkspaceSnapshot[] = [];
  status: SaveStatus = 'Saved';
  error = '';
  errorStatus = 0;
  revision = 0;
  listeners = new Set<() => void>();
  flight: Promise<boolean> | null = null;
  persistence: Promise<void> = Promise.resolve();
  recoveryFailed = false;
  updateRecoveryRevision = -1;
  recoverySnapshot?: WorkspaceRecovery;
  queuedRecovery?: WorkspaceRecovery;
  writingRecovery = false;
  historyGroup!: string | undefined;
  conflictBase?: MapEdit[];
  featureBases: MapEdit[] = [];
  sourceBaseline?: (edit: MapEdit) => MapEdit | undefined;
  setSourceBaseline(lookup?: (edit: MapEdit) => MapEdit | undefined) {
    this.sourceBaseline = lookup;
  }
  /** Explicitly end a saved GIS geometry session while retaining ordinary editor history. */
  releaseDatasetFeatures() {
    if (
      this.dirty ||
      this.pending ||
      this.unfinished ||
      this.roofDraft ||
      this.status === 'Conflict'
    )
      throw new Error(
        'Save and finish the current edit before ending the GIS editing session.',
      );
    const keep = (edit: MapEdit) => !edit.properties.gisManaged;
    this.saved = this.saved.filter(keep);
    this.edits = this.edits.filter(keep);
    this.featureBases = this.featureBases.filter(keep);
    this.past = this.past.map((s) => ({ ...s, edits: s.edits.filter(keep) }));
    this.future = this.future.map((s) => ({
      ...s,
      edits: s.edits.filter(keep),
    }));
    this.changed();
  }
  /** A paged dataset feature can join the shared editor without becoming an edit command. */
  includeServerFeature(edit: MapEdit) {
    const key = editKey(edit),
      existing = this.saved.find((e) => editKey(e) === key);
    if (existing) {
      if (existing.updated_at !== edit.updated_at)
        throw new Error(
          'This feature changed. Refresh and resolve the shared draft before editing.',
        );
      return;
    }
    if (this.edits.some((e) => editKey(e) === key))
      throw new Error('Resolve the local version of this feature first.');
    this.saved = [...this.saved, structuredClone(edit)];
    this.edits = [...this.edits, structuredClone(edit)];
    for (const snapshot of [...this.past, ...this.future])
      snapshot.edits.push(structuredClone(edit));
    this.changed();
  }
  constructor(
    server: MapEdit[],
    public send: (batch: SaveBatch) => Promise<MapEdit[]>,
    public persist: (state: WorkspaceRecovery) => Promise<void>,
    recovery?: WorkspaceRecovery | null,
    public mappingArea: MappingArea = lasuCampus,
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
  notify() {
    this.revision++;
    this.listeners.forEach((fn) => fn());
  }
  snapshot(): WorkspaceSnapshot {
    return {
      edits: this.edits,
      unfinished: structuredClone(this.unfinished),
      roofDraft: structuredClone(this.roofDraft),
    };
  }
  recoveryCopy(): ReturnType<typeof recoveryCopyEditorWorkspace> {
    return recoveryCopyEditorWorkspace.call(this);
  }
  localBackup(
    baselineVersion: string,
  ): ReturnType<typeof localBackupEditorWorkspace> {
    return localBackupEditorWorkspace.call(this, baselineVersion);
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
    this.updateRecoveryRevision = -1;
    await this.flush();
    const revision = this.revision;
    if (!(await this.preserveRecovery()) || this.revision !== revision)
      return false;
    this.updateRecoveryRevision = revision;
    return true;
  }
  get canReloadForUpdate() {
    return (
      !this.recoveryFailed && this.updateRecoveryRevision === this.revision
    );
  }
  persistNow(): ReturnType<typeof persistNowEditorWorkspace> {
    return persistNowEditorWorkspace.call(this);
  }
  get dirty() {
    return this.changes().length > 0 || !!this.pending;
  }
  get needsLeaveWarning() {
    return (
      this.dirty ||
      !!this.unfinished ||
      !!this.roofDraft ||
      this.writingRecovery ||
      this.status === 'Recovery unavailable' ||
      Object.values(this.modelInputs).some(
        (inputs) => Object.keys(inputs).length > 0,
      )
    );
  }
  get canAutosave() {
    return (
      this.dirty &&
      !['Conflict', 'Saving'].includes(this.status) &&
      (!this.error || this.error === recoveryMessage)
    );
  }
  changes() {
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
  changed() {
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
  restore(snapshot: WorkspaceSnapshot) {
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
  saveLoop(): ReturnType<typeof saveLoopEditorWorkspace> {
    return saveLoopEditorWorkspace.call(this);
  }
}
