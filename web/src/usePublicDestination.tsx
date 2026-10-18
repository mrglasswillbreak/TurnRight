import { useEffect, useEffectEvent } from 'react';
import { requestedCampus } from './campus-context';
import { destinationLink, sharedDestination } from './destination-sharing';
import { setPreference } from './offline';
import { useWebMcp } from './useWebMcp';

import type { PublicAppStateBindings } from './usePublicAppState';
import type { PublicSearchBindings } from './usePublicSearch';
type Inputs = Pick<
  PublicAppStateBindings,
  | 'campusScope'
  | 'data'
  | 'setToast'
  | 'selected'
  | 'entranceId'
  | 'setEntranceId'
  | 'setPanelExpanded'
  | 'setShareFallback'
  | 'setSharedLinkMissing'
  | 'sharedLinkOpened'
  | 'saved'
  | 'setSaved'
  | 'navigating'
> &
  Pick<PublicSearchBindings, 'selectPlace'>;
export function usePublicDestination({
  campusScope,
  data,
  setToast,
  selected,
  entranceId,
  setEntranceId,
  setPanelExpanded,
  setShareFallback,
  setSharedLinkMissing,
  sharedLinkOpened,
  saved,
  setSaved,
  navigating,
  selectPlace,
}: Inputs) {
  const openDestinationLink = useEffectEvent(() => {
    if (!data || location.pathname.startsWith('/admin')) return;
    if (requestedCampus() !== campusScope.current) return;
    const stamp = `${location.search}:${data.version}`;
    if (sharedLinkOpened.current === stamp) return;
    const shared = sharedDestination(data, location.href);
    if (navigating && shared.requested) {
      setToast('Finish this walk before opening a shared destination.');
      return;
    }
    sharedLinkOpened.current = stamp;
    if (!shared.requested) return;
    if (shared.place) {
      selectPlace(shared.place);
      setEntranceId(shared.entranceId || '');
    } else {
      setSharedLinkMissing(true);
      setPanelExpanded(true);
    }
  });
  useEffect(() => {
    openDestinationLink();
    const changed = () => openDestinationLink();
    window.addEventListener('popstate', changed);
    return () => window.removeEventListener('popstate', changed);
  }, [data, navigating]);
  const shareDestination = async (copy = false) => {
    if (!selected) return;
    const url = destinationLink(
      selected.id,
      location.origin,
      entranceId || undefined,
    );
    try {
      if (!copy && navigator.share)
        await navigator.share({
          title: selected.name,
          text: `Find ${selected.name} on TurnRight`,
          url,
        });
      else {
        await navigator.clipboard.writeText(url);
        setToast('Destination link copied.');
      }
      setShareFallback('');
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setShareFallback(url);
      setToast('Select and copy the destination link below.');
    }
  };
  useWebMcp(data, selectPlace, navigating);
  const toggleSaved = () => {
    if (!selected) return;
    const next = saved.includes(selected.id)
      ? saved.filter((id) => id !== selected.id)
      : [...saved, selected.id];
    setSaved(next);
    void setPreference('saved', next, campusScope.current);
  };
  return { shareDestination, toggleSaved };
}
export type PublicDestinationBindings = ReturnType<typeof usePublicDestination>;
