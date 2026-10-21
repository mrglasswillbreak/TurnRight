import { distance } from './geo';
import type { WalkingAccess } from './types';
import type { SurveySessionState } from './useSurveySession';

export function SurveyMarkerForm({ state }: { state: SurveySessionState }) {
  const { marker, setMarker, center, query, setQuery, data, command } = state;

  return (
    <>
      {marker && (
        <fieldset>
          <legend>
            {marker.kind === 'place'
              ? 'Confirm place observation'
              : 'Confirm entrance'}
          </legend>
          <label>
            Observation type
            <select
              aria-label="Observation type"
              value={marker.kind || 'entrance'}
              onChange={(e) =>
                setMarker({
                  ...marker,
                  kind: e.target.value as 'entrance' | 'place',
                  name: marker.name === 'Entrance' ? '' : marker.name,
                })
              }
            >
              <option value="entrance">Entrance to an existing place</option>
              <option value="place">New business or place</option>
            </select>
          </label>
          {marker.kind === 'place' && (
            <>
              <label>
                Place category
                <select
                  aria-label="Survey place category"
                  value={marker.category || 'other'}
                  onChange={(e) =>
                    setMarker({
                      ...marker,
                      category: e.target.value as import('./types').Category,
                    })
                  }
                >
                  {[
                    'academic',
                    'library',
                    'food',
                    'services',
                    'worship',
                    'residence',
                    'sports',
                    'gate',
                    'other',
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              {(
                [
                  'subtype',
                  'address',
                  'phone',
                  'website',
                  'openingHours',
                ] as const
              ).map((key) => (
                <label key={key}>
                  {
                    {
                      subtype: 'Business type',
                      address: 'Address',
                      phone: 'Public business phone',
                      website: 'Website',
                      openingHours: 'Recorded opening hours',
                    }[key]
                  }
                  <input
                    aria-label={`Survey ${key}`}
                    value={marker[key] || ''}
                    onChange={(e) =>
                      setMarker({ ...marker, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <p>
                Record observed details only. An entrance and route connection
                can be added separately.
              </p>
            </>
          )}
          <p>
            {marker.kind === 'place'
              ? 'Move the map under the crosshair to the observed place location, then choose Place here.'
              : 'Move the map under the crosshair to the ground footprint edge, then choose Place here.'}
          </p>
          <button onClick={() => setMarker({ ...marker, coordinates: center })}>
            {marker.kind === 'place'
              ? 'Place observation here'
              : 'Place entrance here'}
          </button>
          <input
            aria-label={
              marker.kind === 'place' ? 'Place name' : 'Entrance name'
            }
            value={marker.name}
            onChange={(e) => setMarker({ ...marker, name: e.target.value })}
          />
          {marker.kind !== 'place' && (
            <>
              <input
                aria-label="Find entrance place"
                placeholder="Search nearby places"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                aria-label="Entrance place"
                value={marker.placeId}
                onChange={(e) =>
                  setMarker({ ...marker, placeId: e.target.value })
                }
              >
                <option value="">Choose place</option>
                {data.places
                  .filter((p) =>
                    p.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .sort(
                    (a, b) =>
                      distance(a.coordinates, marker.coordinates) -
                      distance(b.coordinates, marker.coordinates),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <select
                aria-label="Entrance walking access"
                value={marker.access}
                onChange={(e) =>
                  setMarker({
                    ...marker,
                    access: e.target.value as WalkingAccess,
                  })
                }
              >
                {['yes', 'campus', 'private', 'no'].map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </>
          )}
          <button
            disabled={
              marker.kind === 'place' ? !marker.name.trim() : !marker.placeId
            }
            onClick={() => {
              command((s) => {
                const i = s.markers.findIndex((m) => m.id === marker.id);
                if (i < 0) s.markers.push(marker);
                else s.markers[i] = marker;
              });
              setMarker(null);
            }}
          >
            {marker.kind === 'place'
              ? 'Confirm place observation'
              : 'Confirm entrance'}
          </button>
          <button onClick={() => setMarker(null)}>
            {marker.kind === 'place' ? 'Cancel observation' : 'Cancel entrance'}
          </button>
        </fieldset>
      )}
    </>
  );
}
