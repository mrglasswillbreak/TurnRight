import { useEffect, useRef, useState } from 'react';
import { Check, Globe2, MapPin, Search } from 'lucide-react';
import type { Map as MapInstance, MapLayerMouseEvent } from 'maplibre-gl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { loadCampusCatalogue } from './campus-catalogue';
import { frameGlobe } from './world-camera';
import { returnToCampus } from './world-map';
import { publicMapPadding } from './public-map-layout';
import {
  campusUrl,
  lasuCampus,
  requestedCampus,
  type CampusIdentity,
} from './campus-context';

export default function CampusSwitcher({
  map,
  navigating = false,
  onStop,
  bounds,
  onOpenChange,
  onBrowse,
}: {
  map: MapInstance | null;
  navigating?: boolean;
  onStop: () => Promise<void>;
  bounds: CampusIdentity['bounds'];
  onOpenChange: (open: boolean) => void;
  onBrowse: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const callbacks = useRef({ onOpenChange, onBrowse, bounds });
  callbacks.current = { onOpenChange, onBrowse, bounds };
  const [campuses, setCampuses] = useState<CampusIdentity[]>([lasuCampus]),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [choice, setChoice] = useState<CampusIdentity | null>(null);
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const style = document.documentElement.style;
    const resize = () => {
      style.setProperty(
        '--campus-visible-height',
        `${viewport?.height ?? innerHeight}px`,
      );
      style.setProperty(
        '--campus-keyboard-offset',
        `${Math.max(0, innerHeight - (viewport?.height ?? innerHeight) - (viewport?.offsetTop ?? 0))}px`,
      );
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
      style.removeProperty('--campus-visible-height');
      style.removeProperty('--campus-keyboard-offset');
    };
  }, [open]);
  useEffect(() => {
    callbacks.current.onOpenChange(open);
    if (navigating || !map) return;
    if (!open) {
      let frame = 0;
      const refresh = () => {
        frame = requestAnimationFrame(() => {
          if (map.getZoom() < 12 && !map.isMoving())
            map.setPadding(publicMapPadding(map.getContainer(), true));
        });
      };
      if (map.isMoving()) map.once('moveend', refresh);
      else refresh();
      return () => {
        cancelAnimationFrame(frame);
        map.off('moveend', refresh);
      };
    }
    let framed = false,
      frame = 0;
    const attempt = () => {
      if (
        framed ||
        !map.getLayer('world-country-labels') ||
        map.getMinZoom() > 0
      )
        return;
      framed = true;
      callbacks.current.onBrowse();
      const b = callbacks.current.bounds;
      frameGlobe(map, [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]);
    };
    // Wait for the dialog layout and for a pending world install to complete.
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(attempt);
    };
    schedule();
    map.on('styledata', schedule);
    map.on('idle', schedule);
    return () => {
      cancelAnimationFrame(frame);
      map.off('styledata', schedule);
      map.off('idle', schedule);
    };
  }, [open, map, navigating]);
  useEffect(() => {
    void loadCampusCatalogue()
      .then((c) => setCampuses(c.campuses))
      .catch((e) => setError(e.message));
  }, []);
  const choose = (campus: CampusIdentity) => {
    if (campus.slug === requestedCampus()) {
      setOpen(false);
      setChoice(null);
      if (map && !navigating) returnToCampus(map, callbacks.current.bounds);
      return;
    }
    if (navigating) {
      setChoice(campus);
      setOpen(true);
      return;
    }
    location.assign(campusUrl('/', campus.slug));
  };
  useEffect(() => {
    if (!map) return;
    const install = () => {
      if (map.getSource('published-campuses')) return;
      map.addSource('published-campuses', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: campuses.map((c) => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [
                (c.bounds[0][0] + c.bounds[1][0]) / 2,
                (c.bounds[0][1] + c.bounds[1][1]) / 2,
              ],
            },
            properties: { id: c.id, name: c.name },
          })),
        },
      });
      map.addLayer({
        id: 'published-campus-pins',
        type: 'circle',
        source: 'published-campuses',
        maxzoom: 12,
        paint: {
          'circle-radius': 7,
          'circle-color': '#0d9488',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'published-campus-labels',
        type: 'symbol',
        source: 'published-campuses',
        minzoom: 3,
        maxzoom: 12,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-offset': [0, 1.6],
          'text-font': ['Open Sans Semibold'],
        },
        paint: {
          'text-color': '#0f766e',
          'text-halo-color': '#fff',
          'text-halo-width': 1.5,
        },
      });
    };
    const click = (e: MapLayerMouseEvent) => {
      const campus = campuses.find(
        (c) => c.id === e.features?.[0].properties?.id,
      );
      if (campus) {
        setChoice(campus);
        setOpen(true);
      }
    };
    if (map.isStyleLoaded()) install();
    else map.once('load', install);
    map.on('click', 'published-campus-pins', click);
    return () => {
      map.off('load', install);
      map.off('click', 'published-campus-pins', click);
      if (map.getLayer('published-campus-labels'))
        map.removeLayer('published-campus-labels');
      if (map.getLayer('published-campus-pins'))
        map.removeLayer('published-campus-pins');
      if (map.getSource('published-campuses'))
        map.removeSource('published-campuses');
    };
  }, [map, campuses]);
  return (
    <>
      <Button
        ref={trigger}
        className="public-campus-switcher"
        variant="outline"
        aria-label="Choose a campus"
        title="Choose a campus"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Globe2 size={20} />
        <span className="sr-only">Campuses</span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setChoice(null);
        }}
      >
        <DialogContent
          positioning="viewport"
          className="campus-chooser rounded-xl"
          data-campus-open={open}
          initialFocus={() =>
            matchMedia('(max-width: 599px)').matches ? title.current : true
          }
          finalFocus={trigger}
          overlayClassName="campus-chooser-backdrop"
        >
          <DialogHeader>
            <DialogTitle ref={title} tabIndex={-1}>
              Choose a campus
            </DialogTitle>
            <DialogDescription>
              Explore published maps. Each campus has its own places, routes and
              offline download.
            </DialogDescription>
          </DialogHeader>
          <label className="campus-public-search">
            <Search size={17} />
            <input
              type="search"
              aria-label="Search published campuses"
              placeholder="Search campus names"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {error && <output>{error}</output>}
          <div className="campus-public-list">
            {campuses
              .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
              .map((c) => (
                <Button
                  key={c.id}
                  variant="ghost"
                  className="campus-public-option"
                  onClick={() => choose(c)}
                >
                  <MapPin size={18} />
                  <span>{c.name}</span>
                  {c.slug === requestedCampus() && <Check size={17} />}
                </Button>
              ))}
          </div>
          {choice && (
            <div className="campus-public-confirm">
              <p>
                {navigating ? 'Stop directions and open' : 'Open'}{' '}
                <strong>{choice.name}</strong>?
              </p>
              <Button
                onClick={() =>
                  void (async () => {
                    if (choice.slug === requestedCampus()) {
                      choose(choice);
                      return;
                    }
                    if (navigating) await onStop();
                    location.assign(campusUrl('/', choice.slug));
                  })()
                }
              >
                {navigating ? 'Stop and switch campus' : 'Open campus'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
