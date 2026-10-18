import { ChevronRight, Heart, Navigation, Search } from 'lucide-react';
import { categories } from './public-app-shared';

import type { PublicAppStateBindings } from './usePublicAppState';
import type { PublicOfflineLifecycleBindings } from './usePublicOfflineLifecycle';
import type { PublicSearchBindings } from './usePublicSearch';

type Props = Pick<
  PublicAppStateBindings,
  | 'setToast'
  | 'query'
  | 'category'
  | 'setCategory'
  | 'setSearching'
  | 'searchInput'
  | 'savedOnly'
  | 'setDialog'
  | 'downloaded'
  | 'online'
  | 'swReady'
> &
  Pick<PublicOfflineLifecycleBindings, 'checkingDownload'> &
  Pick<
    PublicSearchBindings,
    | 'landmarksOnly'
    | 'setLandmarksOnly'
    | 'visiblePlaceCount'
    | 'setVisiblePlaceCount'
    | 'places'
    | 'streets'
    | 'setSelectedStreet'
    | 'placeRows'
  >;
export function PublicPlaceBrowse(props: Props) {
  const {
    setToast,
    query,
    category,
    setCategory,
    setSearching,
    searchInput,
    savedOnly,
    setDialog,
    downloaded,
    online,
    swReady,
    checkingDownload,
    landmarksOnly,
    setLandmarksOnly,
    visiblePlaceCount,
    setVisiblePlaceCount,
    places,
    streets,
    setSelectedStreet,
    placeRows,
  } = props;
  return (
    <>
      <div className="category-strip">
        <button
          className={landmarksOnly ? 'category active' : 'category'}
          aria-pressed={landmarksOnly}
          onClick={() => {
            setLandmarksOnly((v) => !v);
            setCategory('all');
          }}
        >
          Landmarks
        </button>
        {categories.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={category === id ? 'category active' : 'category'}
            onClick={() => setCategory(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR CAMPUS, CONNECTED</span>
          <h1>
            {savedOnly
              ? 'Saved places'
              : query
                ? 'Search results'
                : 'Explore campus'}
          </h1>
        </div>
        <span className="count-pill">{places.length + streets.length}</span>
      </div>
      <p className="section-description">
        {savedOnly
          ? 'Your places, saved on this device.'
          : 'Find a building. Pick a path. You’re on your way.'}
      </p>
      <div className="place-list">
        {streets.map((street) => (
          <button
            className="place-row"
            key={String(street.properties?.id)}
            onClick={() => {
              setSelectedStreet(String(street.properties?.id));
              setSearching(false);
              searchInput.current?.blur();
              setToast(
                `${street.properties?.name} highlighted. Select a place or mapped entrance for directions.`,
              );
            }}
          >
            <span className="place-icon">
              <Navigation />
            </span>
            <span className="place-copy">
              <strong>{String(street.properties?.name)}</strong>
              <span>Street · Show on map</span>
            </span>
            <ChevronRight size={17} />
          </button>
        ))}
        {placeRows}
        {places.length > visiblePlaceCount && (
          <button
            className="text-button"
            onClick={() => setVisiblePlaceCount((n) => n + 50)}
          >
            Show more places ({places.length - visiblePlaceCount} remaining)
          </button>
        )}
        {!places.length && !streets.length && (
          <div className="empty-state">
            {savedOnly ? <Heart /> : <Search />}
            <h3>{savedOnly ? 'Keep your places close' : 'No places found'}</h3>
            <p>
              {savedOnly
                ? 'Open a place and tap Save to find it here.'
                : 'Try a building name, department, or abbreviation.'}
            </p>
          </div>
        )}
      </div>
      <footer className="panel-footer">
        <span className="status-dot" />
        {checkingDownload
          ? 'Checking downloaded files…'
          : downloaded && swReady
            ? 'Ready offline'
            : online
              ? 'Campus map'
              : 'Offline'}
        <button className="text-button" onClick={() => setDialog('offline')}>
          {downloaded ? 'Manage map' : 'Download map'}
        </button>
      </footer>
    </>
  );
}
