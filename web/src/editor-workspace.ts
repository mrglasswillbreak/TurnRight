import type { Geometry } from "geojson";
import type { MapEdit } from "./types";
import { validateEdit } from "./editor-model";

export const editKey = (edit: Pick<MapEdit, "id" | "kind">) => `${edit.kind}:${edit.id}`;
export function editContent(edit: MapEdit | undefined) {
  if (!edit) return "";
  const { updated_at: _timestamp, ...content } = edit;
  return JSON.stringify(content);
}
export interface UnfinishedDrawing { id: string; kind: MapEdit["kind"]; geometry: Geometry; properties: MapEdit["properties"] }
export interface WorkspaceSnapshot { edits: MapEdit[]; unfinished: UnfinishedDrawing | null }
export interface SaveBatch { operationId: string; edits: { edit: MapEdit; expectedUpdatedAt: string | null }[] }
export interface WorkspaceRecovery extends WorkspaceSnapshot {
  saved: MapEdit[];
  pending: SaveBatch | null;
  past: WorkspaceSnapshot[];
  future: WorkspaceSnapshot[];
}
export type SaveStatus = "Saved" | "Saving" | "Saved locally" | "Conflict" | "Recovery unavailable";

/** One history entry per user command; the network never replaces newer local commands. */
export class EditorWorkspace {
  edits: MapEdit[];
  unfinished: UnfinishedDrawing | null = null;
  saved: MapEdit[];
  pending: SaveBatch | null = null;
  past: WorkspaceSnapshot[] = [];
  future: WorkspaceSnapshot[] = [];
  status: SaveStatus = "Saved";
  error = "";
  revision = 0;
  private listeners = new Set<() => void>();
  private flight: Promise<boolean> | null = null;
  private persistence: Promise<void> = Promise.resolve();
  constructor(server: MapEdit[], private send: (batch: SaveBatch) => Promise<MapEdit[]>, private persist: (state: WorkspaceRecovery) => Promise<void>, recovery?: WorkspaceRecovery | null) {
    this.saved = structuredClone(server);
    this.edits = structuredClone(server);
    if (recovery) {
      this.past = recovery.past || [];
      this.future = recovery.future || [];
      this.unfinished = recovery.unfinished;
      this.pending = recovery.pending;
      const previous = new Map(recovery.saved.map((e) => [editKey(e), e]));
      const remote = new Map(server.map((e) => [editKey(e), e]));
      for (const local of recovery.edits) {
        const key = editKey(local), before = previous.get(key), next = remote.get(key);
        if (editContent(local) !== editContent(before)) {
          // A saved-but-unacknowledged request is retried with its original operation ID.
          if (editContent(next) !== editContent(before) && editContent(next) !== editContent(local) && !this.pending) this.status = "Conflict";
          remote.set(key, local);
        }
      }
      this.edits = [...remote.values()];
      if (this.status !== "Conflict" && (this.dirty || this.unfinished)) this.status = "Saved locally";
      if (this.status === "Conflict") this.error = "This draft changed in another session. Your local work is preserved.";
    }
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getRevision = () => this.revision;
  private notify() { this.revision++; this.listeners.forEach((fn) => fn()); }
  private snapshot(): WorkspaceSnapshot { return structuredClone({ edits: this.edits, unfinished: this.unfinished }); }
  private persistNow() {
    const recovery: WorkspaceRecovery = structuredClone({ ...this.snapshot(), saved: this.saved, pending: this.pending, past: this.past, future: this.future });
    this.persistence = this.persistence.catch(() => {}).then(() => this.persist(recovery)).catch(() => {
      this.status = "Recovery unavailable";
      this.error = "Browser storage could not save a recovery copy. Keep this tab open until the draft is saved.";
      this.notify();
    });
    return this.persistence;
  }
  get dirty() { return this.changes().length > 0 || !!this.pending; }
  private changes() {
    const saved = new Map(this.saved.map((e) => [editKey(e), e]));
    return this.edits.filter((e) => editContent(e) !== editContent(saved.get(editKey(e))));
  }
  commit(edits: MapEdit[], unfinished: UnfinishedDrawing | null = this.unfinished) {
    const next = new Map(this.edits.map((e) => [editKey(e), e]));
    edits.forEach((e) => next.set(editKey(e), structuredClone(e)));
    if (JSON.stringify([...next.values()]) === JSON.stringify(this.edits) && JSON.stringify(unfinished) === JSON.stringify(this.unfinished)) return;
    this.past.push(this.snapshot());
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    this.edits = [...next.values()];
    this.unfinished = unfinished;
    this.changed();
  }
  draft(drawing: UnfinishedDrawing | null) { this.unfinished = drawing; this.changed(); }
  private changed() {
    if (this.status !== "Conflict" && this.status !== "Recovery unavailable") {
      this.status = this.dirty || this.unfinished ? "Saved locally" : "Saved";
      this.error = "";
    }
    void this.persistNow();
    this.notify();
  }
  private restore(snapshot: WorkspaceSnapshot) {
    const next = new Map(snapshot.edits.map((e) => [editKey(e), e]));
    // Undoing a creation that reached the server needs an explicit tombstone.
    for (const e of [...this.saved, ...(this.pending?.edits.map((p) => p.edit) || [])]) if (!next.has(editKey(e))) next.set(editKey(e), { ...e, deleted: true });
    this.edits = [...next.values()]; this.unfinished = snapshot.unfinished; this.changed();
  }
  undo() { const previous = this.past.pop(); if (previous) { this.future.push(this.snapshot()); this.restore(previous); } }
  redo() { const next = this.future.pop(); if (next) { this.past.push(this.snapshot()); this.restore(next); } }
  reconcile(server: MapEdit[], keepLocal: boolean) {
    const changes = this.changes();
    this.saved = structuredClone(server);
    const merged = new Map(server.map((e) => [editKey(e), e]));
    if (keepLocal) changes.forEach((e) => merged.set(editKey(e), e));
    this.edits = [...merged.values()];
    this.pending = null;
    this.status = "Saved locally"; this.error = "";
    if (!keepLocal) { this.past = []; this.future = []; this.unfinished = null; }
    this.changed();
  }
  flush(): Promise<boolean> {
    if (this.flight) return this.flight;
    if (this.status === "Conflict") return Promise.resolve(false);
    this.flight = this.saveLoop().finally(() => { this.flight = null; });
    return this.flight;
  }
  private async saveLoop() {
    try {
      while (this.pending || this.changes().length) {
        if (!this.pending) {
          const changes = this.changes();
          const errors = changes.flatMap(validateEdit);
          if (errors.length) { this.status = "Saved locally"; this.error = errors[0]; this.notify(); return false; }
          const saved = new Map(this.saved.map((e) => [editKey(e), e]));
          this.pending = { operationId: crypto.randomUUID(), edits: changes.map((edit) => ({ edit: structuredClone(edit), expectedUpdatedAt: saved.get(editKey(edit))?.updated_at || null })) };
          await this.persistNow();
        }
        this.status = "Saving"; this.error = ""; this.notify();
        const batch = this.pending;
        const result = await this.send(batch);
        const saved = new Map(this.saved.map((e) => [editKey(e), e]));
        result.forEach((e) => saved.set(editKey(e), e));
        this.saved = [...saved.values()];
        this.edits = this.edits.map((e) => {
          const sent = batch.edits.find((p) => editKey(p.edit) === editKey(e));
          return sent && editContent(sent.edit) === editContent(e) ? saved.get(editKey(e)) || e : e;
        });
        this.pending = null;
        await this.persistNow();
      }
      this.status = this.unfinished ? "Saved locally" : "Saved"; this.error = ""; this.notify();
      return true;
    } catch (error) {
      this.status = (error as { status?: number }).status === 409 ? "Conflict" : "Saved locally";
      this.error = error instanceof Error ? error.message : "Draft could not be saved. Retry when connected.";
      await this.persistNow(); this.notify();
      return false;
    }
  }
}
