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
