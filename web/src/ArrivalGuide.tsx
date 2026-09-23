import { useState } from 'react';
import './arrival.css';
import {
  buildingPhotos,
  entranceConnected,
  placeBuildingId,
  placeEntrances,
} from './arrival';
import type { ArrivalGuide, CampusData, CampusPhoto, Place } from './types';

export function PhotoGallery({
  photos,
  label = 'Building photographs',
}: {
  photos: CampusPhoto[];
  label?: string;
}) {
  const [index, setIndex] = useState(0),
    [failed, setFailed] = useState<string>();
  if (!photos.length) return null;
  const photo = photos[Math.min(index, photos.length - 1)];
  return (
    <section className="photo-gallery" aria-label={label}>
      <h3>{label}</h3>
      <figure>
        {failed === photo.url ? (
          <output>
            This photograph is not available on this device. Download or repair
            the campus map in Offline settings.
          </output>
        ) : (
          <a
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open full photograph: ${photo.alt}`}
          >
            <img
              key={photo.url}
              src={photo.url}
              width={photo.width}
              height={photo.height}
              alt={photo.alt}
              loading="lazy"
              onError={() => setFailed(photo.url)}
            />
          </a>
        )}
        <figcaption>
          <p>
            {photo.caption}
            {photo.historical && <strong> · Historical view</strong>}
          </p>
          <p className="small-note">
            {photo.capturedAt
              ? `Photographed ${photo.capturedAt.slice(0, 10)}. `
              : 'Capture date not recorded. '}
            Source checked {photo.checkedAt.slice(0, 10)}.
          </p>
          <details>
            <summary>Photo credits & license</summary>
            <p>{photo.attribution}</p>
            <p>
              <a href={photo.sourceUrl} target="_blank" rel="noreferrer">
                Original source
              </a>{' '}
              ·{' '}
              <a href={photo.licenseUrl} target="_blank" rel="noreferrer">
                {photo.license}
              </a>
            </p>
            <p>{photo.modifications}</p>
            {photo.license === 'CC BY-SA 4.0' && (
              <p>
                This adapted photograph is shared under the same CC BY-SA 4.0
                license.
              </p>
            )}
          </details>
        </figcaption>
      </figure>
      {photos.length > 1 && (
        <div className="gallery-controls">
          <button
            type="button"
            onClick={() =>
              setIndex(
                (Math.min(index, photos.length - 1) + photos.length - 1) %
                  photos.length,
              )
            }
            aria-label="Previous photograph"
          >
            Previous
          </button>
          <output aria-live="polite">
            {Math.min(index, photos.length - 1) + 1} of {photos.length}
          </output>
          <button
            type="button"
            onClick={() => setIndex((index + 1) % photos.length)}
            aria-label="Next photograph"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
export function RecordedArrival({ guide }: { guide?: ArrivalGuide }) {
  if (guide?.needsReview)
    return (
      <p className="notice">
        This entrance moved. Its instructions and photographs need owner review
        before use.
      </p>
    );
  return (
    <div className="recorded-arrival">
      {guide?.description && <p>{guide.description}</p>}
      {guide?.restrictions && (
        <p>
          <strong>Recorded restrictions:</strong> {guide.restrictions}
        </p>
      )}
      <dl className="arrival-facts">
        <dt>Steps</dt>
        <dd>{guide?.steps ?? 'Not recorded'}</dd>
        <dt>Ramp</dt>
        <dd>
          {guide?.ramp === 'yes'
            ? 'Recorded'
            : guide?.ramp === 'no'
              ? 'Recorded absent'
              : 'Not recorded'}
        </dd>
        <dt>Surface</dt>
        <dd>{guide?.surface || 'Not recorded'}</dd>
        <dt>Doorway width</dt>
        <dd>
          {guide?.doorwayWidthCm
            ? `${guide.doorwayWidthCm} cm (measured)`
            : 'Not measured'}
        </dd>
      </dl>
      <p className="small-note">
        {guide?.observedAt ? `Observed ${guide.observedAt.slice(0, 10)}. ` : ''}
        Recorded facts do not guarantee an accessible route. Conditions may have
        changed.
      </p>
      {guide?.evidence && (
        <details>
          <summary>Arrival evidence</summary>
          <ul>
            {[
              ...new Map(
                Object.values(guide.evidence)
                  .flat()
                  .map((e) => [`${e.sourceId}:${e.recordId}`, e]),
              ).values(),
            ].map((e) => (
              <li key={`${e.sourceId}:${e.recordId}`}>
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer">
                    {e.sourceId}
                  </a>
                ) : (
                  e.sourceId
                )}{' '}
                · checked {e.checkedAt.slice(0, 10)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
export function EntranceSelector({
  data,
  place,
  value,
  onChange,
}: {
  data: CampusData;
  place: Place;
  value: string;
  onChange: (id: string) => void;
}) {
  const entrances = placeEntrances(data, place.id),
    missing = value && !entrances.some((e) => e.id === value);
  return (
    <label className="field-label entrance-selector">
      Destination entrance
      <select
        aria-label="Destination entrance"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Best mapped entrance</option>
        {missing && (
          <option value={value} disabled>
            Selected entrance is no longer mapped — choose another
          </option>
        )}
        {entrances.map((e) => (
          <option
            key={e.id}
            value={e.id}
            disabled={!entranceConnected(data, e)}
          >
            {e.name}
            {!entranceConnected(data, e) ? ' · unavailable connection' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
export function ArrivalSection({
  data,
  place,
  entranceId,
  onEntrance,
  compact = false,
}: {
  data: CampusData;
  place: Place;
  entranceId?: string;
  onEntrance?: (id: string) => void;
  compact?: boolean;
}) {
  const entrances = placeEntrances(data, place.id),
    buildingId = placeBuildingId(data, place);
  const shown =
    compact && entranceId
      ? entrances.filter((e) => e.id === entranceId)
      : entrances;
  return (
    <details className="arrival-section" open={compact ? undefined : true}>
      <summary>
        {compact ? 'Chosen entrance & arrival guide' : 'Entrances & arrival'}
      </summary>
      {onEntrance && (
        <EntranceSelector
          data={data}
          place={place}
          value={entranceId || ''}
          onChange={onEntrance}
        />
      )}
      {entranceId && !entrances.some((e) => e.id === entranceId) && (
        <p className="notice">
          The selected entrance is no longer available. Choose another entrance
          before starting.
        </p>
      )}
      {!entrances.length && (
        <p>
          {place.graphNode
            ? 'Directions end at a mapped approach. A connected doorway has not been confirmed.'
            : 'No confirmed walking connection has been mapped.'}
        </p>
      )}
      {place.arrival && <RecordedArrival guide={place.arrival} />}
      {shown.map((e) => (
        <article className="entrance-guide" key={e.id}>
          <h4>
            {e.name}
            {e.id === entranceId ? ' · selected' : ''}
          </h4>
          <p>
            {entranceConnected(data, e)
              ? 'Connected entrance · subject to recorded access and closures'
              : 'Unconfirmed or restricted walking connection'}
          </p>
          <p className="small-note">
            Walking access:{' '}
            {e.walkingAccess === 'campus'
              ? 'Campus permission'
              : e.walkingAccess}
            .
          </p>
          <RecordedArrival guide={e.arrival} />
          {!e.arrival?.needsReview && (
            <PhotoGallery
              photos={buildingPhotos(data, e.buildingId || buildingId, e.id)}
              label={`${e.name} photographs`}
            />
          )}
        </article>
      ))}
      {!compact && (
        <p className="small-note">
          General building photographs may show doorways that do not serve this
          destination.
        </p>
      )}
    </details>
  );
}
