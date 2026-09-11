import { placeHasConnection } from "./routing";
import {
  ArrowLeft,
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Footprints,
  Navigation,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { meters, minutes } from "./geo";
import type { NavigationState } from "./navigation";
import type { CampusData, ManeuverKind, Place, Route } from "./types";
export function TurnIcon({ kind, size = 26 }: { kind: ManeuverKind; size?: number }) {
  const Icon = kind.includes("left")
    ? CornerUpLeft
    : kind.includes("right")
      ? CornerUpRight
      : kind === "uturn"
        ? RotateCcw
        : kind === "arrive"
          ? Flag
          : ArrowUp;
  return <Icon size={size} />;
}
export function RoutePanel({
  data,
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
}: {
  data: CampusData;
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
}) {
  const route = routes[chosen];
  const routeEdges = new Set(route?.edgeIds || []);
  const usesCampusAccess = data.graph.edges.some((edge) =>
    edge.walkingAccess === "campus" && routeEdges.has(edge.id));
  const originPlace = data.places.find((p) => p.id === origin);
  const next = route?.maneuvers[nav.nextIndex] || route?.maneuvers.at(-1);
  return (
    <div className="route-panel">
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
                  .filter((p) => placeHasConnection(data, p) && p.id !== destination.id)
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
          {origin === "gps" && (
            <button className="text-button" onClick={() => onOrigin("gps")}>
              Use current location
            </button>
          )}
          <div className="walking-heading">
            <Footprints size={20} />
            <span>Walking</span>
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
              className={`route-option ${index === chosen ? "selected" : ""}`}
              key={r.id}
              onClick={() => onChoose(index)}
            >
              <div>
                <Footprints size={20} />
                <strong>{minutes(r.seconds)}</strong>
                <span>{meters(r.distance)}</span>
              </div>
              <p>{index === 0 ? "Shortest mapped walk" : `Alternative ${index}`}</p>
              <span className="route-option-radio" />
            </button>
          ))}
          {route && (
            <>
              {usesCampusAccess && (
                <p className="notice">This route uses campus roads open to students. Campus entry rules apply.</p>
              )}
              <Button className="primary-action" onClick={onStart} disabled={busy}>
                <Navigation size={18} /> Start walking
              </Button>
              <p className="small-note">
                {originPlace?.arrivalKind === "mapped-approach" &&
                  `Start on the mapped path ${originPlace.approachDistance || 0} m from ${originPlace.name}; its entrance link is unverified. `}
                {(route.arrivalKind || destination.arrivalKind) === "entrance"
                  ? `Route ends at ${data.entrances?.find((e) => e.id === route.destinationEntranceId)?.name || "a mapped entrance"}.`
                  : `Route ends on a mapped path ${destination.approachDistance || 0} m from the place. The final entrance connection is unverified.`}
              </p>
              {route.startOffset > 10 && (
                <p className="notice">
                  Start on the highlighted path, about {meters(route.startOffset)} from your
                  location. No route across the unmapped gap is implied.
                </p>
              )}
              <h3 className="subheading">Step-by-step directions</h3>
              <ol className="maneuver-list">
                {route.maneuvers.map((m, i) => (
                  <li key={i}>
                    <TurnIcon kind={m.kind} size={18} />
                    <div>
                      <strong>{m.instruction}</strong>
                      <span>{meters(m.at)} from the start</span>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      ) : (
        <>
          <div className={`turn-banner ${nav.arrived ? "arrived" : ""}`}>
            <TurnIcon kind={nav.arrived ? "arrive" : next?.kind || "straight"} size={43} />
            <div>
              <strong>
                {nav.arrived
                  ? "Mapped route complete"
                  : nav.quality !== "good"
                    ? "Waiting for GPS"
                    : meters(Math.max(0, (next?.at || 0) - nav.progress))}
              </strong>
              <span>
                {nav.arrived
                  ? destination.name
                  : nav.quality !== "good"
                    ? "Directions paused until location improves"
                    : next?.instruction}
              </span>
            </div>
          </div>
          {nav.arrived && (route.arrivalKind || destination.arrivalKind) !== "entrance" && (
            <p className="notice">
              The building is nearby. Its entrance and the final connection still need verification.
            </p>
          )}
          <div className="journey-stats">
            <div>
              <strong>{minutes(Math.max(0, route.seconds - nav.progress / 1.25))}</strong>
              <span>remaining</span>
            </div>
            <div>
              <strong>{meters(Math.max(0, route.distance - nav.progress))}</strong>
              <span>to route end</span>
            </div>
            <div>
              <strong>
                {new Date(
                  Date.now() + Math.max(0, route.seconds - nav.progress / 1.25) * 1000,
                ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </strong>
              <span>arrival</span>
            </div>
          </div>
          <progress className="journey-progress" value={nav.progress} max={route.distance || 1} />
          <div className="button-row navigation-actions">
            <Button variant="outline" onClick={onMute}>
              {muted ? <VolumeX /> : <Volume2 />}
              {muted ? "Unmute" : "Mute"}
            </Button>
            <Button variant="outline" onClick={onRepeat}>
              <RotateCcw /> Repeat
            </Button>
          </div>
          <Button className="primary-action stop-action" onClick={onStop}>
            {nav.arrived ? <Flag /> : <X />}
            {nav.arrived ? "Finish walk" : "Stop navigation"}
          </Button>
          <p className="small-note">
            Keep TurnRight open while walking. Location stays on your device.
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
