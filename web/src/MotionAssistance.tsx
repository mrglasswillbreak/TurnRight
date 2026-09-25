import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Marker, type Map as MapInstance } from 'maplibre-gl';
import type { GpsFix } from './types';
import { motionService } from './motion-service';
import { CAMPUS_MIN_ZOOM, followZoom } from './world-map';
import { projectedHeading } from './projected-heading';
import {
  angleDelta,
  cameraDirection,
  travelHeading,
  usableGps,
  type MapOrientationMode,
  type SensorCapability,
} from './motion-model';
import './motion.css';

export function useMotionSession(active: boolean) {
  useEffect(() => (active ? motionService().acquire() : undefined), [active]);
}
function useMotion() {
  const service = motionService();
  return useSyncExternalStore(service.subscribe, service.getSnapshot);
}
// Expire a displayed GPS direction even when sensors are off and GPS stops
// delivering callbacks. This timer updates only the overlay/status consumer.
function useGpsExpiry(fix: GpsFix | null | undefined, age: number) {
  const [expiry, setExpiry] = useState(0);
  const timestamp = fix?.timestamp;
  useEffect(() => {
    if (timestamp === undefined || timestamp + age < Date.now()) return;
    const timer = setTimeout(
      () => setExpiry((value) => value + 1),
      timestamp + age - Date.now() + 1,
    );
    return () => clearTimeout(timer);
  }, [timestamp, age]);
  return expiry;
}
const capability: Record<SensorCapability, string> = {
  inactive: 'Inactive',
  requesting: 'Waiting for permission or readings',
  available: 'Available',
  denied: 'Permission denied',
  unavailable: 'Unavailable on this device',
  missing: 'Readings temporarily missing',
};
const activity = {
  still: 'Likely still',
  moving: 'Motion detected',
  uncertain: 'Uncertain',
};
export function MotionStatus({
  compact = false,
  modes = false,
  fix,
  following = true,
}: {
  compact?: boolean;
  modes?: boolean;
  fix?: GpsFix | null;
  following?: boolean;
}) {
  const state = useMotion();
  useGpsExpiry(fix, 12000);
  const service = motionService();
  const direction = cameraDirection(state.preferences.mode, state.heading, fix);
  const details = (
    <>
      <span className="motion-verification">Awaiting device verification</span>
      <p>
        Compass: {capability[state.orientation]}. Motion sensors:{' '}
        {capability[state.motion]}.
      </p>
      {state.heading && (
        <p>
          Phone direction ≈{Math.round(state.heading.degrees)}° ·{' '}
          {state.heading.reference === 'magnetic'
            ? 'magnetic north'
            : 'absolute orientation'}
          {state.heading.accuracy !== null
            ? ` · reported ±${Math.round(state.heading.accuracy)}°`
            : ' · accuracy not reported'}
        </p>
      )}
      {state.reason && <p>{state.reason}</p>}
      {!state.active && (
        <p>
          Readings run while location tracking, navigation or survey recording
          is active.
        </p>
      )}
      <p className="motion-explanation">
        Purple cone: approximate phone direction. Blue arrow: GPS travel
        direction. Motion hints do not determine your position or whether you
        are walking.
      </p>
      <div className="motion-actions">
        <button
          type="button"
          onClick={() => {
            void service.requestFromGesture(true);
          }}
        >
          Enable/Retry sensors
        </button>
        <button
          type="button"
          disabled={!state.preferences.enabled}
          onClick={service.turnOff}
        >
          Turn off sensors
        </button>
      </div>
      {state.storageError && <p role="alert">{state.storageError}</p>}
    </>
  );
  return (
    <section className="motion-assistance" aria-label="Compass and motion">
      {modes && (
        <label>
          Map orientation
          <select
            aria-label="Map orientation"
            value={state.preferences.mode}
            onChange={(event) =>
              service.setMode(event.target.value as MapOrientationMode)
            }
          >
            <option value="travel">Travel-up</option>
            <option value="north">North-up</option>
            <option value="phone">Phone-up</option>
          </select>
        </label>
      )}
      <div className="motion-summary" data-motion-activity={state.activity}>
        <strong>
          {state.preferences.enabled
            ? `Motion: ${activity[state.activity]}`
            : 'Compass & motion off'}
        </strong>
        <span>
          {state.heading
            ? 'Approximate compass available'
            : 'GPS remains the position source'}
        </span>
      </div>
      {modes && following && direction.fallback && (
        <output>{direction.fallback}</output>
      )}
      {modes && !following && (
        <p>Map following paused. Use Follow me to restore it.</p>
      )}
      {compact ? (
        <details>
          <summary>Compass & motion controls</summary>
          {details}
        </details>
      ) : (
        details
      )}
    </section>
  );
}

/** This subscription is confined to the map overlay; it cannot rerender the app
 * or change navigation/survey state. Markers are display-only HTML overlays. */
