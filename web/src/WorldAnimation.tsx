import { useEffect, useRef, useState } from 'react';
import type { Map as MapInstance } from 'maplibre-gl';
import { worldClouds } from './world-clouds';
import { worldStars, spaceOpacity } from './world-stars';
import { globeCamera } from './world-camera';
import { globeRotationSpeed, mayRotateGlobe } from './world-motion';
import './world-animation.css';

const key = 'turnright:world-animation';
function preferences() {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      rotation:
        typeof value.rotation === 'boolean'
          ? value.rotation
          : !matchMedia('(prefers-reduced-motion: reduce)').matches,
      clouds: value.clouds !== false,
      stars: value.stars !== false,
    };
  } catch {
    return { rotation: false, clouds: true, stars: true };
  }
}
export default function WorldAnimation({
  map,
  blocked,
}: {
  map: MapInstance;
  blocked: boolean;
}) {
  const [settings, setSettings] = useState(preferences);
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [error, setError] = useState(false);
  const [starError, setStarError] = useState(false);
  const wakeAnimation = useRef(() => {});
  const clouds = useRef({
    time: 0,
    enabled: settings.clouds,
    zoom: map.getZoom(),
  });
  const latest = useRef({ ...settings, blocked, reduced, error });
  latest.current = { ...settings, blocked, reduced, error };
  useEffect(() => {
    let height = map.getContainer().clientHeight,
      frame = 0;
    const resize = () => {
      const next = map.getContainer().clientHeight;
      if (next < height && map.getZoom() < 5) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const fit = globeCamera(map);
          map.jumpTo({
            ...fit,
            zoom: Math.min(map.getZoom(), fit.zoom),
            pitch: 0,
            roll: 0,
          });
        });
      }
      height = next;
    };
    map.on('resize', resize);
    return () => {
      cancelAnimationFrame(frame);
      map.off('resize', resize);
    };
  }, [map]);
  useEffect(() => {
    let layer = worldStars(() => latest.current.stars, setStarError);
    const install = () => {
      if (!map.getLayer('world-ocean') || map.getLayer(layer.id)) return;
      try {
        map.addLayer(layer, 'world-ocean');
      } catch {
        setStarError(true);
      }
    };
    const restore = () => {
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      layer = worldStars(() => latest.current.stars, setStarError);
      setStarError(false);
      install();
    };
    const background = () =>
      map
        .getContainer()
        .style.setProperty('--space', `${spaceOpacity(map.getZoom()) * 100}%`);
    background();
    map.on('zoom', background);
    map.on('styledata', install);
    map.on('webglcontextrestored', restore);
    install();
    return () => {
      map.off('zoom', background);
      map.off('styledata', install);
      map.off('webglcontextrestored', restore);
      map.getContainer().style.removeProperty('--space');
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    };
  }, [map]);
  useEffect(() => {
    wakeAnimation.current();
  }, [settings, blocked, reduced, error]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(settings));
    } catch {
      /* Preference persistence is optional. */
    }
    clouds.current.enabled = settings.clouds;
    map.triggerRepaint();
  }, [settings, map]);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => {
      setReduced(query.matches);
      if (query.matches) setSettings((old) => ({ ...old, rotation: false }));
    };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const state = clouds.current;
    let frame = 0,
      previous = performance.now(),
      lastPaint = previous,
      lastInteraction = previous,
      ownMove = false;
    const held = new Set<number>();
    const interaction = () => {
      lastInteraction = performance.now();
      wake();
    };
    const movement = () => {
      if (!ownMove) interaction();
    };
    const down = (event: PointerEvent) => {
      held.add(event.pointerId);
      interaction();
    };
    const up = (event: PointerEvent) => {
      held.delete(event.pointerId);
      interaction();
    };
    let layer = worldClouds(state, () => setError(true));
    const install = () => {
      if (!map.getLayer('world-country-labels') || map.getLayer(layer.id))
        return;
      try {
        map.addLayer(layer, 'world-country-labels');
      } catch {
        setError(true);
      }
    };
    const tick = (now: number) => {
      frame = 0;
      const dt = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      const current = latest.current;
      state.zoom = map.getZoom();
      state.enabled = current.clouds;
      if (document.hidden) return;
      install();
      const input =
        document.activeElement?.matches(
          'input, textarea, select, [contenteditable=true]',
        ) || false;
      if (current.blocked || input) lastInteraction = now;
      if (
        mayRotateGlobe({
          enabled: current.rotation,
          blocked: current.blocked || input || held.size > 0,
          hidden: document.hidden,
          moving: map.isMoving(),
          lastInteraction,
          now,
          zoom: state.zoom,
        })
      ) {
        const centre = map.getCenter();
        ownMove = true;
        map.jumpTo({
          center: [
            centre.lng - globeRotationSpeed(state.zoom) * dt,
            centre.lat,
          ],
        });
        ownMove = false;
      }
      if (
        current.clouds &&
        !current.error &&
        !current.reduced &&
        state.zoom < 6
      ) {
        state.time += dt;
        if (now - lastPaint >= 33) {
          map.triggerRepaint();
          lastPaint = now;
        }
      }
      if (
        (current.clouds &&
          !current.error &&
          !current.reduced &&
          state.zoom < 6) ||
        (current.rotation && !current.blocked && state.zoom < 5)
      )
        frame = requestAnimationFrame(tick);
    };
    function wake() {
      state.enabled = latest.current.clouds;
      state.zoom = map.getZoom();
      if (!frame && !document.hidden) {
        previous = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }
    const canvas = map.getCanvasContainer();
    const restore = () => {
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      layer = worldClouds(state, () => setError(true));
      setError(false);
      install();
      wake();
    };
    map.on('webglcontextrestored', restore);
    wakeAnimation.current = interaction;
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    for (const event of ['pointerdown', 'pointermove', 'wheel', 'keydown'])
      canvas.addEventListener(event, interaction, { passive: true });
    map.on('movestart', movement);
    map.on('moveend', movement);
    map.on('zoom', wake);
    map.on('idle', install);
    document.addEventListener('visibilitychange', interaction);
    install();
    wake();
    return () => {
      cancelAnimationFrame(frame);
      wakeAnimation.current = () => {};
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      for (const event of ['pointerdown', 'pointermove', 'wheel', 'keydown'])
        canvas.removeEventListener(event, interaction);
      map.off('movestart', movement);
      map.off('moveend', movement);
      map.off('zoom', wake);
      map.off('idle', install);
      map.off('webglcontextrestored', restore);
      document.removeEventListener('visibilitychange', interaction);
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    };
  }, [map]);
  return (
    <div className="world-animation-controls" aria-label="Globe animation">
      <button
        aria-pressed={settings.rotation}
        onClick={() =>
          setSettings((old) => ({ ...old, rotation: !old.rotation }))
        }
      >
        {settings.rotation ? 'Pause rotation' : 'Rotate globe'}
      </button>
      <button
        aria-pressed={settings.clouds}
        disabled={error}
        title="Decorative clouds, not live weather"
        onClick={() => setSettings((old) => ({ ...old, clouds: !old.clouds }))}
      >
        {settings.clouds ? 'Hide clouds' : 'Show clouds'}
      </button>
      {error && <output>Clouds unavailable</output>}
      <button
        aria-pressed={settings.stars}
        disabled={starError}
        title="Decorative stars follow the globe's viewing direction"
        onClick={() => setSettings((old) => ({ ...old, stars: !old.stars }))}
      >
        {settings.stars ? 'Hide stars' : 'Show stars'}
      </button>
      {starError && <output>Stars unavailable</output>}
      {reduced && (
        <span className="sr-only">
          Cloud motion is disabled by your reduced-motion preference.
        </span>
      )}
    </div>
  );
}
