import { canonical } from './editor-conflicts.js';
import type { MapEdit } from './types.js';

export interface PublishedWorkspace {
  version: string;
  edits: MapEdit[];
}

const key = (edit: MapEdit) => `${edit.kind}:${edit.id}`;
const content = (edit: MapEdit) =>
  canonical({
    geometry: edit.geometry,
    properties: edit.properties,
    deleted: !!edit.deleted,
  });

/** Restore only this building's published correction, retaining the current save identity. */
export function publishedBuildingRestore(
  edit: MapEdit,
  published: PublishedWorkspace | null | undefined,
  version: string,
): MapEdit | undefined {
  if (edit.kind !== 'building' || published?.version !== version) return;
  const before = published.edits.find(
    (e) => e.kind === 'building' && e.id === edit.id && !e.deleted,
  );
  if (!before || content(edit) === content(before)) return;
  return {
    ...edit,
    geometry: structuredClone(before.geometry),
    properties: structuredClone(before.properties),
    deleted: before.deleted,
  };
}

/** Retain source overrides; only hide corrections already in the public release. */
export function unpublishedEdits(
  edits: MapEdit[],
  published?: PublishedWorkspace | null,
): MapEdit[] {
  const previous = new Map((published?.edits || []).map((e) => [key(e), e]));
  return edits.filter((edit) => {
    const before = previous.get(key(edit));
    if (!before && edit.deleted && edit.properties.revertToSource) return false;
    return !before || content(edit) !== content(before);
  });
}
