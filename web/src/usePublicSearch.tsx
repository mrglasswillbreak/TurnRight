import { BookOpen, ChevronRight, GraduationCap, MapPin } from 'lucide-react';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { DEFAULT_CAMPUS } from './campus-context';
import { setPreference } from './offline';
import { placeMatches, streetResults } from './place-details';
import type { Place } from './types';
import { useVisitorLayers } from './visitor-layers';

import type { PublicAppStateBindings } from './usePublicAppState';
type Inputs = Pick<
  PublicAppStateBindings,
  | 'campusScope'
  | 'data'
  | 'manifest'
  | 'setToast'
  | 'query'
  | 'category'
  | 'setUnlinkedBuilding'
  | 'setSelected'
  | 'setEntranceId'
  | 'setSearching'
  | 'mobileSearch'
  | 'setPanelExpanded'
  | 'setShareFallback'
  | 'setSharedLinkMissing'
  | 'searchInput'
  | 'resultTap'
  | 'saved'
  | 'recent'
  | 'setRecent'
  | 'savedOnly'
  | 'startRequested'
  | 'setParkingId'
  | 'setActiveLeg'
  | 'setRouteView'
  | 'setRoutes'
  | 'setBusy'
  | 'setRouteError'
  | 'navigating'
  | 'routeRequest'
>;
export function usePublicSearch({
  campusScope,
  data,
  manifest,
  setToast,
  query,
  category,
  setUnlinkedBuilding,
  setSelected,
  setEntranceId,
  setSearching,
  mobileSearch,
  setPanelExpanded,
  setShareFallback,
  setSharedLinkMissing,
  searchInput,
  resultTap,
  saved,
  recent,
  setRecent,
  savedOnly,
  startRequested,
  setParkingId,
  setActiveLeg,
  setRouteView,
  setRoutes,
  setBusy,
  setRouteError,
  navigating,
  routeRequest,
}: Inputs) {
  const deferredQuery = useDeferredValue(query);
  const [visitorLayers, setVisitorLayers] = useVisitorLayers(
    manifest?.campus?.slug || DEFAULT_CAMPUS,
  );
  const [landmarksOnly, setLandmarksOnly] = useState(false);
  const [visiblePlaceCount, setVisiblePlaceCount] = useState(50);
  useEffect(() => {
    setVisiblePlaceCount(50);
  }, [deferredQuery, category, savedOnly]);
  const places = useMemo(
    () =>
      (data?.places || [])
        .filter(
          (p) =>
            (!savedOnly || saved.includes(p.id)) &&
            (!landmarksOnly || p.landmark === true) &&
            (category === 'all' || p.category === category) &&
            placeMatches(p, deferredQuery),
        )
        .sort(
          (a, b) =>
            Number(recent.includes(b.id)) - Number(recent.includes(a.id)) ||
            Number(/library|senate|health|faculty/i.test(b.name)) -
              Number(/library|senate|health|faculty/i.test(a.name)),
        ),
    [data, deferredQuery, category, saved, savedOnly, recent, landmarksOnly],
  );
  const streets = useMemo(
    () =>
      category === 'all' && !savedOnly && !landmarksOnly
        ? streetResults(data, deferredQuery)
        : [],
    [data, deferredQuery, category, savedOnly, landmarksOnly],
  );
  const [selectedStreet, setSelectedStreet] = useState<string | null>(null);
  const selectPlace = useCallback(
    (place: Place) => {
      setSelectedStreet(null);
      startRequested.current = false;
      if (navigating) {
        setToast('Finish this walk before choosing a new destination.');
        return;
      }
      setSearching(false);
      searchInput.current?.blur();
      routeRequest.current++;
      setShareFallback('');
      setSharedLinkMissing(false);
      setSelected(place);
      setUnlinkedBuilding(null);
      setEntranceId('');
      setParkingId('');
      setActiveLeg(0);
      setPanelExpanded(true);
      setBusy(false);
      setRouteView(false);
      setRoutes([]);
      setRouteError('');
      const next = [place.id, ...recent.filter((id) => id !== place.id)].slice(
        0,
        12,
      );
      setRecent(next);
      void setPreference('recent', next, campusScope.current);
    },
    [
      navigating,
      recent,
      setPanelExpanded,
      routeRequest,
      setRouteView,
      campusScope,
      setSearching,
      setBusy,
      setParkingId,
      startRequested,
      setRouteError,
      setUnlinkedBuilding,
      setRecent,
      setSelected,
      searchInput,
      setActiveLeg,
      setShareFallback,
      setEntranceId,
      setSharedLinkMissing,
      setRoutes,
      setToast,
    ],
  );
  // GPS fixes leave the destination list untouched; routing still evaluates every fix.
  const placeRows = useMemo(
    () =>
      places.slice(0, visiblePlaceCount).map((place) => (
        <button
          className="place-row"
          key={place.id}
          onPointerDown={(event) => {
            if (resultTap.current.begin(event, mobileSearch)) {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
            } else if (
              mobileSearch &&
              event.pointerType === 'mouse' &&
              event.button === 0
            ) {
              // WebKit does not focus buttons on mouse-down. Keep search from
              // collapsing on blur before this result receives its click.
              event.preventDefault();
            }
          }}
          onPointerMove={(event) => resultTap.current.move(event)}
          onPointerUp={(event) => {
            if (resultTap.current.end(event)) {
              event.preventDefault();
              selectPlace(place);
            }
          }}
          onPointerCancel={() => resultTap.current.cancel()}
          onLostPointerCapture={() => resultTap.current.cancel()}
          onContextMenu={() => resultTap.current.cancel()}
          onClick={(event) => {
            if (resultTap.current.allowClick(event.detail)) selectPlace(place);
            else event.preventDefault();
          }}
        >
          <span className={`place-icon ${place.category}`}>
            {place.category === 'library' ? (
              <BookOpen />
            ) : place.category === 'academic' ? (
              <GraduationCap />
            ) : (
              <MapPin />
            )}
          </span>
          <span className="place-copy">
            <strong>{place.name}</strong>
            <span>
              {place.category === 'academic'
                ? 'Academic building'
                : place.category.charAt(0).toUpperCase() +
                  place.category.slice(1)}{' '}
              · {manifest?.campus?.name || 'Ojo campus'}
            </span>
          </span>
          <ChevronRight size={17} />
        </button>
      )),
    [
      places,
      visiblePlaceCount,
      mobileSearch,
      selectPlace,
      manifest?.campus?.name,
      resultTap,
    ],
  );
  return {
    visitorLayers,
    setVisitorLayers,
    landmarksOnly,
    setLandmarksOnly,
    visiblePlaceCount,
    setVisiblePlaceCount,
    places,
    streets,
    selectedStreet,
    setSelectedStreet,
    selectPlace,
    placeRows,
  };
}
export type PublicSearchBindings = ReturnType<typeof usePublicSearch>;