export function MotionMap({
  map,
  fix,
  follow = false,
  active = false,
  survey = false,
  driving = false,
}: {
  map: MapInstance;
  fix?: GpsFix | null;
  follow?: boolean;
  active?: boolean;
  survey?: boolean;
  driving?: boolean;
}) {
  const state = useMotion();
  const expiry = useGpsExpiry(fix, survey ? 10000 : 12000);
  const markers = useRef<{ phone: Marker; travel: Marker } | null>(null);
  const camera = useRef({
    following: false,
    timestamp: -1,
    hadPosition: false,
    recoveringZoom: false,
    lastBearingUpdate: -Infinity,
  });
  useEffect(() => {
    camera.current = {
      following: false,
      timestamp: -1,
      hadPosition: false,
      recoveringZoom: false,
      lastBearingUpdate: -Infinity,
    };
    const element = (kind: 'phone' | 'travel') => {
      const e = document.createElement('div');
      e.className = `motion-marker motion-${kind}`;
      e.setAttribute('aria-hidden', 'true');
      e.innerHTML =
        kind === 'phone'
          ? '<svg width="72" height="72" viewBox="0 0 72 72"><path d="M36 36 L16 3 Q36 -3 56 3 Z" fill="#985cd9" fill-opacity=".3" stroke="#985cd9" stroke-width="1.5"/></svg>'
          : '<svg width="32" height="32" viewBox="0 0 32 32"><path d="M16 1 L22 12 L16 9 L10 12 Z" fill="#1764ed" stroke="white" stroke-width="1.5"/></svg>';
      e.style.display = 'none';
      return new Marker({
        element: e,
        rotationAlignment: 'map',
        pitchAlignment: 'map',
        opacityWhenCovered: 0,
      })
        .setLngLat([0, 0])
        .addTo(map);
    };
    markers.current = { phone: element('phone'), travel: element('travel') };
    return () => {
      markers.current?.phone.remove();
      markers.current?.travel.remove();
      markers.current = null;
    };
  }, [map]);
  useEffect(() => {
    const overlay = markers.current;
    if (!overlay) return;
    const valid = usableGps(
      fix,
      Date.now(),
      survey ? 15 : 35,
      survey ? 10000 : 12000,
    );
    const phone = active ? state.heading : null;
    const travel = valid ? travelHeading(fix) : null;
    overlay.phone.getElement().style.display = valid && phone ? '' : 'none';
    overlay.travel.getElement().style.display =
      valid && travel !== null ? '' : 'none';
    if (valid && fix) {
      if (phone) overlay.phone.setLngLat(fix.coordinates);
      if (travel !== null) overlay.travel.setLngLat(fix.coordinates);
    }
    if (survey) return; // Survey recording owns GPS following; review never follows sensors.
    const previous = camera.current;
    const beganFollowing = follow && !previous.following;
    previous.following = follow && valid && !!fix;
    if (!follow) previous.recoveringZoom = false;
    if (!follow || !valid || !fix) return;
    const direction = cameraDirection(state.preferences.mode, phone, fix);
    const recenter = beganFollowing || fix.timestamp !== previous.timestamp;
    const bearingChanged =
      direction.bearing !== null &&
      Math.abs(angleDelta(map.getBearing(), direction.bearing)) > 1;
    const now = performance.now();
    if (
      recenter ||
      (bearingChanged && now - previous.lastBearingUpdate >= 100)
    ) {
      const zoom = driving
        ? beganFollowing
          ? 16.5
          : undefined
        : followZoom(
            map.getZoom(),
            previous.hadPosition,
            beganFollowing,
            previous.recoveringZoom,
          );
      // New fixes can arrive before the return flight finishes. Continue its
      // target zoom until reached, rather than freezing at an intermediate zoom.
      previous.recoveringZoom = zoom !== undefined;
      map.easeTo({
        ...(recenter ? { center: fix.coordinates } : {}),
        ...(zoom !== undefined ? { zoom } : {}),
        ...(direction.bearing !== null ? { bearing: direction.bearing } : {}),
        duration: 250,
      });
      previous.timestamp = fix.timestamp;
      previous.hadPosition = true;
      previous.lastBearingUpdate = now;
    }
  }, [map, fix, follow, active, survey, driving, state, expiry]);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = 0;
      const overlay = markers.current;
      if (!overlay || !fix) return;
      const world = !survey && map.getZoom() < CAMPUS_MIN_ZOOM;
      for (const [marker, degrees] of [
        [overlay.phone, active ? (state.heading?.degrees ?? null) : null],
        [overlay.travel, travelHeading(fix)],
      ] as const) {
        if (degrees === null) continue;
        const rotation = world
          ? projectedHeading(fix.coordinates, degrees, (p) => map.project(p))
          : degrees;
        const alignment = world ? 'viewport' : 'map';
        if (marker.getRotationAlignment() !== alignment)
          marker.setRotationAlignment(alignment);
        if (marker.getPitchAlignment() !== alignment)
          marker.setPitchAlignment(alignment);
        if (rotation !== null) {
          if (marker.getRotation() !== rotation) marker.setRotation(rotation);
          marker.getElement().style.display = usableGps(
            fix,
            Date.now(),
            survey ? 15 : 35,
            survey ? 10000 : 12000,
          )
            ? ''
            : 'none';
        } else marker.getElement().style.display = 'none';
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    schedule();
    map.on('move', schedule);
    return () => {
      cancelAnimationFrame(frame);
      map.off('move', schedule);
    };
  }, [map, fix, active, survey, state.heading]);
  return null;
}
