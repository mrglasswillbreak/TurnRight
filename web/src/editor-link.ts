import { campusUrl, campusKey, requestedCampus } from './campus-context';
import { canonicalBuildingId, placeBuildingId } from './arrival';
import type { CampusData, Place } from './types';

const key = (url: string) =>
  campusKey(
    'turnright:editor-building-handoff',
    requestedCampus(new URL(url).search),
  );
const campusReturnKey = 'turnright:editor-campus-return';
type HandoffStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const valid = (id: string | null) => (id && id.length <= 200 ? id : undefined);
export const editorHref = (id?: string) =>
  campusUrl(id ? `/admin?building=${encodeURIComponent(id)}` : '/admin');
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
    return valid(storage?.getItem(key(url)) || null);
  } catch {
    return undefined;
  }
}
/** Keep the configured OAuth callback unchanged; same-tab storage carries selection. */
export function editorSignInReturn(url: string, storage?: HandoffStorage) {
  const id = requestedEditorBuilding(url, storage);
  let retained = false;
  try {
    if (storage) {
      if (id) storage.setItem(key(url), id);
      storage.setItem(
        campusReturnKey,
        JSON.stringify({
          campus: requestedCampus(new URL(url).search),
          building: id,
          at: Date.now(),
        }),
      );
      retained = true;
    }
  } catch {
    /* Query redirect remains a fallback. */
  }
  return new URL(
    retained
      ? '/admin'
      : campusUrl(editorHref(id), requestedCampus(new URL(url).search)),
    new URL(url).origin,
  ).href;
}
/** Restore the campus before API requests while retaining the exact configured OAuth callback. */
export function restoreEditorCampusReturn(
  url: string,
  storage?: HandoffStorage,
) {
  const next = new URL(url);
  try {
    const value = JSON.parse(storage?.getItem(campusReturnKey) || 'null');
    storage?.removeItem(campusReturnKey);
    if (
      !value ||
      next.searchParams.has('campus') ||
      !Number.isFinite(value.at) ||
      Date.now() - value.at > 30 * 60 * 1000 ||
      !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value.campus)
    )
      return null;
    if (value.campus !== 'lasu') next.searchParams.set('campus', value.campus);
    if (valid(value.building) && !next.searchParams.has('building'))
      next.searchParams.set('building', value.building);
    return next.pathname + next.search + next.hash;
  } catch {
    return null;
  }
}
export function consumeEditorBuilding(url: string, storage?: HandoffStorage) {
  try {
    storage?.removeItem(key(url));
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
