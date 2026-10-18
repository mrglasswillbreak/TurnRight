import { ChevronDown, ChevronUp, Navigation, Search, X } from 'lucide-react';
import { Suspense } from 'react';
import { DEFAULT_CAMPUS } from './campus-context';
import { CampusSwitcher } from './public-app-shared';

import type { PublicAppStateBindings } from './usePublicAppState';
import type { PublicOfflineLifecycleBindings } from './usePublicOfflineLifecycle';
import type { PublicRoutingBindings } from './usePublicRouting';

type Props = Pick<
  PublicAppStateBindings,
  | 'campusScope'
  | 'dark'
  | 'query'
  | 'setQuery'
  | 'threeD'
  | 'selected'
  | 'setSelected'
  | 'setFollow'
  | 'setCampusSearch'
  | 'setSearching'
  | 'panelExpanded'
  | 'setPanelExpanded'
  | 'searchInput'
  | 'panelContent'
  | 'setRouteView'
  | 'setRoutes'
  | 'navigating'
  | 'nav'
> &
  Pick<PublicOfflineLifecycleBindings, 'currentRoute' | 'campusMap'> &
  Pick<PublicRoutingBindings, 'stopNavigation' | 'commitCampus'> & {
    data: NonNullable<PublicAppStateBindings['data']>;
    manifest: NonNullable<PublicAppStateBindings['manifest']>;
    campusName: string;
  };
export function PublicSearchBar(props: Props) {
  const {
    campusScope,
    dark,
    data,
    manifest,
    query,
    setQuery,
    threeD,
    selected,
    setSelected,
    setFollow,
    setCampusSearch,
    setSearching,
    panelExpanded,
    setPanelExpanded,
    searchInput,
    panelContent,
    setRouteView,
    setRoutes,
    navigating,
    nav,
    currentRoute,
    campusMap,
    stopNavigation,
    commitCampus,
    campusName,
  } = props;
  return (
    <div className="dock-search-row">
      <Suspense fallback={null}>
        <CampusSwitcher
          map={campusMap}
          navigating={navigating}
          onStop={stopNavigation}
          campus={{
            id: manifest.campus?.id || DEFAULT_CAMPUS,
            slug: campusScope.current,
            name: campusName,
            bounds: data.bounds,
            outline:
              data.boundary.geometry.type === 'Polygon' ||
              data.boundary.geometry.type === 'MultiPolygon'
                ? data.boundary.geometry
                : undefined,
          }}
          dark={dark}
          threeD={threeD}
          onCommit={commitCampus}
          onOpenChange={setCampusSearch}
          onBrowse={() => setFollow(false)}
        />
      </Suspense>
      {navigating ? (
        <div className="navigation-summary" aria-live="polite">
          <Navigation size={21} />
          <span>
            <strong>
              {nav.arrived
                ? 'You have arrived'
                : currentRoute?.maneuvers[nav.nextIndex]?.instruction ||
                  'Follow your route'}
            </strong>
            <small>{selected?.name}</small>
          </span>
        </div>
      ) : (
        <div className="search-box">
          <Search size={21} />
          <input
            aria-label="Search campus"
            ref={searchInput}
            placeholder={`Search ${campusName}`}
            value={query}
            onFocus={() => {
              setSearching(true);
              setPanelExpanded(true);
              panelContent.current?.scrollTo(0, 0);
            }}
            enterKeyHint="search"
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setRouteView(false);
              setRoutes([]);
            }}
          />
          {query && (
            <button
              aria-label="Clear search"
              onPointerDown={(event) => {
                if (document.activeElement === searchInput.current)
                  event.preventDefault();
              }}
              onClick={() => setQuery('')}
            >
              <X size={17} />
            </button>
          )}
        </div>
      )}
      <button
        className="dock-toggle"
        aria-expanded={panelExpanded}
        aria-controls="campus-panel-content"
        aria-label={panelExpanded ? 'Collapse card' : 'Expand card'}
        onClick={() => {
          setSearching(false);
          if (panelExpanded) searchInput.current?.blur();
          setPanelExpanded(!panelExpanded);
        }}
      >
        {panelExpanded ? <ChevronDown size={22} /> : <ChevronUp size={22} />}
      </button>
    </div>
  );
}
