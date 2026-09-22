import { remainingSeconds, vehiclePermitted } from './driving';
import { placeHasConnection } from './routing';
import { routeSteps } from './route-steps';
import { MotionStatus } from './MotionAssistance';
import {
  ArrowLeft,
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Footprints,
  Car,
  Navigation,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { meters, minutes } from './geo';
import type { NavigationState } from './navigation';
import type {
  CampusData,
  GpsFix,
  ManeuverKind,
  Place,
  Route,
  TravelMode,
} from './types';
export function TurnIcon({
  kind,
  size = 26,
}: {
  kind: ManeuverKind;
  size?: number;
}) {
  const Icon = kind.includes('left')
    ? CornerUpLeft
    : kind.includes('right')
      ? CornerUpRight
      : kind === 'uturn'
        ? RotateCcw
        : kind === 'arrive'
          ? Flag
          : ArrowUp;
  return <Icon size={size} />;
}
export function RoutePanel({
  data,
  mode = 'walking',
  parkingId = '',
  onMode,
  onParking,
  activeRoute,
  onParked,
  destination,
  routes,
  chosen,
  origin,
  busy,
  error,
  navigating,
  nav,
  muted,
  onOrigin,
  onChoose,
  onStart,
  onStop,
  onBack,
  onMute,
  onRepeat,
  fix,
  following,
}: {
  data: CampusData;
  mode?: TravelMode;
  parkingId?: string;
  onMode?: (mode: TravelMode) => void;
  onParking?: (id: string) => void;
  activeRoute?: Route;
  onParked?: () => void;
  destination: Place;
  routes: Route[];
  chosen: number;
  origin: string;
  busy: boolean;
  error: string;
  navigating: boolean;
  nav: NavigationState;
  muted: boolean;
  onOrigin: (origin: string) => void;
  onChoose: (index: number) => void;
  onStart: () => void;
  onStop: () => void;
  onBack: () => void;
  onMute: () => void;
  onRepeat: () => void;
  fix?: GpsFix | null;
  following?: boolean;
}) {
  const route = activeRoute || routes[chosen];
  const routeEdges = new Set(route?.edgeIds || []);
  const usesCampusAccess = data.graph.edges.some(
    (edge) => edge.walkingAccess === 'campus' && routeEdges.has(edge.id),
  );
  const drivingReviews = [
    ...new Map(
      data.graph.edges
        .filter((e) => routeEdges.has(e.id) && e.vehicle?.review)
        .map((e) => [e.vehicle!.review!.id, e.vehicle!.review!]),
    ).values(),
  ];
  const parking = data.driving?.parking.find((p) => p.id === route?.parkingId);
  const destinationRoute = route?.legs?.at(-1) || route;
  const originPlace = data.places.find((p) => p.id === origin);
  const next = route?.maneuvers[nav.nextIndex] || route?.maneuvers.at(-1);
  return (
    <div className="route-panel">
      {route && route.mode !== 'driving' && (
        <p className="notice" aria-label="Recorded steps information">
          {routeSteps(data, route).message}
        </p>
      )}
      {!navigating ? (
        <>
          <button className="text-button" onClick={onBack}>
            <ArrowLeft size={17} /> Place details
          </button>
          <div className="route-inputs">
            <label>
              <span className="origin-dot" />
              <select
                aria-label="Starting place"
                value={origin}
                onChange={(e) => onOrigin(e.target.value)}
              >
                <option value="gps">Your location</option>
                {data.places
                  .filter(
                    (p) =>
                      (mode === 'driving' || placeHasConnection(data, p)) &&
                      p.id !== destination.id,
                  )
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="origin-connector" />
            <div>
              <Flag size={17} />
              <strong>{destination.name}</strong>
            </div>
          </div>
          {origin === 'gps' && (
            <button className="text-button" onClick={() => onOrigin('gps')}>
              Use current location
            </button>
          )}
          <label className="field-label">
            Travel mode
            <select
              aria-label="Travel mode"
              value={mode}
              onChange={(e) => onMode?.(e.target.value as TravelMode)}
            >
              <option value="walking">Walking</option>
              <option value="driving">Driving + walking</option>
            </select>
          </label>
          {mode === 'driving' && (
            <>
              <label className="field-label">
                Parking or drop-off
                <select
                  aria-label="Parking or drop-off"
                  value={parkingId}
                  onChange={(e) => onParking?.(e.target.value)}
                >
                  <option value="">Suggest fastest complete journey</option>
                  {data.driving?.parking
                    .filter((p) =>
                      vehiclePermitted({
                        access: p.access,
                        review: p.review,
                        direction: 'both',
                      }),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <p className="small-note">
                Campus driving only. Parking availability is not live. Private
                roads require separate driving approval.
              </p>
            </>
          )}
          <div className="walking-heading">
            <Footprints size={20} />
            <span>{mode === 'driving' ? 'Driving + walking' : 'Walking'}</span>
            <span>Campus paths</span>
          </div>
          {busy && <p className="notice">Finding your walking route…</p>}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {routes.map((r, index) => (
            <button
              className={`route-option ${index === chosen ? 'selected' : ''}`}
              key={r.id}
              onClick={() => onChoose(index)}
            >
              <div>
                <Footprints size={20} />
                <strong>{minutes(r.seconds)}</strong>
                <span>{meters(r.distance)}</span>
              </div>
              <p>
                {index === 0
                  ? mode === 'driving'
                    ? 'Fastest estimated journey'
                    : 'Shortest mapped walk'
                  : `Alternative ${index}`}
                {r.legs &&
                  ` via ${r.parkingName}: drive ${minutes(r.legs[0].seconds)}, walk ${minutes(r.legs[1].seconds)}`}
              </p>
              <span className="route-option-radio" />
            </button>
          ))}
          {route && (
            <>
              {usesCampusAccess && mode === 'walking' && (
                <p className="notice">
                  This route uses campus roads open to students. Campus entry
                  rules apply.
                </p>
              )}
              <Button
                className="primary-action"
                onClick={onStart}
                disabled={busy}
              >
                <Navigation size={18} />{' '}
                {mode === 'driving' ? 'Start driving' : 'Start walking'}
              </Button>
              <p className="small-note">
                The first start requests optional compass and motion access. GPS
                works if you decline.
              </p>
              <p className="small-note">
                {mode === 'walking' &&
                  originPlace?.arrivalKind === 'mapped-approach' &&
                  `Start on the mapped path ${originPlace.approachDistance || 0} m from ${originPlace.name}; its entrance link is unverified. `}
                {(destinationRoute.arrivalKind || destination.arrivalKind) ===
                'entrance'
                  ? `Route ends at ${data.entrances?.find((e) => e.id === destinationRoute.destinationEntranceId)?.name || 'a mapped entrance'}.`
                  : `Route ends on a mapped path ${destination.approachDistance || 0} m from the place. The final entrance connection is unverified.`}
              </p>
              {route.startOffset > 10 && (
                <p className="notice">
                  Start on the highlighted path, about{' '}
                  {meters(route.startOffset)} from your location. No route
                  across the unmapped gap is implied.
                </p>
              )}
              {route.legs && (
                <p className="notice">
                  <Car size={16} /> Drive to {route.parkingName}, then park and
                  walk.{' '}
                  {route.estimatedSpeed
                    ? 'ETA uses estimated campus speeds.'
                    : 'ETA uses recorded road speeds; traffic is not included.'}{' '}
                  {
                    data.driving?.parking.find((p) => p.id === route.parkingId)
                      ?.restrictions
                  }
                </p>
              )}
              {mode === 'driving' && (
                <>
                  {drivingReviews.map((review) => (
                    <p className="notice" key={review.id}>
                      Vehicle permission: {review.audience}. {review.summary}
                    </p>
                  ))}
                  {parking?.review && (
                    <p className="notice">
                      Parking permission: {parking.review.audience}.{' '}
                      {parking.review.summary}
                    </p>
                  )}
                </>
              )}
              <h3 className="subheading">Step-by-step directions</h3>
              <ol className="maneuver-list">
                {(route.legs || [route])
                  .flatMap((l) =>
                    l.maneuvers.map((m) => ({ ...m, legMode: l.mode })),
                  )
                  .map((m, i) => (
                    <li key={i}>
                      <TurnIcon kind={m.kind} size={18} />
                      <div>
                        <strong>{m.instruction}</strong>
                        <span>
                          {meters(m.at)} from the{' '}
                          {m.legMode === 'driving' ? 'driving' : 'walking'}{' '}
                          start
                        </span>
                      </div>
                    </li>
                  ))}
              </ol>
            </>
          )}
        </>
      ) : (
        <>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className={`turn-banner ${nav.arrived ? 'arrived' : ''}`}>
            <TurnIcon
              kind={nav.arrived ? 'arrive' : next?.kind || 'straight'}
              size={43}
            />
            <div>
              <strong>
                {nav.arrived
                  ? route.mode === 'driving'
                    ? 'Parking point reached'
                    : 'Mapped route complete'
                  : nav.quality !== 'good'
                    ? 'Waiting for GPS'
                    : meters(Math.max(0, (next?.at || 0) - nav.progress))}
              </strong>
              <span>
                {nav.arrived
                  ? destination.name
                  : nav.quality !== 'good'
                    ? 'Directions paused until location improves'
                    : next?.instruction}
              </span>
            </div>
          </div>
          {nav.arrived && route.mode === 'driving' && (
            <Button className="primary-action" onClick={onParked}>
              Parked—start walking
            </Button>
          )}
          {nav.arrived &&
            route.mode !== 'driving' &&
            (destinationRoute.arrivalKind || destination.arrivalKind) !==
              'entrance' && (
              <p className="notice">
                The building is nearby. Its entrance and the final connection
                still need verification.
              </p>
            )}
          <div className="journey-stats">
            <div>
              <strong>{minutes(remainingSeconds(route, nav.progress))}</strong>
              <span>remaining</span>
            </div>
            <div>
              <strong>
                {meters(Math.max(0, route.distance - nav.progress))}
              </strong>
              <span>to route end</span>
            </div>
            <div>
              <strong>
                {new Date(
                  Date.now() + remainingSeconds(route, nav.progress) * 1000,
                ).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>
              <span>arrival</span>
            </div>
          </div>
          <MotionStatus compact modes fix={fix} following={following} />
          <progress
            className="journey-progress"
            value={nav.progress}
            max={route.distance || 1}
          />
          <div className="button-row navigation-actions">
            <Button variant="outline" onClick={onMute}>
              {muted ? <VolumeX /> : <Volume2 />}
              {muted ? 'Unmute' : 'Mute'}
            </Button>
            <Button variant="outline" onClick={onRepeat} disabled={muted}>
              <RotateCcw /> Repeat
            </Button>
          </div>
          <Button className="primary-action stop-action" onClick={onStop}>
            {nav.arrived ? <Flag /> : <X />}
            {nav.arrived ? 'Finish navigation' : 'Stop navigation'}
          </Button>
          <p className="small-note">
            Keep TurnRight open during navigation. Location stays on your
            device.
          </p>
          <ol className="maneuver-list">
            {route.maneuvers.slice(nav.nextIndex).map((m, i) => (
              <li key={i}>
                <TurnIcon kind={m.kind} size={18} />
                <div>
                  <strong>{m.instruction}</strong>
                  <span>{meters(Math.max(0, m.at - nav.progress))} ahead</span>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
