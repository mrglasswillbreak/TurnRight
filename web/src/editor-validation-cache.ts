import { validateWorkspace, type EditorValidation } from './editor-validation';
import { validateEdit } from './editor-model';
import { arrivalIssues, canonicalBuildingId, publicPhoto } from './arrival';
import type { CampusData, CampusPhoto, MapEdit, ArrivalGuide } from './types';
const identity = (e: MapEdit) => `${e.kind}:${e.id}`;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
/** Only a closed allowlist may bypass topology. New/deleted/unknown edits fail closed. */
export function metadataChanges(
  before: MapEdit[],
  after: MapEdit[],
): MapEdit[] | null {
  if (before.length !== after.length) return null;
  const previous = new Map(before.map((e) => [identity(e), e]));
  const changes: MapEdit[] = [];
  for (const e of after) {
    const old = previous.get(identity(e));
    if (!old) return null;
    if (same(old, e)) continue;
    if (
      e.deleted ||
      old.deleted ||
      !['building', 'place', 'entrance'].includes(e.kind) ||
      !same(e.geometry, old.geometry)
    )
      return null;
    for (const key of new Set([...Object.keys(e), ...Object.keys(old)]))
      if (
        !['properties', 'updated_at'].includes(key) &&
        !same(e[key as keyof MapEdit], old[key as keyof MapEdit])
      )
        return null;
    for (const key of new Set([
      ...Object.keys(e.properties),
      ...Object.keys(old.properties),
    ]))
      if (
        !['photos', 'arrival'].includes(key) &&
        !same(e.properties[key], old.properties[key])
      )
        return null;
    for (const key of ['photos', 'arrival'])
      if (e.properties[key] === undefined && old.properties[key] !== undefined)
        return null;
    if (
      (e.properties.arrival as ArrivalGuide | undefined)?.needsReview !==
      (old.properties.arrival as ArrivalGuide | undefined)?.needsReview
    )
      return null;
    if (validateEdit(e).length) return null;
    changes.push(e);
  }
  return changes;
}
export class EditorValidationCache {
  private edits: MapEdit[] = [];
  private result?: EditorValidation;
  constructor(
    private base: CampusData,
    private revision: number,
  ) {}
  validate(edits: MapEdit[], full = false) {
    const changes =
      !full && this.result?.usable && !this.result.errors.length
        ? metadataChanges(this.edits, edits)
        : null;
    let result: EditorValidation | undefined;
    if (changes && this.result) {
      const data = { ...this.result.data };
      for (const edit of changes) {
        const props = edit.properties;
        if (
          props.photos !== undefined &&
          ['building', 'entrance'].includes(edit.kind)
        ) {
          const belongs = (p: CampusPhoto) =>
            edit.kind === 'entrance'
              ? p.entranceId === edit.id
              : !p.entranceId &&
                canonicalBuildingId(data, p.buildingId) ===
                  canonicalBuildingId(data, edit.id);
          if ((props.photos as CampusPhoto[]).some((p) => !belongs(p))) {
            result = undefined;
            break;
          }
          data.photos = [
            ...(data.photos || []).filter((p) => !belongs(p)),
            ...(props.photos as CampusPhoto[]).map(publicPhoto),
          ];
          if (edit.kind === 'building')
            data.photoOverrides = [
              ...new Set([
                ...(data.photoOverrides || []),
                canonicalBuildingId(data, edit.id),
              ]),
            ];
        }
        if (edit.kind === 'place')
          data.places = data.places.map((p) =>
            p.id === edit.id
              ? { ...p, arrival: props.arrival as ArrivalGuide | undefined }
              : p,
          );
        if (edit.kind === 'entrance')
          data.entrances = data.entrances?.map((e) =>
            e.id === edit.id
              ? { ...e, arrival: props.arrival as ArrivalGuide | undefined }
              : e,
          );
        result = { ...this.result, data };
      }
      if (!changes.length) result = this.result;
      if (result && changes.some((e) => e.properties.photos !== undefined)) {
        // Full validation applies all gallery overrides in kind/ID order. Keep
        // that same order when only one of several galleries changed.
        const galleries = edits
          .filter(
            (e) =>
              e.properties.photos !== undefined &&
              ['building', 'entrance'].includes(e.kind),
          )
          .sort(
            (a, b) =>
              Number(a.kind === 'entrance') - Number(b.kind === 'entrance') ||
              a.id.localeCompare(b.id),
          );
        const targets = new Set(
          galleries.map((e) =>
            e.kind === 'entrance'
              ? `entrance:${e.id}`
              : `building:${canonicalBuildingId(data, e.id)}`,
          ),
        );
        data.photos = [
          ...(data.photos || []).filter(
            (p) =>
              !targets.has(
                p.entranceId
                  ? `entrance:${p.entranceId}`
                  : `building:${canonicalBuildingId(data, p.buildingId)}`,
              ),
          ),
          ...galleries.flatMap((e) =>
            (e.properties.photos as CampusPhoto[]).map(publicPhoto),
          ),
        ];
      }
      if (result && arrivalIssues(result.data).length) result = undefined;
    }
    this.result = result || validateWorkspace(this.base, edits, this.revision);
    this.edits = edits;
    return this.result;
  }
}
export type ValidationPayload = { edits: MapEdit[]; full?: boolean };
export type ValidationDelta = Omit<EditorValidation, 'data'> & {
  data: Partial<CampusData>;
  sequence: number;
};
export class ValidationTransport {
  private previous = new Map<string, string | undefined>();
  private values = new Map<string, unknown>();
  private sequence = 0;
  encode(result: EditorValidation): ValidationDelta {
    const changed: Partial<CampusData> = {};
    for (const key of new Set([
      ...this.previous.keys(),
      ...Object.keys(result.data),
    ])) {
      const value = result.data[key as keyof CampusData];
      if (this.values.has(key) && this.values.get(key) === value) continue;
      this.values.set(key, value);
      const serialized = JSON.stringify(value);
      if (!this.previous.has(key) || this.previous.get(key) !== serialized)
        Object.assign(changed, { [key]: value });
      this.previous.set(key, serialized);
    }
    return { ...result, data: changed, sequence: ++this.sequence };
  }
}
/** Preview-only queue. Release checks and routing retain independent requests. */
export class LatestPreview {
  private active = false;
  private queued?: {
    task: () => Promise<EditorValidation>;
    resolve: (value: EditorValidation) => void;
    reject: (error: Error) => void;
  };
  request(task: () => Promise<EditorValidation>): Promise<EditorValidation> {
    return new Promise((resolve, reject) => {
      this.queued?.reject(new Error('Preview superseded'));
      this.queued = { task, resolve, reject };
      this.pump();
    });
  }
  private pump() {
    if (this.active || !this.queued) return;
    const next = this.queued;
    this.queued = undefined;
    this.active = true;
    void next
      .task()
      .then(next.resolve, next.reject)
      .finally(() => {
        this.active = false;
        this.pump();
      });
  }
  close() {
    this.queued?.reject(new Error('Preview cancelled'));
    this.queued = undefined;
  }
}
