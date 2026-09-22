import type { CampusData, Place } from './types';
import { safeWebsite } from './place-details';

export function PlaceInformation({
  place,
  sources,
}: {
  place: Place;
  sources: CampusData['sources'];
}) {
  const website = safeWebsite(place.website);
  const checked = [
    ...new Set(
      Object.values(place.evidence || {})
        .flat()
        .map((r) => r.checkedAt)
        .filter((d) => Number.isFinite(Date.parse(d))),
    ),
  ]
    .sort()
    .at(-1);
  return (
    <div className="place-information">
      {place.subtype && <p>{place.subtype.replaceAll('_', ' ')}</p>}
      {place.address && <p>{place.address}</p>}
      {place.businessStatus && place.businessStatus !== 'unknown' && (
        <p>
          Recorded status:{' '}
          {place.businessStatus === 'operating'
            ? 'operating business'
            : place.businessStatus.replaceAll('-', ' ')}
          . This is not a live update.
        </p>
      )}
      {place.openingHours && (
        <p>
          <strong>Recorded hours:</strong> {place.openingHours}
          <br />
          <small>Hours may change. Confirm with the business.</small>
        </p>
      )}
      {place.phone && (
        <p>
          <a href={`tel:${place.phone.replace(/[^+\d;,]/g, '')}`}>
            {place.phone}
          </a>
        </p>
      )}
      {website && (
        <p>
          <a href={website} target="_blank" rel="noopener noreferrer">
            Business website (online)
          </a>
        </p>
      )}
      {checked && (
        <p className="small-note">
          Source checked: {checked.slice(0, 10)}. Location and entrance may need
          field verification.
        </p>
      )}
      {place.evidence && (
        <details>
          <summary>Sources for these details</summary>
          <ul>
            {Object.entries(place.evidence).map(([field, refs]) => (
              <li key={field}>
                {field}:{' '}
                {refs.map((ref, i) => (
                  <span key={`${ref.sourceId}:${i}`}>
                    {i > 0 ? '; ' : ''}
                    {safeWebsite(ref.url) ? (
                      <a
                        href={safeWebsite(ref.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {sources.find((s) => s.id === ref.sourceId)?.name ||
                          ref.sourceId}
                      </a>
                    ) : (
                      ref.sourceId
                    )}{' '}
                    ({ref.checkedAt.slice(0, 10)})
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
