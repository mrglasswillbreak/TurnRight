import { Button } from '@/components/ui/button';
import type { Feature } from 'geojson';
import {
  ArrowLeft,
  Building2,
  Copy,
  Flag,
  Heart,
  Info,
  MapPin,
  Navigation,
  Share2,
} from 'lucide-react';
import { Suspense } from 'react';
import { buildingPhotos, placeBuildingId } from './arrival';
import { buildingPlace } from './map-display';
import {
  ArrivalSection,
  BuildingVisualDetails,
  LandmarkViewButton,
  PhotoGallery,
  PlaceInformation,
} from './public-app-shared';

import type { PublicAppStateBindings } from './usePublicAppState';
import type { PublicDestinationBindings } from './usePublicDestination';
import type { PublicRoutingBindings } from './usePublicRouting';
import type { PublicSearchBindings } from './usePublicSearch';

type Props = Pick<
  PublicAppStateBindings,
  | 'setThreeD'
  | 'setUnlinkedBuilding'
  | 'setSelected'
  | 'entranceId'
  | 'setEntranceId'
  | 'mobileMapControls'
  | 'shareFallback'
  | 'saved'
  | 'setDialog'
  | 'setReportPin'
  | 'map'
> &
  Pick<PublicSearchBindings, 'visitorLayers' | 'setVisitorLayers'> &
  Pick<PublicDestinationBindings, 'shareDestination' | 'toggleSaved'> &
  Pick<PublicRoutingBindings, 'previewRoute'> & {
    data: NonNullable<PublicAppStateBindings['data']>;
    selected: NonNullable<PublicAppStateBindings['selected']>;
    campusName: string;
  };
export function PublicDestinationDetails(props: Props) {
  const {
    data,
    setThreeD,
    setUnlinkedBuilding,
    selected,
    setSelected,
    entranceId,
    setEntranceId,
    mobileMapControls,
    shareFallback,
    saved,
    setDialog,
    setReportPin,
    map,
    visitorLayers,
    setVisitorLayers,
    shareDestination,
    toggleSaved,
    previewRoute,
    campusName,
  } = props;
  return (
    <div className="place-detail">
      <button
        className="text-button"
        onClick={() => {
          setSelected(null);
          setUnlinkedBuilding(null);
        }}
      >
        <ArrowLeft size={17} /> Back to places
      </button>
      <div className={`detail-icon ${selected.category}`}>
        <Building2 />
      </div>
      <span className="eyebrow">
        {selected.category.toUpperCase()} · {campusName}
      </span>
      <h1>{selected.name}</h1>
      <Suspense fallback={null}>
        <PhotoGallery
          key={selected.id}
          photos={buildingPhotos(data, placeBuildingId(data, selected))}
          actions={
            <fieldset
              className="place-primary-actions"
              aria-label="Place actions"
            >
              <Button
                className="primary-action"
                onClick={() => void previewRoute()}
              >
                <Navigation size={18} /> Directions
              </Button>
              <div className="button-row place-actions">
                {typeof navigator.share === 'function' && (
                  <Button
                    variant="outline"
                    onClick={() => void shareDestination()}
                  >
                    <Share2 /> Share
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => void shareDestination(true)}
                >
                  <Copy /> Copy link
                </Button>
                <Button variant="outline" onClick={toggleSaved}>
                  <Heart
                    fill={saved.includes(selected.id) ? 'currentColor' : 'none'}
                  />
                  {saved.includes(selected.id) ? 'Saved' : 'Save'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setReportPin(undefined);
                    setDialog('report');
                  }}
                >
                  <Flag /> Report
                </Button>
              </div>
              {shareFallback && (
                <label className="field-label">
                  Destination link
                  <input
                    aria-label="Destination link"
                    readOnly
                    value={shareFallback}
                    onFocus={(event) => event.target.select()}
                  />
                </label>
              )}
            </fieldset>
          }
        />
      </Suspense>
      <Suspense fallback={null}>
        <ArrivalSection
          data={data}
          place={selected}
          entranceId={entranceId}
          onEntrance={setEntranceId}
        />
      </Suspense>
      <Suspense fallback={<p>Loading place details…</p>}>
        <PlaceInformation place={selected} sources={data.sources} />
      </Suspense>
      {(() => {
        const building = data.map.features.find(
          (f) =>
            f.properties?.kind === 'building' &&
            buildingPlace(data, f)?.id === selected.id,
        );
        const target: Feature | undefined =
          building ||
          (selected.landmark
            ? {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'Point',
                  coordinates: selected.coordinates,
                },
              }
            : undefined);
        return (
          target && (
            <Suspense fallback={null}>
              <LandmarkViewButton
                feature={target}
                map={map.current}
                mobile={mobileMapControls}
                onEnable={() => {
                  setThreeD(true);
                  setVisitorLayers({
                    ...visitorLayers,
                    buildings: true,
                  });
                }}
              />
              {building && (
                <BuildingVisualDetails data={data} feature={building} />
              )}
            </Suspense>
          )
        );
      })()}
      <p>{selected.department || selected.faculty || campusName}</p>
      <div className="detail-facts">
        <div>
          <MapPin />
          <span>
            {selected.coordinates[1].toFixed(5)},{' '}
            {selected.coordinates[0].toFixed(5)}
          </span>
        </div>
        <div>
          <Flag />
          <span>
            {selected.arrivalKind === 'entrance'
              ? 'Connected to a mapped entrance.'
              : selected.graphNode
                ? `Mapped path ${selected.approachDistance} m away. Entrance connection unverified.`
                : 'Walking connection not yet mapped.'}
          </span>
        </div>
        <div>
          <Info />
          <span>
            Source:{' '}
            {data.sources.find((s) => s.id === selected.source)?.name ||
              (selected.source === 'overture'
                ? 'Overture Maps Foundation'
                : selected.source === 'campus-review'
                  ? 'Campus review'
                  : selected.source)}
            . Not field-verified.
          </span>
        </div>
      </div>
    </div>
  );
}
