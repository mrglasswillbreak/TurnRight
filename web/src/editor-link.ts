import { canonicalBuildingId, placeBuildingId } from './arrival';
import type { CampusData, Place } from './types';

const key = 'turnright:editor-building-handoff';
type HandoffStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const valid = (id: string | null) => (id && id.length <= 200 ? id : undefined);
export const editorHref = (id?: string) =>
  id ? `/admin?building=${encodeURIComponent(id)}` : '/admin';
export function publicEditorHref(
  data: CampusData,
  place: Place | null,
  buildingId?: string,
) {
  const id = place
    ? placeBuildingId(data, place)
    : buildingId
      ? canonicalBuildingId(data, buildingId)
      : undefined;
  return editorHref(id);
}
export function requestedEditorBuilding(url: string, storage?: HandoffStorage) {
  const query = new URL(url).searchParams;
  if (query.has('building')) return valid(query.get('building'));
  try {
    return valid(storage?.getItem(key) || null);
  } catch {
    return undefined;
  }
}
/** Keep the configured OAuth callback unchanged; same-tab storage carries selection. */
export function editorSignInReturn(url: string, storage?: HandoffStorage) {
  const id = requestedEditorBuilding(url, storage);
  let retained = false;
  try {
    if (id && storage) {
      storage.setItem(key, id);
      retained = true;
    }
  } catch {
    /* Query redirect remains a fallback. */
  }
  return new URL(retained ? '/admin' : editorHref(id), new URL(url).origin)
    .href;
}
export function consumeEditorBuilding(url: string, storage?: HandoffStorage) {
  try {
    storage?.removeItem(key);
  } catch {
    /* The URL still consumes its request. */
  }
  const next = new URL(url);
  next.searchParams.delete('building');
  return next.pathname + next.search + next.hash;
}
export function editorHandoffStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
