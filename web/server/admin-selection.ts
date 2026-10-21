import type { MapEdit } from '../src/types.js';
import type { SourceRecord } from '../src/editor-model.js';
import { db, HttpError } from './backend.js';
export async function editorSelection(actor: string, keys: unknown) {
  if (keys === undefined) return { features: [], edits: [] };
  if (
    !Array.isArray(keys) ||
    keys.length > 500 ||
    keys.some((key) => typeof key !== 'string' || key.length > 500)
  )
    throw new HttpError(400, 'Load at most 500 selected GIS features.');
  return db<{ features: SourceRecord[]; edits: MapEdit[] }>(
    'rpc/gis_hydrate_editor',
    'POST',
    { actor, keys },
  );
}
